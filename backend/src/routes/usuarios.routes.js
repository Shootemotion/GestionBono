// backend/src/routes/usuarios.routes.js
import { Router } from 'express';
import {
  listarUsuarios,
  crearUsuario,
  resetPassword,
  linkEmpleado,
  unlinkEmpleado,
  actualizarUsuario,
} from '../controllers/usuarios.controller.js';
import {
  authenticateJWT as requireAuth,
  requireCap,
  requireRole,
} from '../auth/auth.middleware.js';

const router = Router();

// Listar (GET /api/usuarios) — requiere permiso granular o rol
router.get('/', requireAuth, requireCap('usuarios:ver'), listarUsuarios);

// Crear usuario (POST /api/usuarios)
router.post('/', requireAuth, requireRole('superadmin'), crearUsuario);

// Resetear contraseña (PATCH /api/usuarios/:id/reset-password)
router.patch('/:id/reset-password', requireAuth, requireCap('usuarios:reset_password'), resetPassword);

// Vincular / desvincular empleado (PATCH)
router.patch('/:id/link', requireAuth, requireRole('superadmin'), linkEmpleado);
router.patch('/:id/unlink', requireAuth, requireRole('superadmin'), unlinkEmpleado);

// Actualizar usuario (email/rol)
router.patch('/:id', requireAuth, requireRole('superadmin'), actualizarUsuario);

export default router;
