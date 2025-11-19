// src/models/Plantilla.model.js
import mongoose from "mongoose";

/* ---------------------------------------------------------
   AÑO FISCAL (01/09 → 31/08)
--------------------------------------------------------- */
function getFiscalStart(year) {
  return new Date(year, 8, 1); // 1 septiembre
}

function getFiscalEnd(year) {
  return new Date(year + 1, 7, 31, 23, 59, 59, 999); // 31 agosto
}

/* ---------------------------------------------------------
   GENERADOR DE PERÍODOS SEGÚN FRECUENCIA
--------------------------------------------------------- */
function generarPeriodos(year, frecuencia) {
  const start = getFiscalStart(year);
  const end = getFiscalEnd(year);

  const list = [];
  let d = new Date(start);

  if (frecuencia === "mensual") {
    while (d <= end) {
      list.push(`${d.getFullYear()}M${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() + 1);
    }
  }

  if (frecuencia === "trimestral") {
    let q = 1;
    while (d <= end) {
      list.push(`${year}Q${q++}`);
      d.setMonth(d.getMonth() + 3);
    }
  }

  if (frecuencia === "semestral") {
    list.push(`${year}S1`);
    list.push(`${year}S2`);
  }

  if (frecuencia === "anual") {
    list.push(`${year}A1`);
  }

  return list;
}

/* ---------------------------------------------------------
   SCHEMA
--------------------------------------------------------- */
const plantillaSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["objetivo", "aptitud"], required: true },
    year: { type: Number, required: true },

    scopeType: {
      type: String,
      enum: ["area", "sector", "empleado", "employee"],
      required: true,
    },

    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "scopeRef",
    },

    scopeRef: { type: String, enum: ["Area", "Sector", "Empleado"] },

    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String },
    proceso: { type: String, trim: true },

    /* --- Aptitudes (opcionales) --- */
    metodo: { type: String, enum: ["cuantitativo", "cualitativo"] },
    target: { type: Number },
    unidad: { type: String },

    escalas: [
      {
        label: String,
        valor: Number,
      },
    ],

    /* --- Metas (solo objetivos) --- */
    metas: [
      {
        nombre: { type: String, required: true },
        target: { type: String },
        unidad: {
          type: String,
          enum: ["Cumple/No Cumple", "Porcentual", "Numerico"],
          default: "Porcentual",
        },
        operador: {
          type: String,
          enum: [">=", ">", "<=", "<", "==", "!="],
          default: ">=",
        },
      },
    ],

    /* --- SISTEMA DE FECHAS AUTOMÁTICAS --- */
    fechaInicioFiscal: { type: Date }, // se completa solo
    fechaCierre: { type: Date }, // se completa solo salvo override
    fechaCierreCustom: { type: Boolean, default: false },

    /* --- Frecuencia y peso --- */
    frecuencia: {
      type: String,
      enum: ["mensual", "trimestral", "semestral", "anual"],
      required: true,
    },

    pesoBase: { type: Number, min: 0, max: 100, required: true },

    activo: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------
   MÉTODO DE INSTANCIA
--------------------------------------------------------- */
plantillaSchema.methods.getPeriodos = function () {
  return generarPeriodos(this.year, this.frecuencia);
};

/* ---------------------------------------------------------
   PRE-VALIDATE (AUTO COMPLETAR CAMPOS)
--------------------------------------------------------- */
plantillaSchema.pre("validate", function (next) {
  const map = {
    area: "Area",
    sector: "Sector",
    empleado: "Empleado",
    employee: "Empleado",
  };

  if (!this.scopeRef) this.scopeRef = map[this.scopeType];

  if (!this.fechaInicioFiscal) this.fechaInicioFiscal = getFiscalStart(this.year);

  if (!this.fechaCierre && !this.fechaCierreCustom) {
    this.fechaCierre = getFiscalEnd(this.year);
  }

  next();
});

/* ---------------------------------------------------------
   MODELO
--------------------------------------------------------- */
const Plantilla = mongoose.model("Plantilla", plantillaSchema);
export default Plantilla;
