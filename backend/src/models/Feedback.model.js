import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema(
    {
        empleado: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Empleado",
            required: true,
        },
        year: {
            type: Number,
            required: true,
        },
        periodo: {
            type: String,
            enum: ["Q1", "Q2", "Q3", "FINAL"], // FINAL = Cierre anual
            required: true,
        },
        comentario: {
            type: String,
            default: "",
        },
        estado: {
            type: String,
            enum: ["DRAFT", "SENT", "PENDING_HR", "CLOSED"],
            default: "DRAFT",
        },
        correctionCount: { type: Number, default: 0 },
        fechaRealizacion: {
            type: Date,
        },
        // Comentarios del empleado
        comentarioEmpleado: { type: String, default: "" },

        // Comentario de RRHH (al cerrar)
        comentarioRRHH: { type: String, default: "" },

        // Aprobación del empleado
        empleadoAck: {
            estado: { type: String, enum: ["ACK", "CONTEST", null], default: null },
            fecha: { type: Date },
        },

        // Fechas de transición
        submittedToEmployeeAt: Date,
        closedAt: Date,

        // Para auditoría
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },

        // Snapshot de scores al momento del feedback
        scores: {
            obj: Number,
            comp: Number,
            global: Number
        }
    },
    {
        timestamps: true,
    }
);

// Índice compuesto para asegurar unicidad por empleado-año-periodo
FeedbackSchema.index({ empleado: 1, year: 1, periodo: 1 }, { unique: true });

export default mongoose.model("Feedback", FeedbackSchema);
