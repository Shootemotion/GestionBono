// backend/src/models/Objetivo.model.js
// backend/src/models/Objetivo.model.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ObjetivoSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  proceso: { type: String, trim: true, default: '' }, // ya no required
  descripcion: { type: String, default: '' },
  kpi: { type: String, default: '' },
  target: { type: String, default: '' },
  peso: { type: Number, min: 0, max: 100, default: 0 },
  fechaLimite: { type: Date, default: null },

  // agregamos 'area' a los posibles scopeType y permitimos 'mensual' en metodo
  metodo: { type: String, enum: ['mensual','trimestral', 'semestral', 'anual'], default: 'trimestral' },
  anio: { type: Number, required: true },

  scopeType: { type: String, enum: ['area', 'sector', 'empleado'], required: true },

  // sector/area/empleado ids
  areaId:   { type: Schema.Types.ObjectId, ref: 'Area' },
  sectorId: { type: Schema.Types.ObjectId, ref: 'Sector' },
  empleadoId: { type: Schema.Types.ObjectId, ref: 'Empleado' },
}, { timestamps: true });

ObjetivoSchema.pre('validate', function(next) {
  const s = this.scopeType;
  if (s === 'sector') {
    this.empleadoId = undefined;
    if (!this.sectorId) return next(new Error('sectorId requerido para scopeType=sector'));
    // areaId puede venir o no
  } else if (s === 'area') {
    this.empleadoId = undefined;
    this.sectorId = undefined;
    if (!this.areaId) return next(new Error('areaId requerido para scopeType=area'));
  } else if (s === 'empleado') {
    this.areaId = undefined;
    this.sectorId = undefined;
    if (!this.empleadoId) return next(new Error('empleadoId requerido para scopeType=empleado'));
  }
  next();
});

export default mongoose.model('Objetivo', ObjetivoSchema);
