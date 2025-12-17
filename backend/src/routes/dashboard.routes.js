// backend/src/routes/dashboard.routes.js
import { Router } from 'express';
import { authenticateJWT, requireCap } from '../auth/auth.middleware.js';
import { dashByArea, dashBySector, dashByEmpleado, getExecutiveData } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/ejecutivo', authenticateJWT, requireCap('nomina:ver'), getExecutiveData);
router.get('/area/:areaId', authenticateJWT, requireCap('nomina:ver'), dashByArea);
router.get('/sector/:sectorId', authenticateJWT, requireCap('nomina:ver'), dashBySector);
router.get('/empleado/:empleadoId', authenticateJWT, requireCap('nomina:ver'), dashByEmpleado);
router.get("/sector/:sectorId/:year", dashBySector);
router.get("/area/:areaId/:year", dashByArea);
export default router;
