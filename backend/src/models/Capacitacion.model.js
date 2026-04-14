import mongoose from "mongoose";

const capacitacionSchema = new mongoose.Schema({
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: "Empleado", required: true, index: true },
  nombre: { type: String, required: true },
  proveedor: { type: String, default: "" },
  horas: { type: Number, default: 0 },
  fecha: { type: Date, required: true },
  vence: { type: Boolean, default: false },
  fechaVto: { type: Date, default: null },
  lugar: { type: String, default: "" },
  estado: { type: String, enum: ["COMPLETO", "EN_PROGRESO", "PENDIENTE", "VERIFICADO", "RECHAZADO", "POR_REALIZAR"], default: "PENDIENTE" },
  certificadoUrl: { type: String, default: null }, // archivo subido
}, { timestamps: true });

capacitacionSchema.index({ empleado: 1, fecha: -1 });

export default mongoose.model("Capacitacion", capacitacionSchema);
