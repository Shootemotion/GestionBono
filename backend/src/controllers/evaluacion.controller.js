// src/controllers/evaluacion.controller.js
import mongoose from "mongoose";
import Evaluacion from "../models/Evaluacion.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Empleado from "../models/Empleado.model.js";
import Area from "../models/Area.model.js";
import { mesesEnCiclo, esPeriodoAnteriorAlIngreso } from "../lib/tiempoEfectivo.js";
import Auditoria from "../models/Auditoria.model.js";
import {
  normalizarConfigMeta,
  calcularScorePeriodoMeta,
} from "../lib/calculoMetas.js";
import { calcularScoreObjetivoDesdeMetas } from "../lib/scoringGlobal.js";
import { recalcularAnualEmpleado } from "../lib/recalculoEmpleado.js";

/* ============================================================================
 * Utilidades
 * ========================================================================== */

function pushTimeline(ev, { by, action, note, snapshot }) {
  ev.timeline = ev.timeline || [];
  ev.timeline.push({ at: new Date(), by, action, note, snapshot });
}

/**
 * Procesa metas crudas de un período y devuelve:
 *  - metasProcesadas: versión lista para guardar en Evaluacion.metasResultados
 *  - scoreObjetivo:   número 0..100 (o 0..120 si permitís over)
 *
 * ACA es donde se respeta reconoceEsfuerzo / tolerancia / permiteOver,
 * porque usamos normalizarConfigMeta + calcularScorePeriodoMeta.
 */
function prepararMetasPeriodo(metasResultados = [], acumulados = {}) {
  if (!Array.isArray(metasResultados) || metasResultados.length === 0) {
    return { metasProcesadas: [], scoreObjetivo: null };
  }

  const metasConScore = metasResultados.map((m) => {
    // une params del frontend con defaults de la meta de plantilla
    const cfg = normalizarConfigMeta(m);

    // Lógica de acumulación
    let valorParaCalculo = Number(m.resultado) || 0;
    if (cfg.modoAcumulacion === "acumulativo") {
      const prev = acumulados[m.metaId] || 0;
      valorParaCalculo += prev;
    }

    // calcula scoreMeta (0..100/120) + cumple usando reconoceEsfuerzo, etc.
    const { score, cumple } = calcularScorePeriodoMeta(cfg, valorParaCalculo);

    return {
      metaId: m.metaId ?? null,
      nombre: m.nombre,
      unidad: m.unidad,
      operador: m.operador || ">=",
      esperado: m.esperado ?? m.target ?? null,

      pesoMeta: m.pesoMeta ?? null,
      reconoceEsfuerzo: cfg.reconoceEsfuerzo,
      permiteOver: cfg.permiteOver,
      tolerancia: cfg.tolerancia,
      modoAcumulacion: cfg.modoAcumulacion,
      acumulativa: m.acumulativa ?? false,
      reglaCierre: cfg.reglaCierre,

      resultado: m.resultado,
      cumple,
      // 👇 sólo para cálculo en memoria
      scoreMeta: score,
    };
  });

  const scoreObjetivo = calcularScoreObjetivoDesdeMetas(metasConScore);

  // sacamos scoreMeta antes de guardar
  const metasProcesadas = metasConScore.map(({ scoreMeta, ...rest }) => rest);

  return { metasProcesadas, scoreObjetivo };
}

/* ============================================================================
 * 1) EXISTENTES: actualización de hitos
 * ========================================================================== */

// Actualiza un hito (una evaluación de un período para un empleado/plantilla)
export const updateHito = async (req, res) => {
  try {
    const { empleadoId, plantillaId, periodo } = req.params;
    const { year, escala, comentario, applyToAll, empleadosIds, metasResultados } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(plantillaId)) {
      return res.status(400).json({ message: "plantillaId inválido" });
    }
    if (!periodo) {
      return res.status(400).json({ message: "El periodo es obligatorio" });
    }

    // No se carga un resultado de un período en el que la persona no estaba.
    //
    // No es un error de criterio, es un imposible. Hoy hay 56 evaluaciones así
    // en la base, y una llegó a convertirse en un feedback cerrado con nota
    // comunicada: a Huenuleff Barbara, que ingresó el 02/01, le cerraron un Q1
    // (sep-nov) con 47,5.
    //
    // Se permite forzarlo con `confirmarFueraDeRango` para los casos legítimos
    // —una recontratación, una fecha de ingreso mal cargada— pero deja de pasar
    // en silencio.
    if (!applyToAll && empleadoId && !req.body.confirmarFueraDeRango) {
      const emp = await Empleado.findById(empleadoId).select("nombre apellido fechaIngreso").lean();
      const tpl = await Plantilla.findById(plantillaId).select("year").lean();
      if (emp?.fechaIngreso && tpl?.year !== undefined) {
        const meses = mesesEnCiclo(emp.fechaIngreso, Number(tpl.year));
        if (esPeriodoAnteriorAlIngreso(periodo, meses)) {
          return res.status(409).json({
            motivo: "periodo_anterior_al_ingreso",
            message:
              `${emp.apellido}, ${emp.nombre} ingresó el ` +
              `${new Date(emp.fechaIngreso).toLocaleDateString("es-AR")} y el período ${periodo} ` +
              `terminó antes de esa fecha. Cargar un resultado ahí le suma una evaluación de un ` +
              `tiempo en el que no estaba en la empresa.`,
            fechaIngreso: emp.fechaIngreso,
            periodo,
          });
        }
      }
    }

    // Calcular acumulados de períodos anteriores (solo si es para un empleado específico)
    const acumulados = {};
    if (!applyToAll && (!empleadosIds || empleadosIds.length === 0)) {
      const anio = Number(String(periodo).slice(0, 4));
      const siblings = await Evaluacion.find({
        plantillaId,
        year: anio,
        empleado: empleadoId,
        periodo: { $lt: periodo } // Períodos anteriores
      }).lean();

      siblings.forEach(ev => {
        ev.metasResultados?.forEach(m => {
          if (m.metaId) {
            if (!acumulados[m.metaId]) acumulados[m.metaId] = 0;
            acumulados[m.metaId] += Number(m.resultado) || 0;
          }
        });
      });
    }

    // 🔹 procesar metas → scoreMeta & cumple para este período
    const { metasProcesadas, scoreObjetivo } = prepararMetasPeriodo(
      metasResultados,
      acumulados
    );

    const baseUpdate = {
      year: (req.body.year && !isNaN(req.body.year)) ? Number(req.body.year) : Number(String(periodo).slice(0, 4)),
      periodo,
      actual: scoreObjetivo !== null ? scoreObjetivo : (req.body.actual ?? null),
      escala: req.body.escala,
      comentarioManager: req.body.comentarioManager ?? null,
      comentario: comentario ?? null,
      metasResultados: metasProcesadas,
      estado: "MANAGER_DRAFT",
    };



    // Target de empleados
    let targetEmpleados = [empleadoId];

    if (applyToAll) {
      const allEvals = await Evaluacion.find(
        { plantillaId, year: Number(year) },
        "empleado"
      );
      targetEmpleados = allEvals.map((e) => String(e.empleado));
    }

    if (Array.isArray(empleadosIds) && empleadosIds.length) {
      targetEmpleados = empleadosIds;
    }

    const updates = await Promise.all(
      targetEmpleados.map((empId) =>
        Evaluacion.findOneAndUpdate(
          { empleado: empId, plantillaId, periodo },
          { $set: { ...baseUpdate, empleado: empId, plantillaId } },
          { new: true, upsert: true }
        )
      )
    );

    res.json({ success: true, updates });
  } catch (err) {
    console.error("updateHito error:", err);
    res.status(500).json({ message: err.message || "Error actualizando hito" });
  }
};

// 📊 listar evaluaciones del empleado por año
export const getEvaluacionesEmpleado = async (req, res, next) => {
  try {
    const { empleadoId } = req.params;
    const { year } = req.query;

    const q = { empleado: empleadoId };
    if (year) q.year = Number(year);

    const evaluaciones = await Evaluacion.find(q).lean();
    res.json(evaluaciones);
  } catch (err) {
    next(err);
  }
};

// Actualización de hitos en lote
export const updateHitoMultiple = async (req, res) => {
  try {
    const {
      year,
      plantillaId,
      periodo,
      empleadoIds,
      escala,
      comentario,
      metasResultados,
    } = req.body;

    if (!year || !plantillaId || !periodo || !Array.isArray(empleadoIds)) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const { metasProcesadas, scoreObjetivo } = prepararMetasPeriodo(
      metasResultados
    );

    const baseUpdate = {
      year: Number(year),
      periodo,
      actual: scoreObjetivo,
      escala,
      comentarioManager: req.body.comentarioManager ?? null,
      comentario: comentario ?? null,
      metasResultados: metasProcesadas,
      estado: "MANAGER_DRAFT",
    };

    const results = await Promise.all(
      empleadoIds.map((empId) =>
        Evaluacion.findOneAndUpdate(
          { empleado: empId, plantillaId, periodo },
          { $set: { ...baseUpdate, empleado: empId, plantillaId } },
          { new: true, upsert: true }
        )
      )
    );

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error("updateHitoMultiple error:", err);
    res
      .status(500)
      .json({ message: err.message || "Error actualizando hitos múltiples" });
  }
};

/* ============================================================================
 * 2) NUEVOS: consultas y flujo de estados
 * ========================================================================== */

// Listado flexible: /evaluaciones?empleado=&year=&plantillaId=&periodo=
export async function listEvaluaciones(req, res) {
  try {
    const { empleado, year, plantillaId, periodo } = req.query;

    const q = {};
    if (empleado) q.empleado = new mongoose.Types.ObjectId(String(empleado));
    if (plantillaId)
      q.plantillaId = new mongoose.Types.ObjectId(String(plantillaId));
    if (periodo) q.periodo = String(periodo);
    if (year) q.year = Number(year);

    const items = await Evaluacion.find(q)
      .populate(
        "plantillaId",
        "nombre tipo pesoBase metas fechaLimite descripcion proceso"
      )
      .lean();

    const merged = items.map((ev) => {
      const pl = ev.plantillaId || {};
      return {
        ...ev,
        plantillaId: pl._id || ev.plantillaId,
        tipo: pl.tipo || ev.tipo,
        nombre: pl.nombre || ev.nombre,
        descripcion: pl.descripcion || ev.descripcion,
        proceso: pl.proceso || ev.proceso,
        pesoBase:
          pl.pesoBase !== undefined
            ? Number(pl.pesoBase)
            : ev.pesoBase !== undefined
              ? Number(ev.pesoBase)
              : null,
        fechaLimite: pl.fechaLimite || ev.fechaLimite || null,
        metas:
          pl.metas && pl.metas.length > 0 ? pl.metas : ev.metasResultados || [],
      };
    });

    res.json(merged);
  } catch (e) {
    console.error("❌ listEvaluaciones error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

// Detalle por ID
export async function getEvaluacionById(req, res) {
  try {
    const { id } = req.params;

    const ev = await Evaluacion.findById(id)
      .populate(
        "plantillaId",
        "nombre tipo pesoBase metas fechaLimite descripcion proceso"
      )
      .lean();

    if (!ev) {
      return res.status(404).json({ message: "Evaluación no encontrada" });
    }

    const pl = ev.plantillaId || {};
    const merged = {
      ...ev,
      plantillaId: pl._id || ev.plantillaId,
      tipo: pl.tipo || ev.tipo,
      nombre: pl.nombre || ev.nombre,
      descripcion: pl.descripcion || ev.descripcion,
      proceso: pl.proceso || ev.proceso,
      pesoBase:
        pl.pesoBase !== undefined
          ? Number(pl.pesoBase)
          : ev.pesoBase !== undefined
            ? Number(ev.pesoBase)
            : null,
      fechaLimite: pl.fechaLimite || ev.fechaLimite || null,
      metas:
        pl.metas && pl.metas.length > 0 ? pl.metas : ev.metasResultados || [],
    };

    res.json(merged);
  } catch (e) {
    console.error("❌ getEvaluacionById error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

// Editar contenido SOLO si está en MANAGER_DRAFT
export async function patchEvaluacion(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });

    if (ev.estado !== "MANAGER_DRAFT") {
      return res
        .status(409)
        .json({ message: "Solo editable en MANAGER_DRAFT" });
    }

    // Campos permitidos en borrador del jefe:
    const allowed = [
      "actual",
      "escala",
      "comentarioManager",
      "metasResultados",
      "comentario",
    ];
    allowed.forEach((k) => {
      if (body[k] !== undefined) ev[k] = body[k];
    });

    // Si vienen metas crudas, podés re-correr la lógica heavy acá si querés
    if (Array.isArray(ev.metasResultados) && ev.metasResultados.length > 0) {
      // por ahora, si sólo tenemos cumple, mantenemos el comportamiento simple:
      const total = ev.metasResultados.length;
      const cumplidas = ev.metasResultados.filter((m) => !!m.cumple).length;
      ev.actual =
        total > 0 ? Math.round((cumplidas / total) * 100) : ev.actual ?? null;
    }

    if (!ev.manager && req.user?._id) ev.manager = req.user._id;

    pushTimeline(ev, {
      by: req.user?._id,
      action: "MANAGER_EDIT",
      snapshot: body,
    });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("patchEvaluacion error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

/* ----------- TRANSICIONES ----------- */

export async function submitToEmployee(req, res) {
  try {
    const { id } = req.params;
    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (ev.estado !== "MANAGER_DRAFT") {
      return res
        .status(409)
        .json({ message: "Estado inválido para enviar al empleado" });
    }
    ev.estado = "PENDING_EMPLOYEE";
    ev.submittedToEmployeeAt = new Date();
    if (!ev.manager && req.user?._id) ev.manager = req.user._id;
    pushTimeline(ev, { by: req.user?._id, action: "MANAGER_SUBMIT" });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("submitToEmployee error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

export async function employeeAck(req, res) {
  try {
    const { id } = req.params;
    const { comentarioEmpleado } = req.body || {};

    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (!["PENDING_EMPLOYEE", "MANAGER_DRAFT"].includes(ev.estado)) {
      return res
        .status(409)
        .json({ message: "Estado inválido para ACK" });
    }

    const userEmpId = String(
      req.user?.empleadoId?._id || req.user?.empleadoId
    );
    if (!userEmpId || String(ev.empleado) !== userEmpId) {
      return res
        .status(403)
        .json({ message: "No autorizado (ACK solo por el empleado)" });
    }

    if (comentarioEmpleado !== undefined) {
      ev.comentarioEmpleado = comentarioEmpleado || ev.comentarioEmpleado || "";
    }

    ev.empleadoAck = { estado: "ACK", fecha: new Date(), userId: req.user?._id };
    ev.estado = "PENDING_HR";
    pushTimeline(ev, {
      by: req.user?._id,
      action: "EMPLOYEE_ACK",
      note: comentarioEmpleado,
    });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("employeeAck error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

export async function employeeContest(req, res) {
  try {
    const { id } = req.params;
    const { comentarioEmpleado } = req.body || {};

    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (!["PENDING_EMPLOYEE", "MANAGER_DRAFT"].includes(ev.estado)) {
      return res
        .status(409)
        .json({ message: "Estado inválido para contestar" });
    }

    const userEmpId = String(
      req.user?.empleadoId?._id || req.user?.empleadoId
    );
    if (!userEmpId || String(ev.empleado) !== userEmpId) {
      return res
        .status(403)
        .json({ message: "No autorizado (solo el empleado puede contestar)" });
    }

    ev.comentarioEmpleado = comentarioEmpleado || ev.comentarioEmpleado || "";
    ev.empleadoAck = {
      estado: "CONTEST",
      fecha: new Date(),
      userId: req.user?._id,
    };
    ev.estado = "PENDING_HR";
    pushTimeline(ev, {
      by: req.user?._id,
      action: "EMPLOYEE_CONTEST",
      note: comentarioEmpleado,
    });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("employeeContest error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

export async function submitToHR(req, res) {
  try {
    const { id } = req.params;
    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (!["MANAGER_DRAFT", "PENDING_EMPLOYEE"].includes(ev.estado)) {
      return res
        .status(409)
        .json({ message: "Estado inválido para enviar a RRHH" });
    }
    ev.estado = "PENDING_HR";
    ev.submittedToHRAt = new Date();
    pushTimeline(ev, { by: req.user?._id, action: "SUBMIT_HR" });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("submitToHR error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

export async function closeEvaluacion(req, res) {
  try {
    const { id } = req.params;
    const { comentarioRRHH } = req.body || {};
    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (ev.estado !== "PENDING_HR") {
      return res
        .status(409)
        .json({ message: "Solo se puede cerrar desde PENDING_HR" });
    }
    ev.estado = "CLOSED";
    ev.closedAt = new Date();
    ev.hrReviewer = req.user?._id || ev.hrReviewer;
    if (comentarioRRHH !== undefined) ev.comentarioRRHH = comentarioRRHH;
    pushTimeline(ev, { by: req.user?._id, action: "HR_CLOSE", note: comentarioRRHH });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("closeEvaluacion error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

export async function reopenEvaluacion(req, res) {
  try {
    const { id } = req.params;
    const { note } = req.body || {};
    const ev = await Evaluacion.findById(id);
    if (!ev) return res.status(404).json({ message: "Evaluación no encontrada" });
    if (!["PENDING_HR", "CLOSED"].includes(ev.estado)) {
      return res
        .status(409)
        .json({ message: "Solo se puede reabrir desde PENDING_HR o CLOSED" });
    }
    ev.estado = "MANAGER_DRAFT";
    ev.closedAt = null;
    pushTimeline(ev, { by: req.user?._id, action: "REOPEN", note });
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error("reopenEvaluacion error", e);
    res.status(500).json({ message: e.message || "Error interno" });
  }
}

/* ----------- Pendientes RRHH ----------- */

export async function listPendingHR(req, res) {
  try {
    const { periodo, plantillaId } = req.query;
    const q = { estado: { $in: ["PENDING_HR", "CLOSED"] } };
    if (periodo) q.periodo = String(periodo);
    if (plantillaId)
      q.plantillaId = new mongoose.Types.ObjectId(String(plantillaId));

    const items = await Evaluacion.find(q)
      .populate({
        path: "empleado",
        select: "nombre apellido area sector",
        populate: [
          { path: "area", select: "nombre" },
          { path: "sector", select: "nombre" },
        ],
      })
      .populate({
        path: "manager",
        select: "nombre apellido email",
      })
      .populate({
        path: "plantillaId",
        select: "nombre fechaLimite",
      })
      .lean();

    const mapped = items.map((ev) => ({
      ...ev,
      plantilla: ev.plantillaId
        ? {
          _id: ev.plantillaId._id,
          nombre: ev.plantillaId.nombre,
          fechaLimite: ev.plantillaId.fechaLimite || null,
        }
        : null,
    }));

    res.json(mapped);
  } catch (e) {
    console.error("listPendingHR error", e);
    res.status(500).json({ message: e.message || "Error listando pendientes" });
  }
}

export async function closeBulk(req, res) {
  try {
    const { ids, filtro } = req.body || {};
    let q = { estado: "PENDING_HR" };
    if (Array.isArray(ids) && ids.length) {
      q._id = {
        $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))),
      };
    } else if (filtro) {
      if (filtro.periodo) q.periodo = String(filtro.periodo);
      if (filtro.plantillaId)
        q.plantillaId = new mongoose.Types.ObjectId(String(filtro.plantillaId));
    } else {
      return res.status(400).json({ message: "Enviar 'ids' o 'filtro'." });
    }

    const docs = await Evaluacion.find(q);
    for (const ev of docs) {
      ev.estado = "CLOSED";
      ev.closedAt = new Date();
      ev.hrReviewer = req.user?._id || ev.hrReviewer;
      pushTimeline(ev, { by: req.user?._id, action: "HR_CLOSE_BULK" });
      await ev.save();
    }
    res.json({ success: true, count: docs.length });
  } catch (e) {
    console.error("closeBulk error", e);
    res.status(500).json({ message: e.message || "Error cerrando en lote" });
  }
}

/* ----------- Scoring global anual ----------- */

export async function getScoringAnualEmpleado(req, res) {
  try {
    const { empleadoId } = req.params;
    const { year, pesoObj, pesoApt } = req.query;

    const data = await recalcularAnualEmpleado({
      empleadoId,
      year,
      pesoObj: pesoObj !== undefined ? Number(pesoObj) : 0.7,
      pesoApt: pesoApt !== undefined ? Number(pesoApt) : 0.3,
    });

    res.json(data);
  } catch (err) {
    console.error("getScoringAnualEmpleado error:", err);
    res
      .status(500)
      .json({ message: err.message || "Error en recalculo anual" });
  }
}

/* ----------- Crear evaluación (si no existe) ----------- */

export async function createEvaluacion(req, res) {
  try {
    console.log("📥 createEvaluacion BODY recibido:", req.body);

    const { empleado, plantillaId, periodo } = req.body;
    if (!empleado || !plantillaId || !periodo) {
      console.warn("⚠ createEvaluacion faltan campos", {
        empleado,
        plantillaId,
        periodo,
      });
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    let evaluacion = await Evaluacion.findOne({
      empleado,
      plantillaId,
      periodo,
    }).lean();
    console.log(
      "🔍 createEvaluacion búsqueda existente:",
      evaluacion ? "YA EXISTE" : "NO EXISTE"
    );

    if (evaluacion) {
      console.log("↪️ Devolviendo evaluación existente:", evaluacion._id);
      return res.status(200).json(evaluacion);
    }

    const anio = parseInt(String(periodo).substring(0, 4), 10);

    const metasResultadosBody = req.body.metasResultados || [];
    const { metasProcesadas, scoreObjetivo } = prepararMetasPeriodo(
      metasResultadosBody
    );



    evaluacion = new Evaluacion({
      empleado,
      plantillaId,
      periodo: String(periodo),
      year: isNaN(anio) ? null : anio,
      creadoPor: req.user?._id || null,
      estado: "MANAGER_DRAFT",
      actual: scoreObjetivo !== null ? scoreObjetivo : (req.body.actual ?? null),
      escala: req.body.escala ?? null,
      metasResultados: metasProcesadas,
      timeline: [
        {
          by: req.user?._id,
          action: "CREATE",
          note: "Creación inicial",
        },
      ],
    });

    await evaluacion.save();

    console.log("✅ createEvaluacion GUARDADA:", {
      _id: evaluacion._id,
      empleado: evaluacion.empleado,
      plantillaId: evaluacion.plantillaId,
      periodo: evaluacion.periodo,
      year: evaluacion.year,
      estado: evaluacion.estado,
    });

    res.status(201).json(evaluacion);
  } catch (e) {
    console.error("❌ createEvaluacion error", e);
    res.status(500).json({ message: e.message || "Error creando evaluación" });
  }
}

/* ----------- Recalcular Evaluaciones (Sync con Plantilla) ----------- */

export async function recalculateEvaluaciones(req, res) {
  try {
    const { plantillaId, year, empleadoId } = req.body;

    if (!plantillaId || !year) {
      return res.status(400).json({ message: "Faltan plantillaId o year" });
    }

    // 1. Obtener la plantilla con la configuración ACTUAL
    const plantilla = await Plantilla.findById(plantillaId).lean();
    if (!plantilla) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    // 2. Buscar evaluaciones afectadas
    const q = {
      plantillaId: new mongoose.Types.ObjectId(String(plantillaId)),
      year: Number(year),
    };
    if (empleadoId) {
      q.empleado = new mongoose.Types.ObjectId(String(empleadoId));
    }

    const evaluaciones = await Evaluacion.find(q).lean(); // Use lean for performance if we just update later, but we need to save() documents. 
    // Actually, find() returns documents. Let's keep it as documents to use .save() easily, or use bulkWrite.
    // Given the previous code used .save(), let's stick to it but we need to sort them.
    // Since we need to sort, we can't rely on database cursor order unless we sort in query.
    // Let's re-fetch with sort.

    const evaluacionesDocs = await Evaluacion.find(q).sort({ empleado: 1, periodo: 1 });

    let updatedCount = 0;
    const acumuladosPorEmpleado = {}; // { [empId]: { [metaId]: value } }

    // 3. Recorrer y actualizar
    for (const ev of evaluacionesDocs) {
      const empId = String(ev.empleado);
      if (!acumuladosPorEmpleado[empId]) acumuladosPorEmpleado[empId] = {};

      if (!ev.metasResultados || ev.metasResultados.length === 0) continue;

      // Mapear metas actuales con la config nueva
      const nuevasMetasResultados = ev.metasResultados.map(m => {
        // Buscar meta correspondiente en la plantilla
        const metaConfig = plantilla.metas.find(pm =>
          (m.metaId && String(pm._id) === String(m.metaId)) ||
          pm.nombre === m.nombre
        );

        if (!metaConfig) return m; // Si no existe en plantilla, dejar como está

        // Mezclar resultado existente con NUEVA config
        const cfg = normalizarConfigMeta({
          ...m, // conservar resultado
          ...metaConfig, // sobreescribir config
          metaId: metaConfig._id, // asegurar ID correcto
        });

        // Lógica de acumulación
        let valorParaCalculo = Number(m.resultado) || 0;
        if (cfg.modoAcumulacion === "acumulativo") {
          const prev = acumuladosPorEmpleado[empId][metaConfig._id] || 0;
          valorParaCalculo += prev;

          // Actualizar acumulado para el SIGUIENTE periodo
          if (!acumuladosPorEmpleado[empId][metaConfig._id]) acumuladosPorEmpleado[empId][metaConfig._id] = 0;
          acumuladosPorEmpleado[empId][metaConfig._id] += (Number(m.resultado) || 0);
        }
        // Recalcular score y cumple
        const { score, cumple } = calcularScorePeriodoMeta(cfg, valorParaCalculo);

        return {
          metaId: metaConfig._id,
          nombre: metaConfig.nombre,
          unidad: metaConfig.unidad,
          operador: metaConfig.operador || ">=",
          esperado: metaConfig.esperado ?? metaConfig.target ?? null,
          pesoMeta: metaConfig.pesoMeta ?? null,
          reconoceEsfuerzo: cfg.reconoceEsfuerzo,
          permiteOver: cfg.permiteOver,
          tolerancia: cfg.tolerancia,
          modoAcumulacion: cfg.modoAcumulacion,
          acumulativa: metaConfig.acumulativa ?? false,
          reglaCierre: cfg.reglaCierre,
          resultado: m.resultado,
          cumple,
          scoreMeta: score,
        };
      });

      // Recalcular score objetivo global
      const nuevoScoreObjetivo = calcularScoreObjetivoDesdeMetas(nuevasMetasResultados);

      // Actualizar documento
      const metasFinales = nuevasMetasResultados.map(({ scoreMeta, ...rest }) => rest);

      ev.metasResultados = metasFinales;
      ev.actual = nuevoScoreObjetivo;

      // Timeline entry
      pushTimeline(ev, {
        by: req.user?._id,
        action: "RECALCULATE_SYNC",
        note: "Sincronización con reglas de plantilla",
      });

      await ev.save();
      updatedCount++;
    }

    res.json({ success: true, updated: updatedCount });

  } catch (e) {
    console.error("❌ recalculateEvaluaciones error", e);
    res.status(500).json({ message: e.message || "Error recalculando evaluaciones" });
  }
}
// ... existing code ...

/* ----------- DELETE (Testing Mode) ----------- */
export async function deleteEvaluacion(req, res) {
  try {
    const { id } = req.params;
    const ev = await Evaluacion.findByIdAndDelete(id);
    if (!ev) {
      return res.status(404).json({ message: "Evaluación no encontrada" });
    }
    res.json({ message: "Evaluación eliminada", id });
  } catch (e) {
    console.error("deleteEvaluacion error", e);
    res.status(500).json({ message: e.message || "Error al eliminar evaluación" });
  }
}

/**
 * GET /api/evaluaciones/previas-ingreso
 *
 * Resultados cargados en períodos anteriores a la fecha de ingreso de la
 * persona. No es un error de criterio: es un imposible, porque en esos meses
 * no estaba en la empresa, y esos valores igual cuentan para su nota.
 *
 * Solo cuenta los hitos CON DATO. Un hito vacío en un período previo es puro
 * calendario —lo genera la plantilla— y no molesta a nadie.
 */
export const listarPreviasAlIngreso = async (req, res) => {
  try {
    const empleados = await Empleado.find(
      { fechaIngreso: { $ne: null } },
      "nombre apellido fechaIngreso area sector"
    ).populate("area", "nombre").lean();

    const plantillas = await Plantilla.find({}, "year nombre").lean();
    const anioDe = new Map(plantillas.map((p) => [String(p._id), p.year]));
    const nombreDe = new Map(plantillas.map((p) => [String(p._id), p.nombre]));

    // Solo puede tener hallazgos quien NO estuvo el ciclo completo. Filtrar
    // antes de traer evaluaciones evita cargar las 4400 de toda la nómina para
    // terminar mirando las de 8 personas: la consulta pasaba de 850 ms a unos
    // pocos, y esto se pide en cada entrada a Cierre de Evaluaciones.
    const anios = [...new Set(plantillas.map((p) => p.year).filter((y) => y !== undefined))];
    const candidatos = empleados.filter((e) =>
      anios.some((a) => mesesEnCiclo(e.fechaIngreso, a) < 12)
    );

    if (candidatos.length === 0) return res.json({ total: 0, empleados: [] });

    const evaluaciones = await Evaluacion.find(
      { empleado: { $in: candidatos.map((e) => e._id) } },
      "empleado plantillaId periodo metasResultados actual"
    ).lean();

    const porEmpleado = new Map();
    for (const e of candidatos) porEmpleado.set(String(e._id), { emp: e, hallazgos: [] });

    for (const ev of evaluaciones) {
      const reg = porEmpleado.get(String(ev.empleado));
      if (!reg) continue;

      const anio = anioDe.get(String(ev.plantillaId));
      if (anio === undefined) continue;

      const meses = mesesEnCiclo(reg.emp.fechaIngreso, Number(anio));
      if (!esPeriodoAnteriorAlIngreso(ev.periodo, meses)) continue;

      const conDato =
        (ev.metasResultados || []).some(
          (m) => m.resultado !== null && m.resultado !== undefined && m.resultado !== ""
        ) || (ev.actual !== null && ev.actual !== undefined);
      if (!conDato) continue;

      reg.hallazgos.push({
        periodo: ev.periodo,
        year: anio,
        objetivo: nombreDe.get(String(ev.plantillaId)) || "(objetivo eliminado)",
      });
    }

    const resultado = [...porEmpleado.values()]
      .filter((r) => r.hallazgos.length > 0)
      .map((r) => ({
        empleadoId: String(r.emp._id),
        nombre: `${r.emp.apellido || ""}, ${r.emp.nombre || ""}`.trim(),
        area: r.emp.area?.nombre || null,
        fechaIngreso: r.emp.fechaIngreso,
        cantidad: r.hallazgos.length,
        periodos: [...new Set(r.hallazgos.map((h) => `AF${h.year} ${h.periodo}`))].sort(),
        objetivos: [...new Set(r.hallazgos.map((h) => h.objetivo))],
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    res.json({ total: resultado.reduce((a, r) => a + r.cantidad, 0), empleados: resultado });
  } catch (err) {
    console.error("listarPreviasAlIngreso error:", err);
    res.status(500).json({ message: "Error buscando evaluaciones previas al ingreso" });
  }
};

/**
 * DELETE /api/evaluaciones/previas-ingreso/:empleadoId
 *
 * Borra los resultados cargados en períodos anteriores al ingreso de UNA
 * persona. De a uno y con confirmación explícita, por dos razones:
 *
 *   · Borrar un resultado puede mover una nota. El feedback cerrado guarda su
 *     propio número, así que lo que la persona recibió no cambia — pero si
 *     alguien reabre ese feedback, se recalcula sobre lo que quede.
 *   · Un botón de "borrar todos" es exactamente lo que no queremos después de
 *     lo que pasó en septiembre.
 *
 * Sin `?confirmar=true` es una vista previa: dice qué se borraría y no toca
 * nada. Cada borrado pasa por `findByIdAndDelete`, que la auditoría registra
 * con el documento completo, así que se puede reconstruir qué decía.
 */
export const borrarPreviasAlIngreso = async (req, res) => {
  try {
    const { empleadoId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(empleadoId)) {
      return res.status(400).json({ message: "empleadoId inválido" });
    }

    const emp = await Empleado.findById(empleadoId, "nombre apellido fechaIngreso").lean();
    if (!emp) return res.status(404).json({ message: "Empleado no encontrado" });
    if (!emp.fechaIngreso) {
      return res.status(409).json({ message: "El empleado no tiene fecha de ingreso cargada." });
    }

    const plantillas = await Plantilla.find({}, "year nombre tipo").lean();
    const metaTpl = new Map(plantillas.map((p) => [String(p._id), p]));

    const evaluaciones = await Evaluacion.find({ empleado: empleadoId }).lean();
    const objetivo = [];

    for (const ev of evaluaciones) {
      const tpl = metaTpl.get(String(ev.plantillaId));
      if (!tpl) continue;

      const meses = mesesEnCiclo(emp.fechaIngreso, Number(tpl.year));
      if (!esPeriodoAnteriorAlIngreso(ev.periodo, meses)) continue;

      const conDato =
        (ev.metasResultados || []).some(
          (m) => m.resultado !== null && m.resultado !== undefined && m.resultado !== ""
        ) || (ev.actual !== null && ev.actual !== undefined);
      if (!conDato) continue;

      objetivo.push({
        _id: ev._id,
        periodo: ev.periodo,
        year: tpl.year,
        tipo: tpl.tipo,
        objetivo: tpl.nombre || "(sin nombre)",
        valores: (ev.metasResultados || []).map((m) => m.resultado),
        actual: ev.actual ?? null,
        doc: ev,   // el documento entero, para poder reconstruirlo si hace falta
      });
    }

    objetivo.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));

    // Un GET nunca borra, pase lo que pase en la query. El DELETE además
    // necesita `confirmar=true`: dos puertas, no una.
    if (req.method === "GET" || String(req.query.confirmar) !== "true") {
      return res.json({
        empleado: `${emp.apellido}, ${emp.nombre}`,
        fechaIngreso: emp.fechaIngreso,
        aBorrar: objetivo,
        total: objetivo.length,
        aplicado: false,
      });
    }

    // Se audita CADA borrado con el documento entero ANTES de borrarlo.
    //
    // El middleware genérico no puede hacerlo acá: busca el id en la URL, y en
    // esta ruta el id es el del EMPLEADO, no el de la evaluación. Por eso los
    // primeros 31 borrados quedaron registrados sin contenido y solo se
    // pudieron reconstruir del log del servidor, que es frágil: rota, se trunca
    // y nadie lo mira.
    for (const o of objetivo) {
      await Auditoria.create({
        usuarioId: req.user?._id || null,
        email: req.user?.email || "(sin usuario)",
        rol: req.user?.rolEfectivo || req.user?.rol || null,
        accion: "ELIMINAR",
        entidad: "evaluacion",
        documentoId: o._id,
        resumen: `previa al ingreso de ${emp.apellido}, ${emp.nombre}: ${o.periodo} - ${o.objetivo}`,
        antes: o.doc,
        cambios: null,
        metodo: "DELETE",
        ruta: req.originalUrl,
        statusCode: 200,
      }).catch((e) => console.error("[PreviasIngreso] no se pudo auditar:", e.message));

      await Evaluacion.findByIdAndDelete(o._id);
    }

    console.warn(
      `[PreviasIngreso] ${req.user?.email || "?"} borró ${objetivo.length} evaluaciones ` +
      `anteriores al ingreso de ${emp.apellido}, ${emp.nombre}: ` +
      JSON.stringify(objetivo.map((o) => ({ periodo: o.periodo, valores: o.valores, actual: o.actual })))
    );

    res.json({
      empleado: `${emp.apellido}, ${emp.nombre}`,
      borradas: objetivo.length,
      detalle: objetivo,
      aplicado: true,
    });
  } catch (err) {
    console.error("borrarPreviasAlIngreso error:", err);
    res.status(500).json({ message: "Error borrando las evaluaciones previas al ingreso" });
  }
};
