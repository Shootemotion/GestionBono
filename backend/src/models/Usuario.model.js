// backend/src/models/Usuario.model.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;
import crypto from 'crypto';
import bcrypt from 'bcryptjs'; // opcional si querés métodos que puedan usar bcrypt

const MIN_PASSWORD_LEN = 8;

const usuarioSchema = new Schema({
  nombre: { type: String, trim: true },

  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },

  // Control
  activo: { type: Boolean, default: true },

  // Rol principal (alineado con tu frontend: incluye 'directivo')
  rol: {
    type: String,
    enum: ['superadmin', 'rrhh', 'jefe_area', 'jefe_sector', 'directivo', 'visor'],
    default: 'visor',
    index: true,
  },

  // Estado de la cuenta
  status: { type: String, enum: ['invited','active','disabled'], default: 'invited' },
  lastLoginAt: Date,

  // Permisos granulares extra (opcional)
  permisos: { type: [String], default: [] },

  // 🔗 vínculo con empleado (1:1)
  empleado: { type: Schema.Types.ObjectId, ref: 'Empleado', unique: true, sparse: true },

  // --- campos para manejo de recuperación/invitación ---
  resetPasswordTokenHash: { type: String, index: true, sparse: true },
  resetPasswordExpiresAt: { type: Date, sparse: true },
  invitedAt: { type: Date }, // opcional
}, { timestamps: true });

// --- métodos de instancia útiles ---

/**
 * Genera un token seguro (hex), guarda el hash en DB y devuelve el token en claro.
 * ttlMs por defecto 1 hora.
 */
usuarioSchema.methods.createResetToken = async function (ttlMs = 60 * 60 * 1000) {
  const token = crypto.randomBytes(32).toString('hex'); // 64 chars hex
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  this.resetPasswordTokenHash = tokenHash;
  this.resetPasswordExpiresAt = new Date(Date.now() + ttlMs);
  await this.save();

  return token; // este token lo envías por email / dev
};

/**
 * Limpia token de recuperación (llamar después de usar)
 */
usuarioSchema.methods.clearResetToken = async function () {
  this.resetPasswordTokenHash = undefined;
  this.resetPasswordExpiresAt = undefined;
  await this.save();
};

/**
 * Verifica si el token dado (en texto) coincide y no expiró.
 * Retorna true/false.
 */
usuarioSchema.methods.verifyResetToken = function (token) {
  if (!this.resetPasswordTokenHash || !this.resetPasswordExpiresAt) return false;
  if (this.resetPasswordExpiresAt < new Date()) return false;

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  return tokenHash === this.resetPasswordTokenHash;
};

// ocultar el hash y campos sensibles en respuestas JSON
usuarioSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpiresAt;
  return obj;
};

/* ================== REGISTRO DE MODELOS ================== */

// Modelo principal
const Usuario = mongoose.models.Usuario || model('Usuario', usuarioSchema);

// Alias "User" para que los ref: "User" (Evaluacion, timeline, etc.) no rompan
if (!mongoose.models.User) {
  mongoose.model('User', usuarioSchema);
}

export default model('Usuario', usuarioSchema);
