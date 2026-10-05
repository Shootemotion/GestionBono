// backend/src/routes/divergencias.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import { listarDivergencias } from "../controllers/divergencias.controller.js";

const router = Router();

// Lectura pura: compara notas guardadas contra el motor y explica la
// diferencia. Expone notas de todo el mundo, así que pide la misma capacidad
// que el resto de Control de Datos.
router.get("/", authenticateJWT, requireCap("rrhh:evaluaciones:ver"), listarDivergencias);

export default router;
