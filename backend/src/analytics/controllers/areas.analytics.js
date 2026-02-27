// backend/src/analytics/controllers/areas.analytics.js
import Area from "../../models/Area.model.js";

export async function analyticsAreas(req, res) {
    try {
        const areas = await Area.find()
            .populate("referentes", "nombre apellido legajo")
            .lean();

        const rows = areas.map(a => {
            const referentesNombres = (a.referentes || [])
                .map(r => [r.apellido, r.nombre].filter(Boolean).join(", "))
                .join(" | ");

            return {
                area_id: String(a._id),
                nombre: a.nombre ?? null,
                cantidad_referentes: a.referentes?.length ?? 0,
                referentes: referentesNombres || null,
                createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/areas]", err);
        res.status(500).json({ error: "Error al obtener catálogo de áreas." });
    }
}
