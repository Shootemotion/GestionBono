// backend/src/controllers/procesosISO.controller.js
import ProcesoISO from "../models/ProcesoISO.model.js";

/** Devuelve todos los procesos, ordenados por código */
export async function getAll(req, res) {
    try {
        const { activo, objetivoISOId, year } = req.query;
        const filter = {};
        if (activo !== undefined) filter.activo = activo === "true";
        if (objetivoISOId) filter.objetivoISOId = objetivoISOId;
        if (year !== undefined) filter.year = Number(year);

        const items = await ProcesoISO.find(filter)
            .populate("objetivoISOId", "codigo nombre year")
            .sort({ codigo: 1 });

        const result = items.map((p) => ({
            ...p.toObject({ virtuals: true }),
            fullName: p.fullName,
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener procesos ISO", error: err.message });
    }
}

export async function getById(req, res) {
    try {
        const item = await ProcesoISO.findById(req.params.id).populate("objetivoISOId", "codigo nombre");
        if (!item) return res.status(404).json({ message: "No encontrado" });
        res.json({ ...item.toObject({ virtuals: true }), fullName: item.fullName });
    } catch (err) {
        res.status(500).json({ message: "Error", error: err.message });
    }
}

export async function create(req, res) {
    try {
        const { codigo, nombre, descripcion, year, objetivoISOId, activo } = req.body;
        if (!codigo?.trim()) return res.status(400).json({ message: "El código es obligatorio." });
        if (!nombre?.trim()) return res.status(400).json({ message: "El nombre es obligatorio." });
        if (!year) return res.status(400).json({ message: "El año fiscal es obligatorio." });

        const item = await ProcesoISO.create({
            codigo: codigo.trim().toUpperCase(),
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || "",
            year: Number(year),
            objetivoISOId: objetivoISOId || null,
            activo: activo !== false,
        });

        await item.populate("objetivoISOId", "codigo nombre year");
        res.status(201).json({ ...item.toObject({ virtuals: true }), fullName: item.fullName });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ message: "El código ya existe para este año." });
        res.status(500).json({ message: "Error al crear proceso ISO", error: err.message });
    }
}

export async function update(req, res) {
    try {
        const { codigo, nombre, descripcion, year, objetivoISOId, activo } = req.body;

        const updated = await ProcesoISO.findByIdAndUpdate(
            req.params.id,
            {
                ...(codigo !== undefined && { codigo: codigo.trim().toUpperCase() }),
                ...(nombre !== undefined && { nombre: nombre.trim() }),
                ...(descripcion !== undefined && { descripcion: descripcion.trim() }),
                ...(year !== undefined && { year: Number(year) }),
                ...(objetivoISOId !== undefined && { objetivoISOId: objetivoISOId || null }),
                ...(activo !== undefined && { activo }),
            },
            { new: true, runValidators: true }
        ).populate("objetivoISOId", "codigo nombre year");

        if (!updated) return res.status(404).json({ message: "No encontrado" });
        res.json({ ...updated.toObject({ virtuals: true }), fullName: updated.fullName });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar proceso ISO", error: err.message });
    }
}

export async function remove(req, res) {
    try {
        const deleted = await ProcesoISO.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "No encontrado" });
        res.json({ message: "Eliminado correctamente" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar proceso ISO", error: err.message });
    }
}

/** Seed inicial: crea los P01-P15 para un año dado si no existen */
export async function seed(req, res) {
    const BASE_PROCESOS = [
        { codigo: "P01", nombre: "Proceso Preanalitico" },
        { codigo: "P02", nombre: "Proceso Analitico" },
        { codigo: "P03", nombre: "Proceso Postanalitico" },
        { codigo: "P04", nombre: "Revisión por la dirección" },
        { codigo: "P05", nombre: "Auditorías" },
        { codigo: "P06", nombre: "Seguimiento de satisfacción del cliente" },
        { codigo: "P07", nombre: "Docencia e investigación" },
        { codigo: "P08", nombre: "Tesorería" },
        { codigo: "P09", nombre: "Compras" },
        { codigo: "P10", nombre: "Facturación" },
        { codigo: "P11", nombre: "Informática y sistemas" },
        { codigo: "P12", nombre: "Mantenimiento y seguridad edilicia" },
        { codigo: "P13", nombre: "Gestión de recursos humanos" },
        { codigo: "P14", nombre: "Gestión de bioseguridad" },
        { codigo: "P15", nombre: "Contabilidad y control de gestión" },
    ];

    // El año puede venir en el body o se usa el año fiscal actual
    const now = new Date();
    const defaultYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const year = Number(req.body?.year || defaultYear);

    try {
        // Buscar existentes SOLO para ese año
        const existentes = await ProcesoISO.find({ year }, "codigo");
        const codigosExistentes = new Set(existentes.map((p) => p.codigo));
        const toInsert = BASE_PROCESOS
            .filter((p) => !codigosExistentes.has(p.codigo))
            .map((p) => ({ ...p, year }));

        if (toInsert.length > 0) {
            await ProcesoISO.insertMany(toInsert);
        }
        res.json({ insertados: toInsert.length, year, message: `Seed completado. ${toInsert.length} proceso(s) creados para ${year}.` });
    } catch (err) {
        res.status(500).json({ message: "Error en seed", error: err.message });
    }
}
