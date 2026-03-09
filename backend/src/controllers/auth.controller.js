// backend/src/controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Usuario from '../models/Usuario.model.js';
import crypto from 'crypto';
import { sendCredentialsEmail } from '../utils/mailer.js';

// helper: devuelve usuario sin passwordHash ni campos sensibles
const safeUser = (u) => {
  const o = u && typeof u.toObject === 'function' ? u.toObject() : (u || {});
  delete o.passwordHash;
  return o;
};

const signJwt = (user) => {
  const payload = { sub: user._id.toString(), rol: user.rol };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
};

const MIN_PASSWORD_LEN = 8;

/**
 * POST /api/auth/bootstrap-superadmin
 * body: { email, password }
 */
export const bootstrapSuperadmin = async (req, res, next) => {
  try {
    let { email, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ message: 'email y password son requeridos' });
    }
    if (password.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `Password mínimo ${MIN_PASSWORD_LEN} caracteres` });
    }

    let user = await Usuario.findOne({ email });
    const passwordHash = await bcrypt.hash(password, 10);

    if (!user) {
      user = await Usuario.create({
        email,
        passwordHash,
        rol: 'superadmin',
        permisos: ['*'],
        activo: true,
        status: 'active'
      });
      // audit log: crear superadmin
      console.info('bootstrapSuperadmin: created superadmin', email);
    } else {
      user.rol = 'superadmin';
      user.permisos = ['*'];
      user.activo = true;
      user.passwordHash = passwordHash;
      user.status = 'active';
      await user.save();
      console.info('bootstrapSuperadmin: updated existing user to superadmin', email);
    }

    const token = signJwt(user);
    res.json({
      _id: user._id,
      email: user.email,
      rol: user.rol,
      permisos: user.permisos,
      accessToken: token,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/usuarios/:id/reset-password
 * (admin action) Devuelve { user, tempPassword }
 */
export const resetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await Usuario.findById(id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!user.activo) return res.status(400).json({ message: 'Usuario inactivo' });

    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 chars
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.status = 'invited'; // fuerza cambio al ingresar
    await user.save();

    // audit log
    console.info(`resetUserPassword: admin ${req.user?._id} reset password for ${user._id}`);

    // TODO: disparar email al usuario con la contraseña temporal o preferible: link de invitación
    // ejemplo: sendInviteEmail(user.email, tempPassword);

    return res.json({ user: safeUser(user), tempPassword }); // ⚠️ mostrar solo una vez
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/forgot-password
 * body: { email }
 * (public)
 */
export const forgotPassword = async (req, res, next) => {
  try {
    let { email } = req.body || {};
    email = String(email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'El email es requerido' });
    }

    const user = await Usuario.findOne({ email });
    // Por seguridad, retornamos éxito incluso si no existe,
    // para no revelar qué correos están registrados.
    if (!user || !user.activo) {
      return res.json({ ok: true, message: 'Si el correo existe, se enviaron las instrucciones.' });
    }

    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 chars
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.status = 'invited'; // fuerza cambio al ingresar
    await user.save();

    await sendCredentialsEmail(user.email, tempPassword, true);

    console.info(`forgotPassword: reset password requested via login for ${user.email}`);

    res.json({ ok: true, message: 'Si el correo existe, se enviaron las instrucciones.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/complete-invite
 * body: { email, tempPassword, newPassword }
 */
export const completeInvite = async (req, res, next) => {
  try {
    let { email, tempPassword, newPassword } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    tempPassword = String(tempPassword || '');
    newPassword = String(newPassword || '');

    if (!email || !tempPassword || !newPassword) {
      return res.status(400).json({ message: 'email, tempPassword y newPassword son requeridos' });
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres` });
    }

    const user = await Usuario.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.status !== 'invited') {
      return res.status(400).json({ message: 'La invitación no está activa' });
    }

    const ok = await bcrypt.compare(tempPassword, user.passwordHash || '');
    if (!ok) return res.status(400).json({ message: 'Clave temporal inválida' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.status = 'active';
    await user.save();

    // audit
    console.info(`completeInvite: user ${user._id} completed invite`);

    res.json({ ok: true });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/auth/change-password
 * body: { oldPassword, newPassword }
 * (authed user)
 */
export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'oldPassword y newPassword son requeridos' });
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres` });
    }

    const user = await Usuario.findById(req.user._id);
    if (!user) return res.status(401).json({ message: 'No autenticado' });

    const ok = await bcrypt.compare(oldPassword, user.passwordHash || '');
    if (!ok) return res.status(400).json({ message: 'Clave actual incorrecta' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.status = 'active';
    await user.save();

    console.info(`changePassword: user ${user._id} changed password`);

    res.json({ ok: true });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/login
 * body: { email, password }
 */
export const login = async (req, res, next) => {
  try {
    let { email, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();

    const user = await Usuario.findOne({ email });
    if (!user || !user.activo) {
      // evitar dar pistas: mensaje genérico
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });

    if (user.status === 'invited') {
      // El frontend debe redirigir a completar invitación
      return res.status(409).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debés cambiar la contraseña' });
    }

    const token = signJwt(user);
    res.json({
      accessToken: token,
      user: {
        _id: user._id,
        email: user.email,
        rol: user.rol,
        permisos: user.permisos,
      },
    });
  } catch (err) {
    next(err);
  }
};

export async function resetSuperadmin(req, res, next) {
  try {
    const token = req.headers['x-setup-token'] || req.query.token;

    if (!token || token !== process.env.ADMIN_SETUP_TOKEN) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const { password } = req.body;
    if (!password || password.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ message: `Password requerido (>= ${MIN_PASSWORD_LEN} caracteres)` });
    }

    const hash = await bcrypt.hash(password, 10);
    const u = await Usuario.findOneAndUpdate(
      { rol: 'superadmin' },
      { passwordHash: hash, activo: true },
      { new: true }
    );

    if (!u) return res.status(404).json({ message: 'No existe superadmin' });
    console.info('resetSuperadmin: rotated superadmin password');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export const me = async (req, res) => {
  // req.user es poblado por el middleware (no contiene passwordHash)
  res.json(req.user);
};
