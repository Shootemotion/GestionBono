// backend/src/models/ObjetivoISO.model.js
import mongoose from "mongoose";

const objetivoISOSchema = new mongoose.Schema(
    {
        codigo: { type: String, trim: true },                   // ej: "OBJ-01"
        nombre: { type: String, required: true, trim: true },   // ej: "Gestión Preanalítica"
        descripcion: { type: String, trim: true },
        // Año fiscal de inicio: 2025 → período 2025-2026  (Sep/2025 → Ago/2026)
        year: { type: Number, required: true },
        activo: { type: Boolean, default: true },
        representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Empleado', default: null },
    },
    { timestamps: true }
);

objetivoISOSchema.index({ year: 1, nombre: 1 });

const ObjetivoISO = mongoose.model("ObjetivoISO", objetivoISOSchema);
export default ObjetivoISO;

