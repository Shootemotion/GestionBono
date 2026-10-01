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
        progreso: { type: Number, default: 0, min: 0, max: 100 },
        meta: { type: Number, default: 80, min: 0 },
        unidadMeta: { type: String, default: "" }, // unidad de la meta (%, unidades, horas, etc.)
        comentarioMeta: { type: String, default: "" },
        operador: { type: String, enum: ["=", ">", "<"], default: ">" }, // operador para comparar resultado vs meta
        desarrollo: { type: String, default: "" },
        seguimientoMensual: [
            {
                mes: { type: Number, required: true }, // 1-12
                year: { type: Number, required: true },
                progreso: { type: Number, default: 0, min: 0, max: 100 },
                resultadoMes: { type: Number, default: 0 }, // resultado/valor alcanzado del mes
                comentario: { type: String, default: "" },
                adjunto: { type: String, default: null } // nombre del archivo evidencia
            }
        ],
    },
    { timestamps: true }
);

objetivoISOSchema.index({ year: 1, nombre: 1 });

const ObjetivoISO = mongoose.model("ObjetivoISO", objetivoISOSchema);
export default ObjetivoISO;

