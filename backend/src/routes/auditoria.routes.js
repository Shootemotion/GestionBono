// backend/src/routes/auditoria.routes.js
import { Router } from "express";
import { listAuditoria, getAuditoria, resumenAuditoria } from "../controllers/auditoria.controller.js";
import { requireCap } from "../auth/auth.middleware.js";

const router = Router();

// Ver quién cambió qué es información sensible: se restringe igual que la
// gestión de usuarios. No hay rutas de escritura a propósito.
const soloAdmin = requireCap("usuarios:manage");

router.get("/resumen", soloAdmin, resumenAuditoria);
router.get("/", soloAdmin, listAuditoria);
router.get("/:id", soloAdmin, getAuditoria);

export default router;
