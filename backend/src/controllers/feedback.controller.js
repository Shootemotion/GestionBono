import Feedback from "../models/Feedback.model.js";
import { computeForEmployees } from "./dashboard.controller.js";
import { calculateObjectiveProgress } from "../lib/scoreEngineUnified.js";

// Helper to auto-close overdue feedbacks
const checkAutoCloseFeedbacks = async (empleadoId = null) => {
    try {
        const query = { estado: "SENT" };
        if (empleadoId) query.empleado = empleadoId;

        const candidates = await Feedback.find(query);
        const now = new Date();

        for (const fb of candidates) {
            let globalDeadline = null;
            // Fiscal Year Logic: year 2025 => Sep 2025 - Aug 2026
            const y = fb.year;

            if (fb.periodo === "Q1") globalDeadline = new Date(y, 11, 15); // Dec 15 of starting year
            else if (fb.periodo === "Q2") globalDeadline = new Date(y + 1, 2, 15); // Mar 15 of next year
            else if (fb.periodo === "Q3") globalDeadline = new Date(y + 1, 5, 15); // Jun 15 of next year
            else if (fb.periodo === "FINAL") globalDeadline = new Date(y + 1, 8, 15); // Sep 15 of next year

            // Calculate Dynamic Deadline (Submission + 5 Days)
            let dynamicDeadline = null;
            if (fb.submittedToEmployeeAt) {
                dynamicDeadline = new Date(fb.submittedToEmployeeAt);
                dynamicDeadline.setDate(dynamicDeadline.getDate() + 5);
            }

            // Determine Effective Deadline
            // If the manager sent/reopened it, ALWAYS grant the full 5-day dynamicDeadline, even if past globalDeadline.
            let effectiveDeadline = dynamicDeadline || globalDeadline;

            // Set end of day for deadline
            if (effectiveDeadline) {
                effectiveDeadline.setHours(23, 59, 59, 999);

                if (now > effectiveDeadline) {
                    fb.estado = "PENDING_HR";
                    fb.empleadoAck = {
                        estado: "SYSTEM_CLOSED",
                        fecha: now
                    };
                    if (!fb.comentarioEmpleado) {
                        fb.comentarioEmpleado = "Cerrado automáticamente por sistema debido a falta de respuesta en plazo.";
                    }
                    await fb.save();
                    console.log(`Feedback auto-closed for employee ${fb.empleado} period ${fb.periodo} (Deadline: ${effectiveDeadline.toISOString().split('T')[0]})`);
                }
            }
        }
    } catch (e) {
        console.error("Error in auto-close check:", e);
    }
};

export const getFeedbacksByEmpleado = async (req, res) => {
    try {
        const { empleadoId } = req.params;
        const { year } = req.query;

        // Lazy check for expiration
        await checkAutoCloseFeedbacks(empleadoId);

        const query = { empleado: empleadoId };
        if (year) query.year = Number(year);

        // Security: If the user is viewing their OWN feedbacks, do NOT show DRAFTs.
        // DRAFTs are for the creator (Manager) only until sent.
        const requestorId = req.user?.empleadoId || req.user?.empleado?._id;
        if (requestorId && String(requestorId) === String(empleadoId)) {
            query.estado = { $ne: "DRAFT" };
        }

        const feedbacks = await Feedback.find(query)
            .populate({
                path: "creadoPor",
                select: "nombre email empleado",
                populate: {
                    path: "empleado",
                    select: "nombre apellido fotoUrl"
                }
            })
            .sort({ periodo: 1 });
        res.json(feedbacks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener feedbacks" });
    }
};

export const saveFeedback = async (req, res) => {
    try {
        const {
            empleado, year, periodo,
            comentario, estado, fechaRealizacion,
            comentarioEmpleado, empleadoAck,
            scores, // Scores calculated by frontend
            motivoDesacuerdo
        } = req.body;

        if (!empleado || !year || !periodo) {
            return res.status(400).json({ message: "Faltan datos obligatorios" });
        }

        // Check existing
        let existing = await Feedback.findOne({ empleado, year, periodo });
        let correctionCount = existing?.correctionCount || 0;

        const isEmployee = req.user?.empleadoId && String(req.user.empleadoId) === String(empleado);

        const data = {
            empleado,
            year,
            periodo,
            comentario,
            estado,
            fechaRealizacion: fechaRealizacion || new Date(),
            comentarioEmpleado,
            empleadoAck,
            scores,
            motivoDesacuerdo,
        };

        // Determine if this is a "Manager Action" (creating/updating feedback content)

        // This allows capturing the creator even if the user is evaluating themselves (isEmployee === true)
        // This allows capturing the creator even if the user is evaluating themselves (isEmployee === true)
        // We set creadoPor if it's not set yet, or if it's a manager acting on someone else.
        if (!isEmployee || (!existing?.creadoPor && (estado === "SENT" || estado === "DRAFT"))) {
            if (!existing?.creadoPor || !isEmployee) {
                data.creadoPor = req.user?._id;
            }

            // Logic for correction limit (Manager sending feedback)
            if (!isEmployee && existing && ["SENT", "ACKNOWLEDGED", "CLOSED"].includes(existing.estado)) {
                // If trying to update an already sent feedback
                if (correctionCount >= 1) {
                    return res.status(400).json({ message: "Solo se permite una corrección después de enviar el feedback." });
                }
                correctionCount += 1;
            }
            data.correctionCount = correctionCount;
        }

        // Si cambia a SENT, setear fecha envio si no existe
        if (estado === "SENT" && (!existing || !existing.submittedToEmployeeAt)) {
            data.submittedToEmployeeAt = new Date();
        }
        // Si cambia a CLOSED, setear fecha cierre
        if (estado === "CLOSED") {
            data.closedAt = new Date();
        }



        const updated = await Feedback.findOneAndUpdate(
            { empleado, year, periodo },
            { $set: data },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al guardar feedback" });
    }
};

export const getPendingFeedbacks = async (req, res) => {
    try {
        // Lazy check for expiration (global)
        await checkAutoCloseFeedbacks();

        const { periodo, year } = req.query;
        // Allows HR to see ALL feedbacks (DRAFT, SENT, PENDING_HR, CLOSED) 
        // preventing them from "disappearing" from the tracking dashboard when reopened to SENT.
        const query = {};

        if (periodo) query.periodo = periodo;
        if (year) query.year = Number(year);

        const feedbacks = await Feedback.find(query)
            .populate("empleado", "nombre apellido area sector")
            .populate({
                path: "creadoPor",
                select: "nombre email empleado",
                populate: { path: "empleado", select: "nombre apellido" }
            })
            .sort({ "empleado.apellido": 1 });

        res.json(feedbacks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener feedbacks pendientes" });
    }
};

export const closeFeedbacksBulk = async (req, res) => {
    try {
        const { ids, comentarioRRHH } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "Se requieren IDs para cerrar" });
        }

        const updateData = {
            estado: "CLOSED",
            closedAt: new Date()
        };

        if (comentarioRRHH) {
            updateData.comentarioRRHH = comentarioRRHH;
        }

        const result = await Feedback.updateMany(
            { _id: { $in: ids } },
            { $set: updateData }
        );

        res.json({ message: "Feedbacks cerrados correctamente", modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al cerrar feedbacks" });
    }
};
// testing
export const deleteFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Feedback.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: "Feedback no encontrado" });
        }
        res.json({ message: "Feedback eliminado", id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al eliminar feedback" });
    }
};

export const getPendingNotifications = async (req, res) => {
    try {
        const empleadoId = req.user?.empleadoId || req.user?.empleado?._id;

        if (!empleadoId) {
            return res.json([]);
        }

        // Buscar feedbacks ENVIADOS al empleado pero que este NO respondió aún
        const pending = await Feedback.find({
            empleado: empleadoId,
            estado: "SENT",
            $or: [
                { empleadoAck: { $exists: false } },
                { "empleadoAck.estado": null }
            ]
        }).select("periodo year estado submittedToEmployeeAt");

        res.json(pending);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener notificaciones" });
    }
};

export const reopenFeedback = async (req, res) => {
    try {
        const { id } = req.params;

        // Ensure only admin/HR/directivo can do this (handled via middleware in routes ideally)
        const feedback = await Feedback.findById(id);

        if (!feedback) {
            return res.status(404).json({ message: "Feedback no encontrado" });
        }

        // Only allow reopening if it's strictly closed or pending HR
        if (!["PENDING_HR", "CLOSED"].includes(feedback.estado)) {
            return res.status(400).json({ message: "El feedback debe estar cerrado o pendiente por RRHH para ser reabierto" });
        }

        // Reset the timer and status
        feedback.estado = "SENT";
        feedback.submittedToEmployeeAt = new Date(); // Reset the 5-day timer

        // Clear previous automatic closures or employee's acknowledgements
        feedback.empleadoAck = undefined;
        if (feedback.comentarioEmpleado?.includes("Cerrado automáticamente por sistema")) {
            feedback.comentarioEmpleado = "";
        }

        await feedback.save();

        res.json({ message: "Feedback reabierto con éxito. El empleado cuenta con 5 días para firmar su conformidad.", feedback });
    } catch (error) {
        console.error("Error reopening feedback:", error);
        res.status(500).json({ message: "Error al intentar reabrir el feedback" });
    }
};

export const reopenFeedbacksBulk = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "Se requieren IDs para reabrir múltiples feedbacks" });
        }

        const result = await Feedback.updateMany(
            {
                _id: { $in: ids },
                estado: { $in: ["PENDING_HR", "CLOSED"] }
            },
            {
                $set: {
                    estado: "SENT",
                    submittedToEmployeeAt: new Date()
                },
                $unset: {
                    empleadoAck: ""
                }
            }
        );

        // We can't easily dynamically pull the exact "Cerrado automáticamente" string out 
        // using just an updateMany without pipeline, so we clean it roughly via another operation or ignore it.
        // For complete correctness we can do a second update for those specific comments:
        await Feedback.updateMany(
            {
                _id: { $in: ids },
                comentarioEmpleado: { $regex: /Cerrado automáticamente por sistema/ }
            },
            {
                $set: { comentarioEmpleado: "" }
            }
        );

        res.json({ message: `Se reabrieron ${result.modifiedCount} feedbacks correctamente.`, modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error bulk reopening feedbacks:", error);
        res.status(500).json({ message: "Error al intentar reabrir los feedbacks masivamente" });
    }
};

// ============================================================================
// PANEL DE AUDITORIA DE SCORES (Superadmin O RRHH)
// ============================================================================

function getPeriodMonth(p) {
    if (!p) return 0;
    if (p === "Q1")    return 3;
    if (p === "Q2")    return 6;
    if (p === "Q3")    return 9;
    if (p === "FINAL") return 12;
    const suffix = p.length > 4 && !isNaN(p.slice(0, 4)) ? p.slice(4) : p;
    if (suffix.startsWith("M")) { const m = parseInt(suffix.slice(1)); return m >= 9 ? m - 8 : m + 4; }
    if (suffix.startsWith("Q")) return parseInt(suffix.slice(1)) * 3;
    return 12;
}

function calcularScoresParaPeriodo(metrics, period) {
    const feedbackLimit = getPeriodMonth(period);

    // OBJETIVOS 
    const objetivos = metrics.objetivos?.items || metrics.objetivos || [];
    let totalObjScore = 0;
    const breakdownObj = [];

    objetivos.forEach(obj => {
        const hitosRelevantes = (obj.hitos || []).filter(
            h => getPeriodMonth(h.periodo) <= feedbackLimit
        );
        if (hitosRelevantes.length === 0) return;

        // Use Unified Engine logic (same as Frontend)
        const isFinalPeriod = feedbackLimit === 12;
        const progreso = calculateObjectiveProgress(obj, hitosRelevantes, isFinalPeriod);
        console.log(`[AUDIT] Obj: ${obj.nombre}, Metas: ${obj.metas?.length || 0}, Progreso: ${progreso}%`);        
        totalObjScore  += (progreso * (obj.peso || 0));
        breakdownObj.push({
            nombre: obj.nombre,
            peso: obj.peso,
            progreso,
            contribucion: (progreso * (obj.peso || 0)) / 100 * 0.7
        });
    });

    // Normalización: Dividimos por 100 siempre, NO por la suma de pesos evaluados.
    // Esto asegura escala absoluta (ej: 10 pts de 100) y no infla scores parciales.
    const scoreObjRaw = totalObjScore / 100;
    const scoreObjWeighted = scoreObjRaw * 0.7;

    // COMPETENCIAS 
    const aptitudes = metrics.aptitudes?.items || metrics.aptitudes || [];
    let totalCompScore = 0, compCount = 0;

    aptitudes.forEach(apt => {
        const hitosRelevantes = (apt.hitos || []).filter(
            h => h.actual !== null && h.actual !== undefined
              && getPeriodMonth(h.periodo) <= feedbackLimit
        );
        if (hitosRelevantes.length === 0) return;

        const avg = Math.round(hitosRelevantes.reduce((s, h) => s + Number(h.actual ?? 0), 0) / hitosRelevantes.length);
        totalCompScore += avg;
        compCount++;
    });

    const scoreCompRaw     = compCount > 0 ? totalCompScore / compCount : 0;
    const scoreCompWeighted = scoreCompRaw * 0.3;

    console.log(`[AUDIT] Periodo: ${period}, ObjScoreRaw: ${scoreObjRaw.toFixed(2)}, FinalObj: ${scoreObjWeighted.toFixed(2)}`);

    return {
        version: "v2.0-unified",
        obj:    +(scoreObjWeighted.toFixed(4)),
        comp:   +(scoreCompWeighted.toFixed(4)),
        global: +((scoreObjWeighted + scoreCompWeighted).toFixed(4)),
        breakdownObj
    };
}

export const auditScores = async (req, res) => {
    try {
        const { year = 2025, empleadoId } = req.query;

        const feedbackQuery = { year: Number(year) };
        if (empleadoId) feedbackQuery.empleado = empleadoId;

        // Solo traer feedbacks con sus scores almacenados en BD
        // El cálculo "en vivo" lo realiza el frontend con la misma lógica que la Sala de Evaluación
        const feedbacks = await Feedback.find(feedbackQuery)
            .populate("empleado", "nombre apellido")
            .lean();

        if (!feedbacks || feedbacks.length === 0) {
            return res.json({ results: [] });
        }

        // Agrupar por empleado
        const empMap = new Map();
        feedbacks.forEach(fb => {
            const eid = String(fb.empleado._id);
            if (!empMap.has(eid)) {
                empMap.set(eid, {
                    empleadoId: eid,
                    empleado: `${fb.empleado.apellido}, ${fb.empleado.nombre}`,
                    feedbacks: []
                });
            }
            empMap.get(eid).feedbacks.push({
                _id: String(fb._id),
                periodo: fb.periodo,
                estado: fb.estado,
                // scores almacenados en BD (pueden estar desactualizados)
                bdScores: {
                    obj: Number(fb.scores?.obj ?? 0),
                    comp: Number(fb.scores?.comp ?? 0),
                    global: Number(fb.scores?.global ?? 0)
                }
            });
        });

        const empleadosArr = Array.from(empMap.values());
        // Ordenar feedbacks por período dentro de cada empleado
        empleadosArr.forEach(emp => {
            emp.feedbacks.sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo));
        });

        res.json({ results: empleadosArr });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al auditar scores" });
    }
};

// fixScores: Acepta los scores calculados por el FRONTEND (misma lógica que la Sala de Evaluación)
// y los guarda en la BD. No recalcula nada para evitar discrepancias.
export const fixScores = async (req, res) => {
    try {
        const { feedbackId, scores } = req.body;

        if (!feedbackId || !scores) {
            return res.status(400).json({ message: "Faltan parametros: feedbackId y scores son requeridos" });
        }

        const obj = Number(scores.obj ?? 0);
        const comp = Number(scores.comp ?? 0);
        const global = Number(scores.global ?? 0);

        await Feedback.updateOne(
            { _id: feedbackId },
            {
                $set: {
                    "scores.obj": obj,
                    "scores.comp": comp,
                    "scores.global": global
                }
            }
        );

        res.json({ message: "Scores corregidos", saved: { obj, comp, global } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al corregir scores" });
    }
};
