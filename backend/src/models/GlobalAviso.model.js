import mongoose from "mongoose";

const GlobalAvisoSchema = new mongoose.Schema(
    {
        titulo: {
            type: String,
            required: true,
            trim: true
        },
        mensaje: {
            type: String,
            required: true
        },
        alcance: {
            type: String,
            enum: ["GLOBAL", "AREA", "SECTOR"], // GLOBAL = toda la nómina
            default: "GLOBAL"
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "targetModel", // Dinámico según el alcance
            default: null
        },
        targetModel: {
            type: String,
            enum: ["Area", "Sector"],
            default: undefined
        },
        targetName: {
            type: String // Helper visual para no populación constante
        },
        fechaInicio: {
            type: Date,
            required: true
        },
        fechaFin: {
            type: Date,
            required: true
        },
        creadoPor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Usuario"
        },
        tipo: {
            type: String,
            enum: ["RRHH", "SISTEMAS"],
            default: "RRHH"
        },
        activo: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

// Indice para búsqueda rápida de activos
GlobalAvisoSchema.index({ activo: 1, fechaInicio: 1, fechaFin: 1 });

export default mongoose.model("GlobalAviso", GlobalAvisoSchema);
