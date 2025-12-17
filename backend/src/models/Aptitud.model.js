import mongoose from 'mongoose';

const aptitudSchema = new mongoose.Schema({
  anio: { type: Number, required: true, index: true },

  // Alcance
  scopeType: { 
    type: String, 
    enum: ['area', 'sector', 'empleado'], 
    required: true, 
    index: true 
  },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
  sectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sector' },
  empleadoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empleado' },

  // Datos de la aptitud
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },

  // Tipo: corporativa o especial (cada grupo representa 50% del total)
  tipo: { 
    type: String, 
    enum: ['corporativa', 'especial'], 
    required: true 
  },

  // Peso relativo dentro de su grupo (se normaliza a 100% dentro del grupo)
  peso: { type: Number, min: 0, max: 100, default: 10 },

  // Estado semáforo
  estado: { 
    type: String, 
    enum: ['pendiente', 'adquirida', 'noAdquirida'], 
    default: 'pendiente' 
  },

  // Calificación de 0 a 10
  puntuacion: { type: Number, min: 0, max: 10, default: 0 },

}, { timestamps: true });

// índice compuesto para consultas rápidas
aptitudSchema.index({ anio: 1, scopeType: 1, areaId: 1, sectorId: 1, empleadoId: 1 });

const Aptitud = mongoose.model('Aptitud', aptitudSchema);
export default Aptitud;
