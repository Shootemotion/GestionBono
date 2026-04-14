import mongoose from "mongoose";

const appFeedbackSchema = new mongoose.Schema(
    {
        empleado: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Empleado",
            required: true,
            index: true,
        },
        tipo: {
            type: String,
            enum: ["Sugerencia", "Error", "Otro"],
            required: true,
        },
        mensaje: {
            type: String,
            required: true,
            trim: true,
        },
        estado: {
            type: String,
            enum: ["Pendiente", "Leído", "Contestado", "Resuelto", "Desestimado"],
            default: "Pendiente",
            index: true,
        },
        respuesta: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const AppFeedback = mongoose.model("AppFeedback", appFeedbackSchema);
export default AppFeedback;
