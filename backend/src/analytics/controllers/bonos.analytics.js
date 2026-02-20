// backend/src/analytics/controllers/bonos.analytics.js
// GET /api/analytics/bonos
// Una fila por empleado por año con resultado del bono anual.
// Query params opcionales: ?anio=2025 | ?estado=aprobado

import BonoAnual from "../../models/BonoAnual.model.js";

export async function analyticsBonos(req, res) {
    try {
        const filter = {};
        if (req.query.anio) filter.anio = Number(req.query.anio);
        if (req.query.estado) filter.estado = req.query.estado;

        const bonos = await BonoAnual.find(filter)
            .populate("empleado", "nombre apellido")
            .lean();

        const rows = bonos.map((b) => {
            const emp = b.empleado ?? {};

            return {
                bono_id: String(b._id),
                empleado_id: emp._id ? String(emp._id) : null,
                empleado_nombre: [emp.apellido, emp.nombre].filter(Boolean).join(", ") || null,

                // Snapshot del año (datos congelados)
                area: b.snapshot?.areaNombre ?? null,
                sector: b.snapshot?.sectorNombre ?? null,
                puesto: b.snapshot?.puesto ?? null,
                cuil: b.snapshot?.cuil ?? null,
                fechaIngreso: b.snapshot?.fechaIngreso
                    ? new Date(b.snapshot.fechaIngreso).toISOString().split("T")[0]
                    : null,

                anio: b.anio ?? null,
                estado: b.estado ?? null,

                peso_objetivos: b.pesos?.objetivos ?? null,
                peso_competencias: b.pesos?.competencias ?? null,

                resultado_objetivos: b.resultado?.objetivos ?? null,
                resultado_competencias: b.resultado?.competencias ?? null,
                resultado_total: b.resultado?.total ?? null,

                bono_base: b.bonoBase ?? null,
                bono_final: b.bonoFinal ?? null,

                createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
                updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/bonos]", err);
        res.status(500).json({ error: "Error al obtener datos de bonos." });
    }
}
