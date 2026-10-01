// backend/src/controllers/historialPlantilla.controller.js
//
// Historial y reversión de objetivos, y aviso previo de impacto.
//
// POR QUÉ EXISTE
// El formulario tiene dos botones: "Crear Versión N" —que sí versiona, con
// aprobación— y "Actualizar VN (Sobrescribir)", que pisa el documento sin
// guardar nada. En la práctica nadie usa el primero: en toda la base hay una
// sola plantilla versionada, y es de prueba. El resultado es que los cambios
// reales no dejan forma de volver atrás.
//
// El caso que lo destapó: en marzo se cambió un objetivo de mensual a
// trimestral con "Sobrescribir". Los 5 resultados ya cargados quedaron colgados
// de períodos que la plantilla dejó de generar, el objetivo pasó a computar 0%,
// y no hubo aviso ni rastro. Afectó a 20 personas.
//
// Acá van las tres piezas que faltaban:
//   · historial   — las versiones previas que ya guarda la auditoría
//   · revertir    — volver a cualquiera de esas versiones
//   · impacto     — avisar ANTES de sobrescribir si el cambio deja resultados
//                   fuera del calendario o borra metas con datos
//
// Límite honesto: la auditoría arranca el 8 de septiembre de 2026. De los
// cambios anteriores no hay snapshot, y el historial lo dice en lugar de
// simular que no existieron.

import mongoose from "mongoose";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import Empleado from "../models/Empleado.model.js";
import Auditoria from "../models/Auditoria.model.js";
import { generarHitos } from "../utils/generarHitos.js";

/** Campos cuyo cambio vale la pena resaltar en el historial. */
const CAMPOS_CLAVE = [
  "nombre", "frecuencia", "pesoBase", "activo", "descripcion",
  "proceso", "fechaCierre", "fechaCierreCustom", "reglaCierre",
];

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Diferencias legibles entre dos estados de la plantilla. */
function diferencias(antes, despues) {
  const out = [];
  for (const k of CAMPOS_CLAVE) {
    if (igual(antes?.[k], despues?.[k])) continue;
    out.push({ campo: k, antes: antes?.[k] ?? null, ahora: despues?.[k] ?? null });
  }
  const mA = (antes?.metas || []).length;
  const mD = (despues?.metas || []).length;
  if (mA !== mD) out.push({ campo: "metas", antes: `${mA} metas`, ahora: `${mD} metas` });
  else {
    const nA = (antes?.metas || []).map((m) => m.nombre).join(" | ");
    const nD = (despues?.metas || []).map((m) => m.nombre).join(" | ");
    if (nA !== nD) out.push({ campo: "metas", antes: nA, ahora: nD });
  }
  return out;
}

/**
 * Historial de un objetivo: cada edición registrada, con el estado previo
 * completo, para poder volver a cualquiera.
 */
export async function historialPlantilla(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const actual = await Plantilla.findById(id).setOptions({ incluirEliminadas: true }).lean();
    if (!actual) return res.status(404).json({ message: "Objetivo no encontrado" });

    const registros = await Auditoria.find({ entidad: "plantilla", documentoId: id })
      .sort({ createdAt: -1 }).lean();

    // Cada registro guarda el estado ANTES del cambio. El "después" de uno es
    // el "antes" del siguiente (o el documento actual para el más reciente).
    const versiones = registros.map((r, i) => {
      const despues = i === 0 ? actual : registros[i - 1].antes;
      return {
        auditoriaId: String(r._id),
        fecha: r.createdAt,
        accion: r.accion,
        email: r.email,
        resumen: r.resumen,
        puedeRevertir: !!r.antes && r.accion !== "CREAR",
        cambios: r.antes ? diferencias(r.antes, despues) : [],
        antes: r.antes || null,
      };
    });

    const primera = registros.length ? registros[registros.length - 1].createdAt : null;

    res.json({
      plantilla: {
        _id: String(actual._id), nombre: actual.nombre, tipo: actual.tipo,
        year: actual.year, frecuencia: actual.frecuencia, pesoBase: actual.pesoBase,
        activo: actual.activo !== false, version: actual.version || 1,
        createdAt: actual.createdAt, updatedAt: actual.updatedAt,
      },
      versiones,
      // La auditoría no cubre lo anterior a su puesta en marcha: decirlo es
      // mejor que dejar creer que no hubo cambios.
      desde: primera,
      aviso: registros.length === 0
        ? "No hay ediciones registradas. La auditoría guarda cambios desde el 8 de septiembre de 2026; si este objetivo se modificó antes, ese cambio no quedó registrado."
        : null,
    });
  } catch (err) {
    console.error("historialPlantilla error:", err);
    res.status(500).json({ message: "Error obteniendo el historial" });
  }
}

/**
 * Qué se rompería al guardar estos cambios.
 *
 * El caso importante es la frecuencia: cambiarla regenera el calendario, y los
 * resultados cargados en períodos que dejan de existir quedan huérfanos — no se
 * borran, pero dejan de verse y el objetivo pasa a computar como vacío.
 */
/** Períodos que genera el calendario de una plantilla, como Set. */
function periodosDe(p) {
  try { return new Set(generarHitos(p).map((h) => h.periodo)); } catch { return new Set(); }
}

/**
 * Resultados ya cargados que dejarían de verse si se aplica `propuesta`.
 *
 * Se cuentan solo los que HOY se ven y dejarían de verse: los que ya estaban
 * huérfanos de antes no los causa este cambio, y reportarlos haría saltar el
 * aviso hasta al editar una descripción.
 *
 * Lo usan dos lugares: el endpoint de impacto (que lo muestra antes de
 * guardar) y `updatePlantilla` (que bloquea el guardado si no fue confirmado).
 * Es la misma cuenta en los dos, por eso vive acá y no duplicada.
 */
export async function huerfanosPorCambio(id, actual, propuesta) {
  const antes = periodosDe(actual);
  const despues = periodosDe(propuesta);

  const evals = await Evaluacion.find({ plantillaId: id }, "empleado periodo metasResultados").lean();
  const conDato = evals.filter((e) =>
    (e.metasResultados || []).some((m) => m.resultado !== null && m.resultado !== undefined));

  const huerfanos = conDato.filter((e) => antes.has(e.periodo) && !despues.has(e.periodo));
  const recuperados = conDato.filter((e) => !antes.has(e.periodo) && despues.has(e.periodo));

  return {
    total: huerfanos.length,
    empleados: new Set(huerfanos.map((e) => String(e.empleado))).size,
    periodos: [...new Set(huerfanos.map((e) => e.periodo))].sort(),
    filas: huerfanos,
    recuperados,
  };
}

export async function impactoCambio(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "id inválido" });
    }
    const actual = await Plantilla.findById(id).lean();
    if (!actual) return res.status(404).json({ message: "Objetivo no encontrado" });

    const propuesta = { ...actual, ...(req.body || {}) };
    const avisos = [];

    const antes = periodosDe(actual);
    const despues = periodosDe(propuesta);

    const evals = await Evaluacion.find({ plantillaId: id }, "empleado periodo metasResultados").lean();
    const conDato = evals.filter((e) =>
      (e.metasResultados || []).some((m) => m.resultado !== null && m.resultado !== undefined));

    // 1) Resultados que quedarían fuera del nuevo calendario.
    const huerfanos = conDato.filter((e) => antes.has(e.periodo) && !despues.has(e.periodo));
    if (huerfanos.length) {
      const ids = [...new Set(huerfanos.map((e) => String(e.empleado)))];
      const nombres = await Empleado.find({ _id: { $in: ids } }, "nombre apellido").lean();
      avisos.push({
        gravedad: "alta",
        tipo: "resultados_fuera_de_calendario",
        titulo: `${huerfanos.length} resultados ya cargados quedarían fuera del calendario`,
        detalle:
          `Al cambiar la frecuencia de "${actual.frecuencia}" a "${propuesta.frecuencia}" el objetivo ` +
          `pasa a generar otros períodos. Los resultados cargados en ${[...new Set(huerfanos.map((e) => e.periodo))].sort().join(", ")} ` +
          `no se borran, pero dejan de verse y el objetivo va a computar como si no tuviera datos.`,
        empleados: nombres.map((e) => `${e.apellido} ${e.nombre}`).sort(),
        periodos: [...new Set(huerfanos.map((e) => e.periodo))].sort(),
      });
    }

    // 2) Resultados que se recuperarían (el cambio inverso)
    const recuperados = conDato.filter((e) => !antes.has(e.periodo) && despues.has(e.periodo));
    // (si antes y despues coinciden, ambos conjuntos quedan vacíos y no hay aviso)
    if (recuperados.length) {
      avisos.push({
        gravedad: "buena",
        tipo: "resultados_recuperados",
        titulo: `${recuperados.length} resultados que hoy no se ven volverían a aparecer`,
        detalle: `Estaban cargados en ${[...new Set(recuperados.map((e) => e.periodo))].sort().join(", ")}, períodos que el calendario actual no genera.`,
        periodos: [...new Set(recuperados.map((e) => e.periodo))].sort(),
      });
    }

    // 3) Metas que desaparecen teniendo resultados
    if (Array.isArray(req.body?.metas)) {
      const nombresNuevos = new Set(req.body.metas.map((m) => String(m.nombre || "").trim()));
      const idsNuevos = new Set(req.body.metas.filter((m) => m._id).map((m) => String(m._id)));
      const perdidas = (actual.metas || []).filter(
        (m) => !idsNuevos.has(String(m._id)) && !nombresNuevos.has(String(m.nombre || "").trim())
      );
      const conResultado = perdidas.filter((m) =>
        conDato.some((e) => (e.metasResultados || []).some(
          (r) => (String(r.metaId) === String(m._id) || r.nombre === m.nombre) &&
            r.resultado !== null && r.resultado !== undefined)));
      if (conResultado.length) {
        avisos.push({
          gravedad: "alta",
          tipo: "metas_con_datos_eliminadas",
          titulo: `${conResultado.length} meta(s) con resultados cargados se eliminarían`,
          detalle: conResultado.map((m) => m.nombre).join(" · "),
        });
      }
    }

    // 4) Cambio de peso: mueve la nota de todos los alcanzados
    if (req.body?.pesoBase != null && Number(req.body.pesoBase) !== Number(actual.pesoBase)) {
      avisos.push({
        gravedad: "media",
        tipo: "cambio_de_peso",
        titulo: `El peso pasa de ${actual.pesoBase}% a ${req.body.pesoBase}%`,
        detalle: "Cambia la nota de todas las personas alcanzadas por este objetivo, incluidas las de años ya cerrados.",
      });
    }

    res.json({
      hayImpacto: avisos.some((a) => a.gravedad === "alta"),
      avisos,
      evaluacionesConDatos: conDato.length,
    });
  } catch (err) {
    console.error("impactoCambio error:", err);
    res.status(500).json({ message: "Error calculando el impacto" });
  }
}

/** Vuelve el objetivo al estado guardado en un registro de auditoría. */
export async function revertirPlantilla(req, res) {
  try {
    const { id, auditoriaId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(auditoriaId)) {
      return res.status(400).json({ message: "Parámetros inválidos" });
    }
    const registro = await Auditoria.findById(auditoriaId).lean();
    if (!registro || String(registro.documentoId) !== String(id)) {
      return res.status(404).json({ message: "Ese punto del historial no corresponde a este objetivo" });
    }
    if (!registro.antes) {
      return res.status(409).json({ message: "Ese registro no guardó el estado previo, no se puede revertir" });
    }

    const actual = await Plantilla.findById(id).lean();
    if (!actual) return res.status(404).json({ message: "Objetivo no encontrado" });

    // No se tocan identidad, alcance ni año: revertir no puede mover un
    // objetivo de dueño ni de período fiscal.
    const { _id, __v, createdAt, updatedAt, scopeType, scopeId, scopeRef, year, ...restaurable } = registro.antes;

    await Plantilla.updateOne({ _id: id }, { $set: restaurable });

    await Auditoria.create({
      usuarioId: req.user?._id || null, email: req.user?.email || null, rol: req.user?.rol || null,
      accion: "RESTAURAR", entidad: "plantilla", documentoId: new mongoose.Types.ObjectId(id),
      resumen: `Revertido "${actual.nombre}" al estado del ${new Date(registro.createdAt).toLocaleString("es-AR")}`,
      antes: actual,
      cambios: { revertidoA: auditoriaId, fechaDelPunto: registro.createdAt },
      metodo: req.method, ruta: String(req.originalUrl || "").split("?")[0],
      statusCode: 200, ip: req.ip, userAgent: req.get("user-agent"),
    });

    const nuevo = await Plantilla.findById(id).lean();
    res.json({
      message: `Revertido al estado del ${new Date(registro.createdAt).toLocaleString("es-AR")}`,
      plantilla: { frecuencia: nuevo.frecuencia, pesoBase: nuevo.pesoBase, nombre: nuevo.nombre },
    });
  } catch (err) {
    console.error("revertirPlantilla error:", err);
    res.status(500).json({ message: "Error revirtiendo" });
  }
}
