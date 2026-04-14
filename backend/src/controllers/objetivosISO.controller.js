// backend/src/controllers/objetivosISO.controller.js
import ObjetivoISO from "../models/ObjetivoISO.model.js";
import ProcesoISO from "../models/ProcesoISO.model.js";

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
        const items = await ObjetivoISO.find(filter)
            .populate("representante", "nombre apellido legajo")
            .sort({ codigo: 1, nombre: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener objetivos ISO", error: err.message });
    }
}

export async function getById(req, res) {
    try {
        const item = await ObjetivoISO.findById(req.params.id)
            .populate("representante", "nombre apellido legajo");
        if (!item) return res.status(404).json({ message: "No encontrado" });
        res.json(item);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener objetivo ISO", error: err.message });
    }
}

export async function create(req, res) {
    try {
        const { codigo, nombre, descripcion, year, activo, representante, procesos, progreso, meta, desarrollo } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ message: "El nombre es obligatorio." });
        if (!year) return res.status(400).json({ message: "El año fiscal es obligatorio." });

        const item = await ObjetivoISO.create({
            codigo: codigo?.trim() || "",
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || "",
            year: Number(year),
            activo: activo !== false,
            representante: representante || null,
            progreso: progreso !== undefined ? Number(progreso) : 0,
            meta: meta !== undefined ? Number(meta) : 80,
            desarrollo: desarrollo?.trim() || "",
            seguimientoMensual: Array.isArray(req.body.seguimientoMensual) ? req.body.seguimientoMensual : []
        });

        if (Array.isArray(procesos) && procesos.length > 0) {
            await ProcesoISO.updateMany({ _id: { $in: procesos } }, { $addToSet: { objetivosISO: item._id } });
        }

        // Hacemos populate antes de enviarlo
        await item.populate("representante", "nombre apellido legajo");

        res.status(201).json(item);
    } catch (err) {
        res.status(500).json({ message: "Error al crear objetivo ISO", error: err.message });
    }
}

export async function update(req, res) {
    try {
        const { codigo, nombre, descripcion, year, activo, representante, procesos, progreso, meta, desarrollo } = req.body;
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
                ...(representante !== undefined && { representante: representante || null }),
                ...(progreso !== undefined && { progreso: Number(progreso) }),
                ...(meta !== undefined && { meta: Number(meta) }),
                ...(desarrollo !== undefined && { desarrollo: desarrollo.trim() }),
                ...(req.body.seguimientoMensual !== undefined && { seguimientoMensual: req.body.seguimientoMensual }),
            },
            { new: true, runValidators: true }
        ).populate("representante", "nombre apellido legajo");

        if (!updated) return res.status(404).json({ message: "No encontrado" });

        // Update processes if an array is passed
        if (Array.isArray(procesos)) {
            // Unlink all processes currently linked to this objective
            await ProcesoISO.updateMany({ objetivosISO: updated._id }, { $pull: { objetivosISO: updated._id } });
            // Link the selected processes
            if (procesos.length > 0) {
                await ProcesoISO.updateMany({ _id: { $in: procesos } }, { $addToSet: { objetivosISO: updated._id } });
            }
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar objetivo ISO", error: err.message });
    }
}

export async function remove(req, res) {
    try {
        const deleted = await ObjetivoISO.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "No encontrado" });

        // Unlink processes when objective is deleted
        await ProcesoISO.updateMany({ objetivosISO: req.params.id }, { $pull: { objetivosISO: req.params.id } });

        res.json({ message: "Eliminado correctamente" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar objetivo ISO", error: err.message });
    }
}

export async function subirAdjuntoMes(req, res) {
    try {
        const { id, mes } = req.params;
        const monthNum = Number(mes);

        if (!req.file) {
            return res.status(400).json({ message: "No se subió ningún archivo." });
        }

        const obj = await ObjetivoISO.findById(id);
        if (!obj) return res.status(404).json({ message: "Objetivo no encontrado." });

        // Buscamos si ya existe el registro de ese mes
        const idx = (obj.seguimientoMensual || []).findIndex(s => s.mes === monthNum);

        if (idx === -1) {
            // Si no existe, lo creamos (aunque usualmente se guarda el comentario primero)
            obj.seguimientoMensual.push({
                mes: monthNum,
                year: monthNum >= 9 ? obj.year : obj.year + 1,
                progreso: 0,
                comentario: "",
                adjunto: req.file.filename
            });
        } else {
            // Actualizamos solo el adjunto
            obj.seguimientoMensual[idx].adjunto = req.file.filename;
        }

        await obj.save();

        res.json({
            message: "Archivo subido correctamente",
            filename: req.file.filename,
            path: `/uploads/iso-evidencias/${req.file.filename}`
        });
    } catch (err) {
        res.status(500).json({ message: "Error al subir adjunto", error: err.message });
    }
}
