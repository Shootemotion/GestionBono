// backend/src/analytics/controllers/usuarios.analytics.js
import Usuario from "../../models/Usuario.model.js";

export async function analyticsUsuarios(req, res) {
    try {
        const usuarios = await Usuario.find()
            .populate({
                path: "empleado",
                select: "nombre apellido dni legajo email cuil puesto",
                populate: [
                    { path: "area", select: "nombre" },
                    { path: "sector", select: "nombre" }
                ]
            })
            .lean();

        const rows = usuarios.map(u => {
            const emp = u.empleado || {};

            return {
                usuario_id: String(u._id),
                email_usuario: u.email ?? null,
                rol: u.rol ?? null,
                estado_cuenta: u.status ?? null,
                activo: u.activo ?? false,
                ultimo_login: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,

                // Cruce con legajo (si lo tiene asociado)
                empleado_id: emp._id ? String(emp._id) : null,
                nombre_completo: emp.nombre ? [emp.apellido, emp.nombre].filter(Boolean).join(", ") : null,
                dni: emp.dni ?? null,
                puesto: emp.puesto ?? null,
                area_nombre: emp.area?.nombre ?? null,
                sector_nombre: emp.sector?.nombre ?? null,

                createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/usuarios]", err);
        res.status(500).json({ error: "Error al obtener catálogo de usuarios." });
    }
}
