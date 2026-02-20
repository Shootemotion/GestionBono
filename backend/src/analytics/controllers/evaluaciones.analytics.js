// backend/src/analytics/controllers/evaluaciones.analytics.js
// GET /api/analytics/evaluaciones
// Una fila por evaluacion, con datos del empleado y plantilla incorporados.
// Query params opcionales: ?year=2025 | ?estado=CLOSED

import Evaluacion from "../../models/Evaluacion.model.js";

export async function analyticsEvaluaciones(req, res) {
    try {
        const filter = {};
        if (req.query.year) filter.year = Number(req.query.year);
        if (req.query.estado) filter.estado = req.query.estado;

        const evaluaciones = await Evaluacion.find(filter)
            .populate("empleado", "nombre apellido puesto area sector")
            .populate({
                path: "empleado",
                populate: [
                    { path: "area", select: "nombre" },
                    { path: "sector", select: "nombre" },
                ],
            })
            .populate("plantillaId", "nombre tipo proceso pesoBase frecuencia")
            .lean();

        const rows = evaluaciones.map((ev) => {
            const emp = ev.empleado ?? {};
            const pl = ev.plantillaId ?? {};

            return {
                evaluacion_id: String(ev._id),
                empleado_id: emp._id ? String(emp._id) : null,
                empleado_nombre: [emp.apellido, emp.nombre].filter(Boolean).join(", ") || null,
                area: emp.area?.nombre ?? null,
                sector: emp.sector?.nombre ?? null,
                puesto: emp.puesto ?? null,

                plantilla_id: pl._id ? String(pl._id) : null,
                plantilla_nombre: pl.nombre ?? null,
                plantilla_tipo: pl.tipo ?? null,
                plantilla_proceso: pl.proceso ?? null,
                plantilla_peso: pl.pesoBase ?? null,
                plantilla_frecuencia: pl.frecuencia ?? null,

                year: ev.year ?? null,
                periodo: ev.periodo ?? null,
                estado: ev.estado ?? null,

                score: ev.actual ?? null,
                escala: ev.escala ?? null,
                empleadoAck: ev.empleadoAck?.estado ?? null,

                closedAt: ev.closedAt ? new Date(ev.closedAt).toISOString() : null,
                createdAt: ev.createdAt ? new Date(ev.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/evaluaciones]", err);
        res.status(500).json({ error: "Error al obtener datos de evaluaciones." });
    }
}
