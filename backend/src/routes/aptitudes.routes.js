import { Router } from 'express';
import { authenticateJWT, requireCap } from '../auth/auth.middleware.js';
import {
  listarAptitudes,
  crearAptitud,
  editarAptitud,
  eliminarAptitud,
  asignacionMasivaEmpleados,
} from '../controllers/aptitudes.controller.js';

const router = Router();

// Todas requieren auth; afinamos por capacidad
router.get('/', authenticateJWT, requireCap('aptitudes:ver'), listarAptitudes);
router.post('/', authenticateJWT, requireCap('aptitudes:crear'), crearAptitud);
router.put('/:id', authenticateJWT, requireCap('aptitudes:editar'), editarAptitud);
router.delete('/:id', authenticateJWT, requireCap('aptitudes:eliminar'), eliminarAptitud);

// Masiva a empleados seleccionados
router.post('/asignacion-masiva', authenticateJWT, requireCap('aptitudes:crear'), asignacionMasivaEmpleados);

export default router;
