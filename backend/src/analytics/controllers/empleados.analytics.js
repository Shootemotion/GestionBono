// backend/src/analytics/controllers/empleados.analytics.js
// GET /api/analytics/empleados
// Devuelve un array plano de empleados con area y sector incorporados.

import Empleado from "../../models/Empleado.model.js";

export async function analyticsEmpleados(req, res) {
    try {
        const filter = {};
        if (req.query.estadoLaboral) filter.estadoLaboral = req.query.estadoLaboral;

        const empleados = await Empleado.find(filter)
            .populate("area", "nombre")
            .populate("sector", "nombre")
            .lean();

        const now = new Date();

        const rows = empleados.map((e) => {
            const ingreso = e.fechaIngreso ? new Date(e.fechaIngreso) : null;
            const antiguedadAnios = ingreso
                ? Math.floor((now - ingreso) / (1000 * 60 * 60 * 24 * 365.25))
                : null;

            return {
                _id: String(e._id),
                nombre: e.nombre ?? null,
                apellido: e.apellido ?? null,
                apodo: e.apodo ?? null,
                nombreCompleto: [e.apellido, e.nombre].filter(Boolean).join(", "),
                dni: e.dni ?? null,
                cuil: e.cuil ?? null,
                email: e.email ?? null,
                celular: e.celular ?? null,
                domicilio: e.domicilio ?? null,
                puesto: e.puesto ?? null,
                categoria: e.categoria ?? null,
                genero: e.genero ?? null,
                estadoLaboral: e.estadoLaboral ?? null,
                fechaIngreso: ingreso ? ingreso.toISOString().split("T")[0] : null,
                antiguedadAnios,
                antiguedadReconocidaAnios: e.antiguedadReconocidaAnios ?? 0,
                sueldo: e.sueldoBase?.monto ?? null,
                sueldoMoneda: e.sueldoBase?.moneda ?? "ARS",
                areaNombre: e.area?.nombre ?? null,
                sectorNombre: e.sector?.nombre ?? null,
                createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("[analytics/empleados]", err);
        res.status(500).json({ error: "Error al obtener datos de empleados." });
    }
}
