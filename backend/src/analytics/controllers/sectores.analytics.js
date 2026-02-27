// backend/src/analytics/controllers/sectores.analytics.js
import Sector from "../../models/Sector.model.js";

export async function analyticsSectores(req, res) {
    try {
        const sectores = await Sector.find()
            .populate("areaId", "nombre")
            .populate("referentes", "nombre apellido legajo")
            .lean();

        const rows = sectores.map(s => {
            const referentesNombres = (s.referentes || [])
                .map(r => [r.apellido, r.nombre].filter(Boolean).join(", "))
                .join(" | ");

            return {
                sector_id: String(s._id),
                nombre: s.nombre ?? null,
                area_id: s.areaId?._id ? String(s.areaId._id) : null,
                area_nombre: s.areaId?.nombre ?? null,
                hereda_referentes: s.heredaReferentes ?? true,
                cantidad_referentes: s.referentes?.length ?? 0,
                referentes: referentesNombres || null,
                createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/sectores]", err);
        res.status(500).json({ error: "Error al obtener catálogo de sectores (dependencias)." });
    }
}
