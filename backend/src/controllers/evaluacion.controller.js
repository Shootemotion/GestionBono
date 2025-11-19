// src/controllers/evaluacion.controller.js
import mongoose from "mongoose";
import Evaluacion from "../models/Evaluacion.model.js";
import {evaluarCumple,calcularResultadoGlobal } from "../../../src/lib/evaluarCumple.js";


/* ============================================================================
 * Utilidades
 * ========================================================================== */
function pushTimeline(ev, { by, action, note, snapshot }) {
  ev.timeline = ev.timeline || [];
  ev.timeline.push({ at: new Date(), by, action, note, snapshot });
}

/* ============================================================================
 * 1) EXISTENTES (se mantienen)
 * ========================================================================== */



// Actualiza un hito (una evaluación de un período para un empleado/plantilla)
export const updateHito = async (req, res) => {
  try {
    const { empleadoId, plantillaId, periodo } = req.params;
    const { year, actual, escala, comentario, applyToAll, empleadosIds, metasResultados } = req.body;

    if (!mongoose.Types.ObjectId.isValid(plantillaId)) {
      return res.status(400).json({ message: "plantillaId inválido" });
    }
    if (!periodo) {
      return res.status(400).json({ message: "El periodo es obligatorio" });
    }

    // 🔹 Procesar metas (usar 'esperado' como en tu modelo)
    let metasProcesadas = [];
    let nuevoActual = actual;

if (Array.isArray(metasResultados) && metasResultados.length > 0) {
  metasProcesadas = metasResultados.map((m) => {
    const cumple = evaluarCumple(m.resultado, m.esperado, m.operador, m.unidad);
    return {
      nombre: m.nombre,
      esperado: m.esperado,
      unidad: m.unidad,
      operador: m.operador || ">=",
      resultado: m.resultado,
      cumple,
    };
  });



 nuevoActual = calcularResultadoGlobal(metasProcesadas);
}

    const baseUpdate = {
     year: Number(String(periodo).slice(0, 4)),
      periodo,
      actual: nuevoActual,
      escala,
comentarioManager: req.body.comentarioManager ?? null,
 comentario: req.body.comentario ?? null,
      metasResultados: metasProcesadas,
      // ⚠️ clave: si el manager edita, dejamos esto en borrador
      estado: "MANAGER_DRAFT",
    };

    // Target de empleados
    let targetEmpleados = [empleadoId];

    if (applyToAll) {
      const allEvals = await Evaluacion.find({ plantillaId, year: Number(year) }, "empleado");
      targetEmpleados = allEvals.map((e) => String(e.empleado));
    }

    if (empleadosIds?.length) {
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

// 📊 listar evaluaciones del empleado por año (ruta existente)
// controllers/evaluacion.controller.js
export const getEvaluacionesEmpleado = async (req, res, next) => {
  try {
    const { empleadoId } = req.params;
    const evaluaciones = await Evaluacion.find({ empleado: empleadoId }).lean();
    res.json(evaluaciones);
  } catch (err) {
    next(err);
  }
};


// Actualización de hitos en lote
export const updateHitoMultiple = async (req, res) => {
  try {
    const { year, plantillaId, periodo, empleadoIds, escala, comentario, metasResultados } = req.body;

    if (!year || !plantillaId || !periodo || !Array.isArray(empleadoIds)) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    // Procesar metas
    let metasProcesadas = [];
    let nuevoActual = null;

    if (Array.isArray(metasResultados) && metasResultados.length > 0) {
      metasProcesadas = metasResultados.map((m) => {
        const cumple =
          m.resultado !== null && m.esperado !== undefined
            ? Number(m.resultado) >= Number(m.esperado)
            : false;

        return {
          nombre: m.nombre,
          esperado: m.esperado,
          unidad: m.unidad,
          resultado: m.resultado,
          cumple,
        };
      });

      
      nuevoActual = calcularResultadoGlobal(metasProcesadas);
    }

    const baseUpdate = {

      periodo,
      actual: nuevoActual,
      escala,
      comentarioManager: req.body.comentarioManager ?? null,
      comentario: req.body.comentario ?? null,
      metasResultados: metasProcesadas,
      // ⚠️ clave: si el manager edita, dejamos esto en borrador
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
    res.status(500).json({ message: err.message || "Error actualizando hitos múltiples" });
  }
};

/* ============================================================================
 * 2) NUEVOS: consultas y flujo de estados
 * ========================================================================== */
 

// Listado flexible: /evaluaciones?empleado=&year=&plantillaId=&periodo=
export async function listEvaluaciones(req, res) {
  try {
    const { empleado, year, plantillaId, periodo } = req.query;

    console.log("📡 listEvaluaciones RAW query:", req.query);

    const q = {};
    if (empleado) q.empleado = new mongoose.Types.ObjectId(String(empleado));
    if (plantillaId) q.plantillaId = new mongoose.Types.ObjectId(String(plantillaId));
    if (periodo) q.periodo = String(periodo);
    if (year) q.year = Number(year);

    console.log("📡 listEvaluaciones filtro aplicado:", q);

   const items = await Evaluacion.find(q)
      .populate("plantillaId", "nombre pesoBase metas fechaLimite descripcion proceso")
      .lean();

    // merge: devolver los campos de la plantilla junto con la evaluacion
    const merged = items.map(ev => {
      const pl = ev.plantillaId || {};
   return {
    ...ev,
    plantillaId: pl._id || ev.plantillaId,
    nombre: pl.nombre || ev.nombre,
    descripcion: pl.descripcion || ev.descripcion,
    proceso: pl.proceso || ev.proceso,
    pesoBase: pl.pesoBase !== undefined ? Number(pl.pesoBase) : (ev.pesoBase !== undefined ? Number(ev.pesoBase) : null),
    fechaLimite: pl.fechaLimite || ev.fechaLimite || null,
    metas: (pl.metas && pl.metas.length > 0) ? pl.metas : ev.metasResultados || [],
  };
});

    console.log("📡 listEvaluaciones merged:", merged.length);
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
    console.log("📥 getEvaluacionById param:", id);

   const ev = await Evaluacion.findById(id)
      .populate("plantillaId", "nombre pesoBase metas fechaLimite descripcion proceso")
      .lean();

    if (!ev) {
      console.warn("⚠ Evaluación no encontrada para ID:", id);
      return res.status(404).json({ message: "Evaluación no encontrada" });
    }

    const pl = ev.plantillaId || {};
 const merged = {
  ...ev,
  plantillaId: pl._id || ev.plantillaId,
  nombre: pl.nombre || ev.nombre,
  descripcion: pl.descripcion || ev.descripcion,
  proceso: pl.proceso || ev.proceso,
  pesoBase: pl.pesoBase !== undefined ? Number(pl.pesoBase) : (ev.pesoBase !== undefined ? Number(ev.pesoBase) : null),
  fechaLimite: pl.fechaLimite || ev.fechaLimite || null,
  metas: (pl.metas && pl.metas.length > 0) ? pl.metas : ev.metasResultados || [],
};

    console.log("🟢 getEvaluacionById merged:", {
      _id: merged._id,
      empleado: merged.empleado,
      plantillaId: merged.plantillaId,
      periodo: merged.periodo,
      year: merged.year,
      estado: merged.estado,
      pesoBase: merged.pesoBase,
      metasCount: merged.metas?.length || 0,
    });

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
      return res.status(409).json({ message: "Solo editable en MANAGER_DRAFT" });
    }

    // Campos permitidos en borrador del jefe:
    const allowed = ["actual", "escala", "comentarioManager", "metasResultados", "comentario"];
    allowed.forEach((k) => {
      if (body[k] !== undefined) ev[k] = body[k];
    });

    // Opcional: recalcular 'actual' si metas vienen crudas con esperado/resultado
    if (Array.isArray(ev.metasResultados) && ev.metasResultados.length > 0) {
      const total = ev.metasResultados.length;
      const cumplidas = ev.metasResultados.filter((m) => !!m.cumple).length;
      ev.actual = total > 0 ? Math.round((cumplidas / total) * 100) : ev.actual ?? null;
    }

    if (!ev.manager && req.user?._id) ev.manager = req.user._id;

    pushTimeline(ev, { by: req.user?._id, action: "MANAGER_EDIT", snapshot: body });
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
      return res.status(409).json({ message: "Estado inválido para enviar al empleado" });
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
  return res.status(409).json({ message: "Estado inválido para ACK" });
}

    const userEmpId = String(req.user?.empleadoId?._id || req.user?.empleadoId);
    if (!userEmpId || String(ev.empleado) !== userEmpId) {
      return res.status(403).json({ message: "No autorizado (ACK solo por el empleado)" });
    }

    if (comentarioEmpleado !== undefined) {
      ev.comentarioEmpleado = comentarioEmpleado || ev.comentarioEmpleado || "";
    }

    ev.empleadoAck = { estado: "ACK", fecha: new Date(), userId: req.user?._id };
    ev.estado = "PENDING_HR";
    pushTimeline(ev, { by: req.user?._id, action: "EMPLOYEE_ACK", note: comentarioEmpleado });
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
  return res.status(409).json({ message: "Estado inválido para contestar" });
}
    const userEmpId = String(req.user?.empleadoId?._id || req.user?.empleadoId);
    if (!userEmpId || String(ev.empleado) !== userEmpId) {
      return res.status(403).json({ message: "No autorizado (solo el empleado puede contestar)" });
    }

    ev.comentarioEmpleado = comentarioEmpleado || ev.comentarioEmpleado || "";
    ev.empleadoAck = { estado: "CONTEST", fecha: new Date(), userId: req.user?._id };
    ev.estado = "PENDING_HR";
    pushTimeline(ev, { by: req.user?._id, action: "EMPLOYEE_CONTEST", note: comentarioEmpleado });
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
      return res.status(409).json({ message: "Estado inválido para enviar a RRHH" });
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
      return res.status(409).json({ message: "Solo se puede cerrar desde PENDING_HR" });
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
      return res.status(409).json({ message: "Solo se puede reabrir desde PENDING_HR o CLOSED" });
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




// src/controllers/evaluacion.controller.js
export async function listPendingHR(req, res) {
  try {
    const { periodo, plantillaId } = req.query;
    const q = { estado: "PENDING_HR" };
    if (periodo) q.periodo = String(periodo);
    if (plantillaId) q.plantillaId = new mongoose.Types.ObjectId(String(plantillaId));

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
        path: "manager",      // ahora ref: "Usuario"
        select: "nombre apellido email",
      })
      .populate({
        path: "plantillaId",
        select: "nombre fechaLimite",
      })
      .lean();

    const mapped = items.map(ev => ({
      ...ev,
      plantilla: ev.plantillaId
        ? {
            _id: ev.plantillaId._id,
            nombre: ev.plantillaId.nombre,
            fechaLimite: ev.plantillaId.fechaLimite || null,
          }
        : null,
    }));

    // Para que veas qué viene
    console.log("🔎 listPendingHR ejemplo:", mapped[0]);

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
      q._id = { $in: ids.map(id => new mongoose.Types.ObjectId(String(id))) };
    } else if (filtro) {
      if (filtro.periodo) q.periodo = String(filtro.periodo);
      if (filtro.plantillaId) q.plantillaId = new mongoose.Types.ObjectId(String(filtro.plantillaId));
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

// Crear evaluación desde cero (si no existe aún)
export async function createEvaluacion(req, res) {
  try {
    console.log("📥 createEvaluacion BODY recibido:", req.body);

    const { empleado, plantillaId, periodo } = req.body;
    if (!empleado || !plantillaId || !periodo) {
      console.warn("⚠ createEvaluacion faltan campos", { empleado, plantillaId, periodo });
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    let evaluacion = await Evaluacion.findOne({ empleado, plantillaId, periodo }).lean();
    console.log("🔍 createEvaluacion búsqueda existente:", evaluacion ? "YA EXISTE" : "NO EXISTE");

    if (evaluacion) {
      console.log("↪️ Devolviendo evaluación existente:", evaluacion._id);
      return res.status(200).json(evaluacion);
    }

    const anio = parseInt(String(periodo).substring(0, 4), 10);
    
const metasResultados = req.body.metasResultados || [];
    const actual = metasResultados.length > 0
      ? calcularResultadoGlobal(metasResultados)
      : null;

    evaluacion = new Evaluacion({
      empleado,
      plantillaId,
      periodo: String(periodo),
      year: isNaN(anio) ? null : anio,
      creadoPor: req.user?._id || null,
      estado: "MANAGER_DRAFT",
      actual,
      metasResultados,
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