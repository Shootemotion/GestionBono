// backend/src/routes/dashboard.routes.js
import { Router } from 'express';
import { authenticateJWT, requireCap } from '../auth/auth.middleware.js';
import { dashByArea, dashBySector, dashByEmpleado, getExecutiveData, debugEmpleadoPlantillas, pesosAsignados } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/ejecutivo', authenticateJWT, requireCap('nomina:ver'), getExecutiveData);
router.get('/pesos-asignados', authenticateJWT, requireCap('nomina:ver'), pesosAsignados);
router.get('/debug/empleado/:empleadoId', authenticateJWT, debugEmpleadoPlantillas);
router.get('/area/:areaId', authenticateJWT, requireCap('nomina:ver'), dashByArea);
router.get('/sector/:sectorId', authenticateJWT, requireCap('nomina:ver'), dashBySector);
router.get('/empleado/:empleadoId', authenticateJWT, requireCap('nomina:ver'), dashByEmpleado);
// Las mismas dos, con el año en la URL. Estaban sin `requireCap`: el JWT lo
// exige server.js para todo, pero la capacidad no la pedía nadie, así que
// cualquier usuario con sesión —un colaborador sin permisos de nómina— podía
// pedir el dashboard completo de un área agregándole el año a la ruta.
router.get("/sector/:sectorId/:year", authenticateJWT, requireCap('nomina:ver'), dashBySector);
router.get("/area/:areaId/:year", authenticateJWT, requireCap('nomina:ver'), dashByArea);
export default router;
