import mongoose from "mongoose";

const objectiveTemplateSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  scopeType: { type: String, enum: ["area", "sector"], required: true },
  scopeId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Area._id o Sector._id
  tipo: { type: String, enum: ["objetivo", "aptitud"], required: true },
 proceso: { type: String, required: false, trim: true, default: '' }, // 

  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String },
  kpi: { type: String },
  target: { type: String },

  metodo: { type: String, enum: ["trimestral", "semestral", "anual"], default: "trimestral" },
  pesoBase: { type: Number, required: true, min: 0 }, // peso definido en el scope
  activo: { type: Boolean, default: true }
}, { timestamps: true });

objectiveTemplateSchema.index({ year: 1, scopeType: 1, scopeId: 1 });
export default mongoose.model("ObjectiveTemplate", objectiveTemplateSchema);