// backend/src/routes/contratos.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import { estadoContratos } from "../controllers/contratos.controller.js";

const router = Router();

// Lectura pura. Pide la misma capacidad que el resto de Control de Datos: el
// detalle de las violaciones nombra personas y sus notas.
router.get("/", authenticateJWT, requireCap("rrhh:evaluaciones:ver"), estadoContratos);

export default router;
