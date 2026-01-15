import express from "express";
import { authenticateJWT, requireRole } from "../auth/auth.middleware.js";
import { createAviso, getAvisosHistory, deleteAviso, getMyAvisos, toggleAvisoStatus } from "../controllers/globalAviso.controller.js";

const router = express.Router();

router.use(authenticateJWT);

// Consumer
router.get("/my", getMyAvisos);

// Admin / RRHH
router.post("/", requireRole("superadmin", "rrhh", "directivo"), createAviso);
router.get("/history", requireRole("superadmin", "rrhh", "directivo"), getAvisosHistory);
router.delete("/:id", requireRole("superadmin", "rrhh", "directivo"), deleteAviso);
router.patch("/:id/toggle", requireRole("superadmin", "rrhh", "directivo"), toggleAvisoStatus);

export default router;
