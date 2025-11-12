import mongoose from "mongoose";

const empleadoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    dni: { type: String, required: true, unique: true, trim: true },
    cuil: { type: String, required: true, unique: true, trim: true },
    apodo: { type: String },
    domicilio: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    antiguedadReconocidaAnios: { type: Number, default: 0 },
    fechaIngreso: { type: Date, required: true },
    puesto: { type: String, required: true, trim: true },
    celular: { type: String },
    categoria: { type: String },

    // 💰 Sueldo con historial versionado
    sueldoBase: {
      monto: { type: Number, default: 0 },
      moneda: { type: String, default: "ARS" },
      vigenteDesde: { type: Date, default: Date.now },
      historico: [
        {
          monto: { type: Number, required: true },
          moneda: { type: String, default: "ARS" },
          desde: { type: Date, required: true },
          hasta: { type: Date },
        },
      ],
    },

    // Relaciones
    area: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Area",
      required: true,
    },
    sector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sector",
      required: true,
    },

    fotoUrl: { type: String, default: null },
  },
  {
    timestamps: true, // createdAt y updatedAt
  }
);

const Empleado = mongoose.model("Empleado", empleadoSchema);
export default Empleado;
