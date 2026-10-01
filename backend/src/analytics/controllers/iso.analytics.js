// backend/src/analytics/controllers/iso.analytics.js
// GET /api/analytics/iso
// Combina ProcesoISO y ObjetivoISO y exporta la relación plana

import ProcesoISO from "../../models/ProcesoISO.model.js";
import ObjetivoISO from "../../models/ObjetivoISO.model.js";

export async function analyticsISO(req, res) {
    try {
        const filterProc = {};
        if (req.query.year) filterProc.year = Number(req.query.year);
        if (req.query.activo !== undefined) filterProc.activo = req.query.activo === "true";

        // Obtener todos los procesos que coinciden.
        // FIX: el campo real es 'objetivosISO' (array), no 'objetivoISOId'.
        const procesos = await ProcesoISO.find(filterProc)
            .populate({
                path: "objetivosISO",
                populate: {
                    path: "representante",
                    select: "nombre apellido legajo",
                }
            })
            .lean();

        // Relación plana: una fila por cada par (proceso, objetivo).
        const rows = procesos.flatMap(proc => {
            const base = {
                proceso_id: String(proc._id),
                proceso_codigo: proc.codigo ?? null,
                proceso_nombre: proc.nombre ?? null,
                proceso_descripcion: proc.descripcion ?? null,
                year: proc.year ?? null,
                proceso_activo: proc.activo ?? false,
                createdAt: proc.createdAt ? new Date(proc.createdAt).toISOString() : null,
            };

            const objetivos = Array.isArray(proc.objetivosISO) ? proc.objetivosISO : [];

            // Proceso sin objetivos → igual emitimos una fila (con objetivo nulo).
            if (objetivos.length === 0) {
                return [{
                    ...base,
                    objetivo_id: null, objetivo_codigo: null, objetivo_nombre: null,
                    objetivo_descripcion: null, objetivo_activo: false,
                    representante_id: null, representante_nombre: null, representante_legajo: null,
                }];
            }

            return objetivos.map(obj => {
                const rep = obj?.representante || {};
                return {
                    ...base,
                    objetivo_id: obj?._id ? String(obj._id) : null,
                    objetivo_codigo: obj?.codigo ?? null,
                    objetivo_nombre: obj?.nombre ?? null,
                    objetivo_descripcion: obj?.descripcion ?? null,
                    objetivo_activo: obj?.activo ?? false,
                    representante_id: rep._id ? String(rep._id) : null,
                    representante_nombre: [rep.apellido, rep.nombre].filter(Boolean).join(", ") || null,
                    representante_legajo: rep.legajo ?? null,
                };
            });
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/iso]", err);
        res.status(500).json({ error: "Error al obtener datos de ISO." });
    }
}
