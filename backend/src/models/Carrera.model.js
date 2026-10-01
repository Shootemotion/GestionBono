import mongoose from "mongoose";

const carreraSchema = new mongoose.Schema({
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: "Empleado", required: true, index: true },
  puesto:   { type: String, required: true },
  area:     { type: mongoose.Schema.Types.ObjectId, ref: "Area" },
  sector:   { type: mongoose.Schema.Types.ObjectId, ref: "Sector" },
  desde:    { type: Date, required: true },
  hasta:    { type: Date, default: null }, // null = vigente
  motivo:   { type: String, trim: true },  // opcional: ascenso, rotación, etc.

  // Puesto principal: el que define area/sector/puesto del Empleado.
  // Puede haber varios puestos vigentes (simultáneos), pero solo uno principal.
  principal: { type: Boolean, default: false },

  // Perfil de puesto firmado por el empleado (adjunto por puesto)
  perfilPuestoUrl:      { type: String, default: null }, // ej: "uploads/empleados/slug/perfiles/perfil-123.pdf"
  perfilPuestoNombre:   { type: String, default: null }, // nombre original del archivo
  perfilPuestoSubidoEl: { type: Date, default: null },
}, { timestamps: true });

carreraSchema.index({ empleado: 1, desde: -1 });

export default mongoose.model("Carrera", carreraSchema);