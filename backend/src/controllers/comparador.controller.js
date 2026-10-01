// backend/src/controllers/comparador.controller.js
//
// Comparador de backups: recibe un .zip de backup y lo confronta contra la
// base actual, colección por colección, mostrando qué se creó, qué se borró y
// qué cambió campo por campo.
//
// Por qué existe: cuando aparecieron objetivos duplicados y pesos cambiados en
// un año fiscal ya cerrado, reconstruir qué había pasado llevó horas de
// scripts. La auditoría dice quién tocó qué, pero no alcanza: no registra el
// id de los documentos creados, y las bajas de overrides no dejaban rastro.
// Un diff contra un backup conocido responde la pregunta de una.
//
// El zip NO se toca ni se importa: solo se lee en memoria. Esto es una
// herramienta de lectura, no de restauración.

import AdmZip from "adm-zip";
import mongoose from "mongoose";

/** Colecciones que tiene sentido comparar, con su clave legible. */
const COLECCIONES = {
  plantillas: { etiqueta: "Objetivos y competencias", titulo: (d) => d.nombre },
  overrideobjetivos: { etiqueta: "Asignaciones y exclusiones", titulo: (d) => `override ${d.excluido ? "exclusión" : `peso ${d.peso ?? "base"}`}` },
  evaluacions: { etiqueta: "Evaluaciones", titulo: (d) => `${d.periodo}` },
  feedbacks: { etiqueta: "Feedbacks", titulo: (d) => `${d.periodo} (${d.estado})` },
  empleados: { etiqueta: "Empleados", titulo: (d) => `${d.apellido} ${d.nombre}` },
  usuarios: { etiqueta: "Usuarios", titulo: (d) => d.email },
};

// Campos que cambian solos y solo hacen ruido en el diff.
const IGNORAR = new Set(["__v", "updatedAt"]);

/** La hora real de inserción va en el ObjectId; el cliente no puede falsearla. */
const insertadoEl = (id) => {
  try { return new Date(parseInt(String(id).slice(0, 8), 16) * 1000); } catch { return null; }
};

/** Normaliza para comparar: fechas y ObjectId a string, sin campos ruidosos. */
function normalizar(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof mongoose.Types.ObjectId) return String(v);
  if (Array.isArray(v)) return v.map(normalizar);
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (IGNORAR.has(k)) continue;
      out[k] = normalizar(v[k]);
    }
    return out;
  }
  // Una fecha ISO en el JSON del backup y un Date en la base son lo mismo.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(+d)) return d.toISOString();
  }
  return v;
}

const igual = (a, b) => JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));

/** Diferencias campo por campo entre dos documentos. */
function camposDistintos(a, b) {
  const claves = new Set([...Object.keys(a || {}), ...Object.keys(b || {})].filter((k) => !IGNORAR.has(k)));
  const out = [];
  for (const k of claves) {
    if (igual(a?.[k], b?.[k])) continue;
    out.push({
      campo: k,
      antes: normalizar(a?.[k]),
      ahora: normalizar(b?.[k]),
    });
  }
  return out;
}

/** Resumen corto y legible de un cambio, para la vista compacta. */
function resumirCambio(campo, antes, ahora) {
  const corto = (v) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return Array.isArray(v) ? `[${v.length} elementos]` : "{…}";
    return String(v).slice(0, 60);
  };
  return `${campo}: ${corto(antes)} → ${corto(ahora)}`;
}

export async function compararBackup(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Falta el archivo .zip del backup" });
    }

    const pedidas = String(req.query.colecciones || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const objetivo = pedidas.length ? pedidas : Object.keys(COLECCIONES);

    let zip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      return res.status(400).json({ message: "El archivo no es un .zip válido" });
    }

    const entradas = new Map();
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const nombre = e.entryName.split("/").pop();
      if (!nombre.endsWith(".json")) continue;
      entradas.set(nombre.replace(/\.json$/, ""), e);
    }
    if (!entradas.size) {
      return res.status(400).json({ message: "El zip no contiene archivos .json de backup" });
    }

    const db = mongoose.connection.db;
    const resultado = [];

    for (const col of objetivo) {
      const meta = COLECCIONES[col];
      const entrada = entradas.get(col);
      if (!meta || !entrada) continue;

      let backup;
      try {
        backup = JSON.parse(entrada.getData().toString("utf8"));
      } catch {
        resultado.push({ coleccion: col, etiqueta: meta.etiqueta, error: "JSON ilegible" });
        continue;
      }
      if (!Array.isArray(backup)) continue;

      const actual = await db.collection(col).find({}).toArray();
      const mapaActual = new Map(actual.map((d) => [String(d._id), d]));
      const mapaBackup = new Map(backup.map((d) => [String(d._id), d]));

      const creados = [];
      const borrados = [];
      const modificados = [];

      for (const [id, doc] of mapaActual) {
        if (mapaBackup.has(id)) continue;
        creados.push({
          _id: id,
          titulo: meta.titulo(doc) || id,
          insertadoEl: insertadoEl(id),
          // Si createdAt no coincide con la hora real del _id, fue copiado.
          fechaFalseada: doc.createdAt
            ? Math.abs(new Date(doc.createdAt) - insertadoEl(id)) > 86400000
            : false,
          doc: normalizar(doc),
        });
      }

      for (const [id, doc] of mapaBackup) {
        if (mapaActual.has(id)) continue;
        borrados.push({
          _id: id,
          titulo: meta.titulo(doc) || id,
          insertadoEl: insertadoEl(id),
          doc: normalizar(doc),
        });
      }

      for (const [id, docA] of mapaBackup) {
        const docB = mapaActual.get(id);
        if (!docB) continue;
        const diffs = camposDistintos(docA, docB);
        if (!diffs.length) continue;
        modificados.push({
          _id: id,
          titulo: meta.titulo(docB) || id,
          cambios: diffs,
          resumen: diffs.slice(0, 4).map((d) => resumirCambio(d.campo, d.antes, d.ahora)),
        });
      }

      const orden = (a, b) => String(a.titulo).localeCompare(String(b.titulo), "es");
      creados.sort(orden); borrados.sort(orden); modificados.sort(orden);

      resultado.push({
        coleccion: col,
        etiqueta: meta.etiqueta,
        totalBackup: backup.length,
        totalActual: actual.length,
        creados,
        borrados,
        modificados,
      });
    }

    res.json({
      archivo: req.file.originalname,
      tamanio: req.file.size,
      generado: new Date(),
      colecciones: resultado,
    });
  } catch (err) {
    console.error("compararBackup error:", err);
    res.status(500).json({ message: "Error comparando el backup" });
  }
}

/** Colecciones que se pueden comparar, para armar el selector del front. */
export function coleccionesComparables(req, res) {
  res.json(
    Object.entries(COLECCIONES).map(([id, m]) => ({ id, etiqueta: m.etiqueta }))
  );
}
