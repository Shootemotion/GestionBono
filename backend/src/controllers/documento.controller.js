import Documento from "../models/Documento.model.js";
import fs from "fs";
import path from "path";

// GET /:id/documentos
export const listDocumentos = async (req, res, next) => {
    try {
        const { id } = req.params;
        const docs = await Documento.find({ empleado: id }).sort({ fechaSubida: -1 });
        res.json(docs);
    } catch (e) {
        next(e);
    }
};

// POST /:id/documentos (multipart/form-data)
export const createDocumento = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nombre, tipo } = req.body;

        if (!req.file) return res.status(400).json({ message: "No se subió archivo." });
        if (!nombre) return res.status(400).json({ message: "Nombre requerido." });

        // Path relativo para guardar en DB
        // Asumimos que multer guarda en 'uploads/documentos' por ejemplo
        const archivoUrl = req.file.path.replace(/\\/g, "/");

        const doc = await Documento.create({
            nombre,
            tipo: tipo || "DOCUMENTO",
            archivoUrl, // ej: "uploads/docs/archivo.pdf"
            empleado: id,
            fechaSubida: new Date(),
        });

        res.status(201).json(doc);
    } catch (e) {
        next(e);
    }
};

// DELETE /:id/documentos/:docId
export const deleteDocumento = async (req, res, next) => {
    try {
        const { docId } = req.params;
        const doc = await Documento.findById(docId);
        if (!doc) return res.status(404).json({ message: "No encontrado" });

        // Eliminar archivo físico
        if (doc.archivoUrl) {
            // Ajustar path base si es necesario. Asumimos que archivoUrl es relativo a root o backend.
            // Si archivoUrl es "uploads/...", y estamos en backend/, resolvemos.
            const p = path.resolve(doc.archivoUrl);
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
            }
        }

        await Documento.findByIdAndDelete(docId);
        res.sendStatus(204);
    } catch (e) {
        next(e);
    }
};
