import mongoose from "mongoose";

const incidenciaSchema = new mongoose.Schema(
    {
        empleado: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Empleado",
            required: true,
            index: true,
        },
        tipo: {
            type: String,
            enum: ["INASISTENCIA", "APERCIBIMIENTO", "SANCION", "COMENTARIO", "LICENCIA"],
            required: true,
        },
        fecha: {
            type: Date,
            required: true,
        },
        fechaHasta: {
            type: Date, // Para Rangos (ej: Licencias)
        },
        descripcion: {
            type: String, // Comentario / Motivo
            required: true,
            trim: true,
        },
        archivoUrl: {
            type: String, // Opcional, evidencia
            default: null,
        },
        justificada: {
            type: Boolean,
            default: false,
        },
        usuarioCreador: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Usuario",
        },
    },
    {
        timestamps: true,
    }
);

const Incidencia = mongoose.model("Incidencia", incidenciaSchema);
export default Incidencia;
