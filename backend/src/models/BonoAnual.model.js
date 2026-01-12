import mongoose from "mongoose";
const { Schema, model } = mongoose;

const objetivoItemSchema = new Schema({
  objetivo: { type: Schema.Types.ObjectId, ref: "Objetivo", required: false },
  nombre: String,                         // snapshot del nombre del objetivo
  tipo: { type: String, enum: ["area", "sector", "individual"] },
  kpi: String,
  target: String,
  peso: Number,                           // %
  cumplimiento: Number,                   // 0..100
}, { _id: false });

const competenciaItemSchema = new Schema({
  nombre: String,
  peso: Number,                           // %
  score: Number,                          // 0..100
}, { _id: false });

const bonoAnualSchema = new Schema({
  empleado: { type: Schema.Types.ObjectId, ref: "Empleado", required: true, index: true },
  anio: { type: Number, required: true },

  estado: { type: String, enum: ["borrador", "en_proceso", "aprobado", "pagado"], default: "borrador" },

  snapshot: {                             // congela el contexto del empleado ese año
    puesto: String,
    areaNombre: String,
    sectorNombre: String,
    cuil: String,
    dni: String,
    fechaIngreso: Date,
  },

  pesos: {
    objetivos: { type: Number, default: 70 },
    competencias: { type: Number, default: 30 },
  },

  objetivos: [objetivoItemSchema],
  competencias: [competenciaItemSchema],

  resultado: {
    objetivos: Number,                    // ponderado final 0..100
    competencias: Number,                 // ponderado final 0..100
    total: Number,                        // 0..100
  },

  condiciones: [{
    tipo: String, // "ANTIGUEDAD", "SANCION", "LICENCIA"
    descripcion: String,
    impacto: String, // "ANULA", "REDUCE", "OK"
  }],

  feedback: {
    comentarioJefe: String,
    comentarioEmpleado: String,
    comentarioRRHH: String,
    fechaCierre: Date,
  },

  bonoBase: Number,                       // sueldo base o referencia
  bonoFinal: Number,                      // monto resultante
  aprobadoPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

bonoAnualSchema.index({ empleado: 1, anio: 1 }, { unique: true });

export default model("BonoAnual", bonoAnualSchema);
