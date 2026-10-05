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
            index: true,
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
            estado: { type: String, enum: ["ACK", "CONTEST", "SYSTEM_CLOSED", null], default: null },
            fecha: { type: Date },
        },
        // Motivo de desacuerdo (si aplica)
        motivoDesacuerdo: {
            type: String,
            enum: [
                "La nota no refleja el feedback recibido.",
                "Los objetivos asignados fueron inalcanzables.",
                "El objetivo no fue comprendido claramente.",
                "Falta de escucha o comprensión durante la reunión de feedback.",
                "Incomodidad con el evaluador.",
                "Ejemplos proporcionados poco pertinentes o poco claros.",
                null
            ],
            default: null
        },

        // Fechas de transición
        submittedToEmployeeAt: Date,
        closedAt: Date,

        // Para auditoría
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },

        // Snapshot de scores al momento del feedback.
        // OJO: hoy lo manda el navegador y se guarda tal cual. Es el número
        // que se le comunica a la persona y el que le gana al cálculo en vivo.
        scores: {
            obj: Number,
            comp: Number,
            global: Number
        },

        // LA NOTA OFICIAL DEL AÑO.
        //
        // Acordado con RRHH: la nota que vale es la que el jefe evaluó, vio en
        // su pantalla y le comunicó a la persona, y que la persona vio en la
        // suya. Esta marca la fija como tal.
        //
        // Por qué un campo y no seguir deduciéndola: hasta ahora cada pantalla
        // resolvía por su cuenta cuál era "la nota" —el backend tomaba el
        // último feedback cerrado, Mi Desempeño recalculaba en vivo para el
        // AF2025 y RRHH veía otro recálculo al cerrar—, y las tres daban
        // números distintos para la misma persona. Una regla que se deduce en
        // cuatro lugares se deduce distinto en cuatro lugares.
        //
        // `nota` guarda el valor al momento de confirmar. Si alguien tocara
        // `scores` después, la oficial no se mueve: es el número que se pagó.
        oficial: {
            confirmada: { type: Boolean, default: false, index: true },
            confirmadaPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
            confirmadaEl: { type: Date },
            // Cuál de los tres números se eligió: la foto guardada, lo que el
            // jefe tenía en pantalla al enviar, o el recálculo de hoy. Casi
            // siempre "comunicada"; los otros dos quedan registrados aparte
            // porque son apartarse del acuerdo con RRHH para un caso puntual.
            origen: { type: String, enum: ["comunicada", "vista_jefe", "recalculo"], default: "comunicada" },
            nota: {
                obj: Number,
                comp: Number,
                global: Number,
            },
        },

        // Lo que calculó el BACKEND para ese mismo feedback.
        //
        // Va al lado y no encima, a propósito: mientras se entregan los
        // resultados del AF2025 nadie puede cambiarle el número por debajo a
        // quien está comunicando una nota. Sirve para medir cuánto divergen
        // los dos caminos antes de darle el volante al backend.
        scoresBackend: {
            obj: Number,
            comp: Number,
            global: Number,
            calculadoEl: Date,
            // Diferencia contra `scores.global`, en puntos de nota final.
            divergencia: Number
        }
    },
    {
        timestamps: true,
    }
);

// Índice compuesto para asegurar unicidad por empleado-año-periodo
FeedbackSchema.index({ empleado: 1, year: 1, periodo: 1 }, { unique: true });

export default mongoose.model("Feedback", FeedbackSchema);
