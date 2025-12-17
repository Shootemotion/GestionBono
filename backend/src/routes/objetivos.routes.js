import { Router } from 'express';
import { authenticateJWT, requireCap } from '../auth/auth.middleware.js';
import {
  listarObjetivos,
  crearObjetivo,
  editarObjetivo,
  eliminarObjetivo,
  asignacionMasiva,
} from '../controllers/objetivos.controller.js';

const router = Router();

router.get(
  '/',
  authenticateJWT,
  requireCap('objetivos:ver'),
  listarObjetivos
);

router.post(
  '/',
  authenticateJWT,
  requireCap('objetivos:crear'),
  crearObjetivo
);

router.put(
  '/:id',
  authenticateJWT,
  requireCap('objetivos:editar'),
  editarObjetivo
);

router.delete(
  '/:id',
  authenticateJWT,
  requireCap('objetivos:eliminar'),
  eliminarObjetivo
);

router.post(
  '/asignacion-masiva',
  authenticateJWT,
  requireCap('objetivos:asignacion'),
  asignacionMasiva
);

export default router;
