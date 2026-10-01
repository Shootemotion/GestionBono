// backend/src/routes/comparador.routes.js
import { Router } from "express";
import multer from "multer";
import { authenticateJWT, requireRole } from "../auth/auth.middleware.js";
import { compararBackup, coleccionesComparables } from "../controllers/comparador.controller.js";
import { previoRestauracion, restaurarEmpleado } from "../controllers/restaurador.controller.js";
import { planDepuracion, aplicarPaso1, aplicarPaso2 } from "../controllers/depuracion.controller.js";

// En memoria: el zip se lee y se descarta, nunca toca el disco ni la base.
const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const router = Router();

// Un backup contiene la base entera —sueldos incluidos—, así que comparar
// queda restringido a superadmin.
router.get("/colecciones", authenticateJWT, requireRole("superadmin"), coleccionesComparables);
router.post("/backup", authenticateJWT, requireRole("superadmin"), subir.single("backup"), compararBackup);

// Restauración por empleado: primero la vista previa, después aplicar.
// Se restauran únicamente las asignaciones (overrides); nunca evaluaciones.
router.post("/previo", authenticateJWT, requireRole("superadmin"), subir.single("backup"), previoRestauracion);
router.post("/restaurar", authenticateJWT, requireRole("superadmin"), subir.single("backup"), restaurarEmpleado);

// Depuración en dos pasos, de a un empleado. El paso 2 valida en el backend
// que el paso 1 esté saldado: el orden no depende de la pantalla.
router.post("/depuracion/plan", authenticateJWT, requireRole("superadmin"), subir.single("backup"), planDepuracion);
router.post("/depuracion/paso1", authenticateJWT, requireRole("superadmin"), subir.single("backup"), aplicarPaso1);
router.post("/depuracion/paso2", authenticateJWT, requireRole("superadmin"), subir.single("backup"), aplicarPaso2);

export default router;
