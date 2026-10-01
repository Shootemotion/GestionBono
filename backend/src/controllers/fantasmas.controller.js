// backend/src/controllers/fantasmas.controller.js
//
// Detector de objetivos "fantasma": plantillas que le aparecen a la gente pero
// que nunca se evaluaron, casi siempre por una clonación mal hecha.
//
// De dónde sale esto: en enero de 2026 se clonaron objetivos del sector
// Analítica y los clones quedaron con alcance de sector. Una sola plantilla mal
// clonada le aparece a las 10 personas del sector a la vez, sin datos, y les
// infla la suma de pesos (varios quedaron en 250%). Como el clon copiaba el
// `createdAt` del original, por fecha eran indistinguibles.
//
// CRITERIO (deliberadamente conservador — esto alimenta un borrado):
//   Es candidata si NO tiene ninguna evaluación con un resultado cargado.
//   Eso es un hecho verificable, no una heurística.
//
// El "gemelo" —otra plantilla del mismo año y alcance con nombre parecido que
// SÍ tiene datos— se informa como evidencia de que fue una duplicación, pero
// NO forma parte del criterio: hay objetivos legítimamente sin cargar todavía,
// y el que decide es quien mira la pantalla.

import mongoose from "mongoose";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import Empleado from "../models/Empleado.model.js";
import Area from "../models/Area.model.js";
import Sector from "../models/Sector.model.js";
import Auditoria from "../models/Auditoria.model.js";
import { generarHitos } from "../utils/generarHitos.js";

/**
 * Períodos que cubre la plantilla y su rango de fechas. Es lo que permite ver
 * de un vistazo a qué parte del año fiscal corresponde cada objetivo: dos
 * plantillas de nombre casi igual pueden cubrir períodos distintos, y ahí no
 * son duplicados sino tramos diferentes.
 */
function periodosDe(p) {
  let hitos = [];
  try { hitos = generarHitos(p) || []; } catch { hitos = []; }
  const periodos = hitos.map((h) => h.periodo).filter(Boolean);
  return {
    frecuencia: p.frecuencia || null,
    cantidad: periodos.length,
    primero: periodos[0] || null,
    ultimo: periodos[periodos.length - 1] || null,
    periodos,
    fechaLimite: p.fechaLimite || null,
    fechaCierreCustom: p.fechaCierreCustom || null,
  };
}

/** Hora real de inserción: va en los primeros 4 bytes del ObjectId y, a
 *  diferencia de `createdAt`, el cliente no la puede falsear. */
const insertadoEl = (id) => new Date(parseInt(String(id).slice(0, 8), 16) * 1000);

/** Normaliza para comparar nombres: sin acentos, sin espacios repetidos. */
const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Similitud por palabras compartidas (Jaccard). Simple y suficiente acá. */
function similitud(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 3));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / new Set([...A, ...B]).size;
}

export async function listarFantasmas(req, res) {
  try {
    const anio = Number(req.query.anio);
    if (!anio || Number.isNaN(anio)) {
      return res.status(400).json({ message: "Parámetro 'anio' requerido" });
    }

    const [plantillas, evals, empleados, areas, sectores] = await Promise.all([
      Plantilla.find({ year: anio }).lean(),
      Evaluacion.find({}, "empleado plantillaId metasResultados").lean(),
      Empleado.find({ estadoLaboral: "VINCULADO" }, "nombre apellido area sector").lean(),
      Area.find({}, "nombre").lean(),
      Sector.find({}, "nombre").lean(),
    ]);

    // Cuántas evaluaciones tiene cada plantilla y cuántas traen un dato real.
    const stats = new Map();
    for (const ev of evals) {
      const k = String(ev.plantillaId);
      if (!stats.has(k)) stats.set(k, { total: 0, conDato: 0, empleados: new Set() });
      const s = stats.get(k);
      s.total++;
      s.empleados.add(String(ev.empleado));
      if ((ev.metasResultados || []).some((m) => m.resultado !== null && m.resultado !== undefined)) {
        s.conDato++;
      }
    }

    const nombreArea = new Map(areas.map((a) => [String(a._id), a.nombre]));
    const nombreSector = new Map(sectores.map((s) => [String(s._id), s.nombre]));
    const alcanceDe = (p) => {
      const id = String(p.scopeId || "");
      if (p.scopeType === "sector") return nombreSector.get(id) || "(sector desconocido)";
      if (p.scopeType === "area") return nombreArea.get(id) || "(área desconocida)";
      if (p.scopeType === "empleado" || p.scopeType === "employee") {
        const e = empleados.find((x) => String(x._id) === id);
        return e ? `${e.apellido} ${e.nombre}` : "(empleado desconocido)";
      }
      return "Global";
    };
    // A cuánta gente le aparece. Es la métrica que explica por qué un solo
    // error mal clonado se ve como diez.
    const alcanza = (p) => {
      const id = String(p.scopeId || "");
      if (p.scopeType === "sector") return empleados.filter((e) => String(e.sector) === id).length;
      if (p.scopeType === "area") return empleados.filter((e) => String(e.area) === id).length;
      if (p.scopeType === "empleado" || p.scopeType === "employee") return 1;
      return empleados.length;
    };

    const vivas = plantillas.filter((p) => !p.deletedAt);

    // Quién creó cada una. La auditoría no guarda el id en los CREAR, así que
    // se cruza por nombre + año + alcance.
    const clave = (n, y, st, si) => `${norm(n)}|${y}|${st}|${si}`;
    const creaciones = await Auditoria.find({ entidad: "plantilla", accion: "CREAR" })
      .sort({ createdAt: 1 }).lean();
    const autores = new Map();
    for (const a of creaciones) {
      const c = a.cambios || {};
      const k = clave(c.nombre, c.year, c.scopeType, c.scopeId);
      if (!autores.has(k)) autores.set(k, []);
      autores.get(k).push({ email: a.email, cuando: a.createdAt });
    }

    const items = vivas.map((p) => {
      const s = stats.get(String(p._id)) || { total: 0, conDato: 0, empleados: new Set() };
      const gemelas = vivas
        .filter((q) =>
          String(q._id) !== String(p._id) &&
          q.tipo === p.tipo &&
          String(q.scopeId) === String(p.scopeId) &&
          similitud(q.nombre, p.nombre) >= 0.6)
        .map((q) => {
          const sq = stats.get(String(q._id)) || { total: 0, conDato: 0 };
          return {
            _id: String(q._id),
            nombre: q.nombre,
            pesoBase: q.pesoBase ?? 0,
            evaluacionesConDato: sq.conDato,
            insertadoEl: insertadoEl(q._id),
            cobertura: periodosDe(q),
            similitud: Math.round(similitud(q.nombre, p.nombre) * 100),
          };
        })
        .sort((a, b) => b.evaluacionesConDato - a.evaluacionesConDato);

      const autor = (autores.get(clave(p.nombre, p.year, p.scopeType, p.scopeId)) || [])[0] || null;

      return {
        _id: String(p._id),
        nombre: p.nombre,
        tipo: p.tipo,
        year: p.year,
        scopeType: p.scopeType,
        alcance: alcanceDe(p),
        empleadosAlcanzados: alcanza(p),
        pesoBase: p.pesoBase ?? 0,
        activo: p.activo !== false,
        metas: (p.metas || []).length,
        cobertura: periodosDe(p),
        evaluaciones: s.total,
        evaluacionesConDato: s.conDato,
        empleadosConEvaluacion: s.empleados.size,
        // createdAt viene falseado en las clonadas: se informa junto al real
        // para que se vea la diferencia.
        createdAt: p.createdAt,
        insertadoEl: insertadoEl(p._id),
        fechaFalseada: Math.abs(new Date(p.createdAt) - insertadoEl(p._id)) > 86400000,
        creadoPor: autor?.email || null,
        creadoEl: autor?.cuando || null,
        gemelas,
        sospechoso: s.conDato === 0,
      };
    });

    const candidatas = items.filter((i) => i.sospechoso);
    candidatas.sort((a, b) =>
      (b.gemelas.length ? 1 : 0) - (a.gemelas.length ? 1 : 0) ||
      b.empleadosAlcanzados - a.empleadosAlcanzados ||
      String(a.alcance).localeCompare(String(b.alcance), "es"));

    res.json({
      anio,
      resumen: {
        plantillasDelAnio: vivas.length,
        sinNingunDato: candidatas.length,
        conGemelaQueSiTieneDatos: candidatas.filter((c) => c.gemelas.some((g) => g.evaluacionesConDato > 0)).length,
        personasAlcanzadas: [...new Set(candidatas.flatMap((c) =>
          c.scopeType === "sector" ? [`s${c.scopeType}${c.alcance}`] : [c.alcance]))].length,
      },
      items: candidatas,
    });
  } catch (err) {
    console.error("listarFantasmas error:", err);
    res.status(500).json({ message: "Error detectando objetivos sin datos" });
  }
}

/**
 * Detalle de una plantilla puntual: a quiénes les aparece y qué tienen cargado.
 * Es la verificación previa al borrado — para no borrar a ciegas.
 */
export async function detalleFantasma(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const p = await Plantilla.findById(id).setOptions({ incluirEliminadas: true }).lean();
    if (!p) return res.status(404).json({ message: "Plantilla no encontrada" });

    const evals = await Evaluacion.find({ plantillaId: p._id }, "empleado periodo metasResultados").lean();
    const empleados = await Empleado.find(
      { _id: { $in: [...new Set(evals.map((e) => String(e.empleado)))] } },
      "nombre apellido"
    ).lean();
    const nom = new Map(empleados.map((e) => [String(e._id), `${e.apellido} ${e.nombre}`]));

    res.json({
      plantilla: {
        _id: String(p._id), nombre: p.nombre, tipo: p.tipo, year: p.year,
        scopeType: p.scopeType, pesoBase: p.pesoBase, activo: p.activo !== false,
        deletedAt: p.deletedAt || null,
        createdAt: p.createdAt, insertadoEl: insertadoEl(p._id),
        cobertura: periodosDe(p),
        metas: (p.metas || []).map((m) => ({ nombre: m.nombre, unidad: m.unidad, esperado: m.esperado })),
      },
      evaluaciones: evals.map((e) => ({
        empleado: nom.get(String(e.empleado)) || String(e.empleado),
        periodo: e.periodo,
        valores: (e.metasResultados || [])
          .filter((m) => m.resultado !== null && m.resultado !== undefined)
          .map((m) => ({ meta: m.nombre, resultado: m.resultado })),
      })),
    });
  } catch (err) {
    console.error("detalleFantasma error:", err);
    res.status(500).json({ message: "Error obteniendo el detalle" });
  }
}
