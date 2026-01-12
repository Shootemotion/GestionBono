import Incidencia from "../models/Incidencia.model.js";

// GET /api/empleados/:id/incidencias
export const listIncidencias = async (req, res, next) => {
    try {
        const { id } = req.params;
        const items = await Incidencia.find({ empleado: id })
            .sort({ fecha: -1 }) // Las más recientes primero
            .lean();
        res.json(items);
    } catch (err) {
        next(err);
    }
};

// POST /api/empleados/:id/incidencias
export const createIncidencia = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { tipo, fecha, fechaHasta, descripcion } = req.body;
        const usuarioCreador = req.user?._id;

        if (!tipo || !fecha || !descripcion) {
            return res.status(400).json({ message: "Tipo, fecha y descripción son obligatorios." });
        }

        let archivoUrl = null;
        if (req.file) {
            const abs = String(req.file.path).replaceAll('\\', '/');
            const i = abs.lastIndexOf('/uploads/');
            const relative = i >= 0 ? abs.substring(i) : `uploads/${req.file.filename}`;
            archivoUrl = relative.startsWith('/') ? relative.slice(1) : relative;
        }

        const item = await Incidencia.create({
            empleado: id,
            tipo,
            fecha,
            fechaHasta, // Solo relevante si es LICENCIA u otro rango
            descripcion,
            archivoUrl,
            justificada: req.body.justificada === 'true' || req.body.justificada === true,
            usuarioCreador
        });

        res.status(201).json(item);
    } catch (err) {
        next(err);
    }
};

// DELETE /api/empleados/:id/incidencias/:itemId
export const deleteIncidencia = async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const del = await Incidencia.findByIdAndDelete(itemId);
        if (!del) return res.status(404).json({ message: "No encontrado" });
        res.sendStatus(204);
    } catch (err) {
        next(err);
    }
};
