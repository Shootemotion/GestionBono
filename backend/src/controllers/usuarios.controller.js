import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Usuario from '../models/Usuario.model.js';
import Empleado from '../models/Empleado.model.js';
import { sendCredentialsEmail } from '../utils/mailer.js';
import { invalidateUserCacheByUserId } from '../auth/auth.middleware.js';

// Util: asegura que devolvemos un usuario sin hash
const safeUser = (u) => {
  const o = u && typeof u.toObject === 'function' ? u.toObject() : (u || {});
  delete o.passwordHash;
  return o;
};

// POST /api/usuarios
// body: { email, rol, empleadoId? }
export const crearUsuario = async (req, res) => {
  try {
    let { email, rol = 'visor', isCalidad, empleadoId, permisos, enviarEmail = true } = req.body || {};

    if (!email) return res.status(400).json({ message: 'Email requerido' });

    // Normalizar
    email = String(email).trim().toLowerCase();

    // permisos: solo superadmin o usuarios:manage pueden setear arbitrarios
    let finalPerms = [];
    if (Array.isArray(permisos) && permisos.length) {
      if (req.user?.rol === 'superadmin' || (req.user?.permisos || []).includes('usuarios:manage')) {
        finalPerms = permisos;
      } else {
        return res.status(403).json({ message: 'No autorizado para asignar permisos' });
      }
    }

    // Buscar si ya existe usuario con ese email
    const existing = await Usuario.findOne({ email });

    // Generar contraseña temporal (pero solo la guardamos si vamos a crear/reseteo/vincular)
    const tempPwd = crypto.randomBytes(4).toString('hex');
    const passwordHash = await bcrypt.hash(tempPwd, 10);

    // 1) No existe -> crear
    if (!existing) {
      const user = await Usuario.create({
        email,
        rol,
        isCalidad: Boolean(isCalidad),
        empleado: empleadoId || undefined,
        passwordHash,
        status: 'invited',
        activo: true,
        permisos: finalPerms,
      });

      if (enviarEmail !== false) {
        await sendCredentialsEmail(email, tempPwd, false);
      }

      return res.status(201).json({ action: 'created', user: safeUser(user), tempPassword: tempPwd });
    }

    // 2) Existe y NO está vinculado a empleado -> vincularlo
    if (!existing.empleado) {
      existing.empleado = empleadoId || undefined;
      existing.rol = rol || existing.rol;
      if (isCalidad !== undefined) existing.isCalidad = Boolean(isCalidad);
      existing.passwordHash = passwordHash;
      existing.status = 'invited';
      existing.activo = true;
      if (finalPerms.length) existing.permisos = finalPerms;
      await existing.save();

      if (enviarEmail !== false) {
        await sendCredentialsEmail(email, tempPwd, false);
      }

      return res.json({ action: 'linked', user: safeUser(existing), tempPassword: tempPwd });
    }

    // 3) Existe y ya vinculado AL MISMO empleado -> resetear contraseña temporal
    if (String(existing.empleado) === String(empleadoId)) {
      existing.passwordHash = passwordHash;
      existing.status = 'invited';
      existing.rol = rol || existing.rol;   // 🔥 CORRECCIÓN
      if (isCalidad !== undefined) existing.isCalidad = Boolean(isCalidad);
      await existing.save();

      if (enviarEmail !== false) {
        await sendCredentialsEmail(email, tempPwd, true);
      }

      return res.json({ action: 'reset', user: safeUser(existing), tempPassword: tempPwd });
    }

    // 4) Existe y vinculado a otro empleado -> conflicto
    return res.status(409).json({
      action: 'conflict',
      message: 'El email ya está registrado y vinculado a otro empleado',
      user: safeUser(existing),
    });

  } catch (err) {
    console.error('crearUsuario error:', err);
    // fallback general
    return res.status(500).json({ message: 'Error interno al crear usuario' });
  }
};
// PATCH /api/usuarios/:id/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { enviarEmail = true } = req.body || {};

    const tempPwd = crypto.randomBytes(4).toString('hex');
    const passwordHash = await bcrypt.hash(tempPwd, 10);

    const user = await Usuario.findByIdAndUpdate(
      id,
      { passwordHash, status: 'invited' },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (enviarEmail !== false) {
      await sendCredentialsEmail(user.email, tempPwd, true);
    }

    return res.json({ user: safeUser(user), tempPassword: tempPwd });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No se pudo resetear la contraseña' });
  }
};

// PATCH /api/usuarios/:id/link   body: { empleadoId }
export const linkEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const { empleadoId } = req.body;

    const emp = await Empleado.findById(empleadoId);
    if (!emp) return res.status(404).json({ message: 'Empleado no encontrado' });

    const yaVinculado = await Usuario.findOne({ empleado: empleadoId, _id: { $ne: id } });
    if (yaVinculado) return res.status(409).json({ message: 'Ese empleado ya está vinculado a otro usuario' });

    const user = await Usuario.findByIdAndUpdate(id, { empleado: empleadoId }, { new: true });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No se pudo vincular empleado' });
  }
};


export const listarUsuarios = async (req, res, next) => {
  try {
    // Podés popular empleado si querés mostrar vinculo con nómina
    const users = await Usuario.find().populate({
      path: 'empleado',
      select: 'nombre apellido legajo area sector', // ajustar campos
    }).sort({ email: 1 });

    return res.json((users || []).map(safeUser));
  } catch (err) {
    next(err);
  }
};
// PATCH /api/usuarios/:id/unlink
export const unlinkEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await Usuario.findByIdAndUpdate(id, { $unset: { empleado: 1 } }, { new: true });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No se pudo desvincular empleado' });
  }
};

// PATCH /api/usuarios/:id (Update email/role)
export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    let { email, rol, isCalidad } = req.body;

    // Normalizar email si viene
    if (email) email = String(email).trim().toLowerCase();

    // Validar unicidad de email si cambió
    if (email) {
      const existing = await Usuario.findOne({ email, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ message: 'El email ya está en uso por otro usuario.' });
      }
    }

    const updates = {};
    if (email) updates.email = email;
    if (rol) updates.rol = rol;
    if (isCalidad !== undefined) updates.isCalidad = Boolean(isCalidad);

    const user = await Usuario.findByIdAndUpdate(id, updates, { new: true });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Invalidar caché del middleware para que el próximo request refleje los cambios de rol
    invalidateUserCacheByUserId(id);

    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('actualizarUsuario error:', err);
    return res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};
