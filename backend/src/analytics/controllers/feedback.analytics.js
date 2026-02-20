// backend/src/analytics/controllers/feedback.analytics.js
// GET /api/analytics/feedback
// Una fila por sesion de feedback (Q1/Q2/Q3/FINAL) con scores y estado.
// Query params opcionales: ?year=2025 | ?periodo=FINAL | ?estado=CLOSED

import Feedback from "../../models/Feedback.model.js";

export async function analyticsFeedback(req, res) {
    try {
        const filter = {};
        if (req.query.year) filter.year = Number(req.query.year);
        if (req.query.periodo) filter.periodo = req.query.periodo;
        if (req.query.estado) filter.estado = req.query.estado;

        const feedbacks = await Feedback.find(filter)
            .populate({
                path: "empleado",
                select: "nombre apellido puesto area sector",
                populate: [
                    { path: "area", select: "nombre" },
                    { path: "sector", select: "nombre" },
                ],
            })
            .lean();

        const rows = feedbacks.map((fb) => {
            const emp = fb.empleado ?? {};

            return {
                feedback_id: String(fb._id),
                empleado_id: emp._id ? String(emp._id) : null,
                empleado_nombre: [emp.apellido, emp.nombre].filter(Boolean).join(", ") || null,
                area: emp.area?.nombre ?? null,
                sector: emp.sector?.nombre ?? null,
                puesto: emp.puesto ?? null,

                year: fb.year ?? null,
                periodo: fb.periodo ?? null,
                estado: fb.estado ?? null,

                score_obj: fb.scores?.obj ?? null,
                score_comp: fb.scores?.comp ?? null,
                score_global: fb.scores?.global ?? null,

                empleadoAck: fb.empleadoAck?.estado ?? null,
                motivoDesacuerdo: fb.motivoDesacuerdo ?? null,

                fechaRealizacion: fb.fechaRealizacion ? new Date(fb.fechaRealizacion).toISOString().split("T")[0] : null,
                closedAt: fb.closedAt ? new Date(fb.closedAt).toISOString() : null,
                createdAt: fb.createdAt ? new Date(fb.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/feedback]", err);
        res.status(500).json({ error: "Error al obtener datos de feedback." });
    }
}
