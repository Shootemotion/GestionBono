import { Router } from "express";
import { authenticateJWT, requireRole, requireCap } from "../auth/auth.middleware.js";
import {
    getFeedbacks,
    createFeedback,
    updateFeedbackStatus,
    replyFeedback,
} from "../controllers/appFeedback.controller.js";

const router = Router();

// 🔹 GET all feedbacks (Solo Admin/RRHH/Sistemas)
// Here we use requireRole instead of requireCap just for simplicity,
// or we can allow directivos/rrhh
router.get(
    "/",
    authenticateJWT,
    requireRole(["superadmin", "rrhh", "directivo"]),
    getFeedbacks
);

// 🔹 POST new feedback (Cualquier usuario logueado)
router.post("/", authenticateJWT, createFeedback);

// 🔹 PATCH status
router.patch(
    "/:id/status",
    authenticateJWT,
    requireRole(["superadmin", "rrhh", "directivo"]),
    updateFeedbackStatus
);

// 🔹 PATCH reply (Envía el correo)
router.patch(
    "/:id/reply",
    authenticateJWT,
    requireRole(["superadmin", "rrhh", "directivo"]),
    replyFeedback
);

export default router;
