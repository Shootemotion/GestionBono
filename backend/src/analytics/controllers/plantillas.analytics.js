// backend/src/analytics/controllers/plantillas.analytics.js
// GET /api/analytics/plantillas
// Catalogo de plantillas/objetivos configurados, con scope resuelto.
// Query params opcionales: ?year=2025 | ?tipo=objetivo | ?activo=true

import Plantilla from "../../models/Plantilla.model.js";
import Area from "../../models/Area.model.js";
import Sector from "../../models/Sector.model.js";
import Empleado from "../../models/Empleado.model.js";

export async function analyticsPlantillas(req, res) {
    try {
        const filter = {};
        if (req.query.year) filter.year = Number(req.query.year);
        if (req.query.tipo) filter.tipo = req.query.tipo;
        if (req.query.activo !== undefined) filter.activo = req.query.activo === "true";

        const plantillas = await Plantilla.find(filter).lean();

        // Resolver nombres de scope en bulk para evitar N+1
        const areaIds = [], sectorIds = [], empleadoIds = [];
        for (const pl of plantillas) {
            if (pl.scopeType === "area") areaIds.push(pl.scopeId);
            else if (pl.scopeType === "sector") sectorIds.push(pl.scopeId);
            else if (pl.scopeType === "empleado" || pl.scopeType === "employee") empleadoIds.push(pl.scopeId);
        }

        const [areas, sectores, empleados] = await Promise.all([
            Area.find({ _id: { $in: areaIds } }).select("nombre").lean(),
            Sector.find({ _id: { $in: sectorIds } }).select("nombre").lean(),
            Empleado.find({ _id: { $in: empleadoIds } }).select("nombre apellido").lean(),
        ]);

        const areaMap = Object.fromEntries(areas.map((a) => [String(a._id), a.nombre]));
        const sectorMap = Object.fromEntries(sectores.map((s) => [String(s._id), s.nombre]));
        const empleadoMap = Object.fromEntries(
            empleados.map((e) => [String(e._id), [e.apellido, e.nombre].filter(Boolean).join(", ")])
        );

        const rows = plantillas.map((pl) => {
            const scopeKey = String(pl.scopeId);
            let scopeNombre = null;
            if (pl.scopeType === "area") scopeNombre = areaMap[scopeKey] ?? null;
            else if (pl.scopeType === "sector") scopeNombre = sectorMap[scopeKey] ?? null;
            else scopeNombre = empleadoMap[scopeKey] ?? null;

            return {
                plantilla_id: String(pl._id),
                tipo: pl.tipo ?? null,
                year: pl.year ?? null,
                nombre: pl.nombre ?? null,
                descripcion: pl.descripcion ?? null,
                proceso: pl.proceso ?? null,
                scopeType: pl.scopeType ?? null,
                scopeNombre,
                frecuencia: pl.frecuencia ?? null,
                pesoBase: pl.pesoBase ?? null,
                activo: pl.activo ?? false,
                version: pl.version ?? 1,
                parentPlantillaId: pl.parentPlantillaId ? String(pl.parentPlantillaId) : null,
                estadoAprobacion: pl.estadoAprobacion ?? "aprobada",
                motivoVersion: pl.motivoVersion ?? null,
                comentarioVersion: pl.comentarioVersion ?? null,
                cantMetas: Array.isArray(pl.metas) ? pl.metas.length : 0,
                fechaInicioFiscal: pl.fechaInicioFiscal
                    ? new Date(pl.fechaInicioFiscal).toISOString().split("T")[0]
                    : null,
                fechaCierre: pl.fechaCierre
                    ? new Date(pl.fechaCierre).toISOString().split("T")[0]
                    : null,
                createdAt: pl.createdAt ? new Date(pl.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/plantillas]", err);
        res.status(500).json({ error: "Error al obtener datos de plantillas." });
    }
}
