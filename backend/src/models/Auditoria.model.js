// backend/src/models/Auditoria.model.js
//
// Registro de escrituras sobre entidades sensibles.
//
// Guarda el documento COMPLETO previo al cambio (`antes`). Eso es lo que
// convierte la auditoría en algo accionable: no solo dice quién tocó qué, sino
// que permite deshacerlo. Es el dato que nos faltó cuando desaparecieron las
// competencias del área Atención al cliente en septiembre de 2026.

import mongoose from "mongoose";

const auditoriaSchema = new mongoose.Schema(
  {
    // Quién
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", index: true },
    email: { type: String, index: true },
    rol: { type: String },
    empleadoNombre: { type: String },

    // Qué
    accion: {
      type: String,
      enum: ["CREAR", "EDITAR", "ELIMINAR", "VERSIONAR", "APROBAR", "RESTAURAR"],
      required: true,
      index: true,
    },
    entidad: { type: String, required: true, index: true }, // "plantilla", ...
    documentoId: { type: mongoose.Schema.Types.ObjectId, index: true },
    // Texto legible para poder leer el log sin resolver ids a mano
    resumen: { type: String },

    // Estado previo completo. Sin esto la auditoría solo sirve para señalar culpables.
    antes: { type: mongoose.Schema.Types.Mixed, default: null },
    // Lo que mandó el cliente (no el documento final, que puede diferir por hooks)
    cambios: { type: mongoose.Schema.Types.Mixed, default: null },

    // Contexto
    metodo: { type: String },
    ruta: { type: String },
    statusCode: { type: Number },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// Consulta típica: "qué pasó con este documento" y "qué hizo esta persona".
auditoriaSchema.index({ entidad: 1, documentoId: 1, createdAt: -1 });
auditoriaSchema.index({ createdAt: -1 });

export default mongoose.model("Auditoria", auditoriaSchema);
