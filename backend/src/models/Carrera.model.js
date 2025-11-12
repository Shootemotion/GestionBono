import mongoose from "mongoose";

const carreraSchema = new mongoose.Schema({
  empleado: { type: mongoose.Schema.Types.ObjectId, ref: "Empleado", required: true, index: true },
  puesto:   { type: String, required: true },
  area:     { type: mongoose.Schema.Types.ObjectId, ref: "Area" },
  sector:   { type: mongoose.Schema.Types.ObjectId, ref: "Sector" },
  desde:    { type: Date, required: true },
  hasta:    { type: Date, default: null }, // null = vigente
  motivo:   { type: String, trim: true },  // opcional: ascenso, rotación, etc.
}, { timestamps: true });

carreraSchema.index({ empleado: 1, desde: -1 });

export default mongoose.model("Carrera", carreraSchema);
