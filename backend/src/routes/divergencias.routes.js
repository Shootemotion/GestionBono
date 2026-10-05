// backend/src/routes/divergencias.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import { listarDivergencias } from "../controllers/divergencias.controller.js";
import { detalleDivergencia } from "../controllers/divergenciaDetalle.controller.js";

const router = Router();

// Lectura pura: compara notas guardadas contra el motor y explica la
// diferencia. Expone notas de todo el mundo, así que pide la misma capacidad
// que el resto de Control de Datos.
// El desglose objetivo por objetivo de un caso puntual. Va antes de "/"
// no hace falta acá, pero se declara primero por costumbre de rutas.
router.get("/detalle", authenticateJWT, requireCap("rrhh:evaluaciones:ver"), detalleDivergencia);
router.get("/", authenticateJWT, requireCap("rrhh:evaluaciones:ver"), listarDivergencias);

export default router;
