// backend/src/controllers/objetivosISO.controller.js
import ObjetivoISO from "../models/ObjetivoISO.model.js";

// Helper: año de inicio del período fiscal (Sep-Ago)
function fiscalYear(date = new Date()) {
    return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

export async function getAll(req, res) {
    try {
        const { activo, year } = req.query;
        const filter = {};
        if (activo !== undefined) filter.activo = activo === "true";
        if (year !== undefined) filter.year = Number(year);
        const items = await ObjetivoISO.find(filter).sort({ codigo: 1, nombre: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener objetivos ISO", error: err.message });
    }
}

export async function getById(req, res) {
    try {
        const item = await ObjetivoISO.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "No encontrado" });
        res.json(item);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener objetivo ISO", error: err.message });
    }
}

export async function create(req, res) {
    try {
        const { codigo, nombre, descripcion, year, activo } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ message: "El nombre es obligatorio." });
        if (!year) return res.status(400).json({ message: "El año fiscal es obligatorio." });

        const item = await ObjetivoISO.create({
            codigo: codigo?.trim() || "",
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || "",
            year: Number(year),
            activo: activo !== false,
        });
        res.status(201).json(item);
    } catch (err) {
        res.status(500).json({ message: "Error al crear objetivo ISO", error: err.message });
    }
}

export async function update(req, res) {
    try {
        const { codigo, nombre, descripcion, year, activo } = req.body;
        if (nombre !== undefined && !nombre?.trim())
            return res.status(400).json({ message: "El nombre es obligatorio." });

        const updated = await ObjetivoISO.findByIdAndUpdate(
            req.params.id,
            {
                ...(codigo !== undefined && { codigo: codigo.trim() }),
                ...(nombre !== undefined && { nombre: nombre.trim() }),
                ...(descripcion !== undefined && { descripcion: descripcion.trim() }),
                ...(year !== undefined && { year: Number(year) }),
                ...(activo !== undefined && { activo }),
            },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ message: "No encontrado" });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar objetivo ISO", error: err.message });
    }
}

export async function remove(req, res) {
    try {
        const deleted = await ObjetivoISO.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "No encontrado" });
        res.json({ message: "Eliminado correctamente" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar objetivo ISO", error: err.message });
    }
}
