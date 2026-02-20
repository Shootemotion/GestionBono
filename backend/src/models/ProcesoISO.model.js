// backend/src/models/ProcesoISO.model.js
import mongoose from "mongoose";

const procesoISOSchema = new mongoose.Schema(
    {
        codigo: { type: String, required: true, trim: true },  // ej: "P01"
        nombre: { type: String, required: true, trim: true },  // ej: "Proceso Preanalitico"
        descripcion: { type: String, trim: true },

        // Año fiscal de inicio: 2025 → período 2025-2026  (Sep/2025 → Ago/2026)
        year: { type: Number, required: true },

        // Referencia al objetivo ISO padre (opcional)
        objetivoISOId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ObjetivoISO",
            default: null,
        },

        activo: { type: Boolean, default: true },
    },
    { timestamps: true }
);

procesoISOSchema.virtual("fullName").get(function () {
    return `${this.codigo} - ${this.nombre}`;
});

// Índice compuesto para ordenar por código
procesoISOSchema.index({ codigo: 1 });

const ProcesoISO = mongoose.model("ProcesoISO", procesoISOSchema);
export default ProcesoISO;
