// backend/src/routes/reportes.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import { exportarDesempeno, areasParaReporte } from "../controllers/reportes.controller.js";

const router = Router();

// Exportar resultados expone las notas de toda la gente que el usuario puede
// ver, así que pide la misma capacidad que la nómina. El recorte por jefe lo
// aplica construirDataset.
router.get("/desempeno", authenticateJWT, requireCap("nomina:ver"), exportarDesempeno);
router.get("/areas", authenticateJWT, requireCap("nomina:ver"), areasParaReporte);

export default router;
