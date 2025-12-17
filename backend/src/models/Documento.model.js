import mongoose from "mongoose";

const documentoSchema = new mongoose.Schema(
    {
        nombre: { type: String, required: true, trim: true },
        archivoUrl: { type: String, required: true },
        empleado: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Empleado",
            required: true,
        },
        tipo: { type: String, default: "DOCUMENTO" }, // PDF, IMG, etc.
        fechaSubida: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    }
);

const Documento = mongoose.model("Documento", documentoSchema);
export default Documento;
