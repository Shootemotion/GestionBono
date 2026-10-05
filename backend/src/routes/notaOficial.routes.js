// backend/src/routes/notaOficial.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import {
  estadoNotasOficiales,
  confirmarNotaOficial,
  desconfirmarNotaOficial,
  confirmarSinObservaciones,
} from "../controllers/notaOficial.controller.js";

const router = Router();

// Leer el estado: quien ya puede ver las evaluaciones de todos.
router.get("/", authenticateJWT, requireCap("rrhh:evaluaciones:ver"), estadoNotasOficiales);

// Confirmar es fijar el número que define un bono: pide la capacidad de
// cierre, la misma que cerrar un feedback.
router.post("/confirmar-sin-observaciones", authenticateJWT, requireCap("rrhh:evaluaciones:cierre"), confirmarSinObservaciones);
router.post("/:feedbackId/confirmar", authenticateJWT, requireCap("rrhh:evaluaciones:cierre"), confirmarNotaOficial);
router.delete("/:feedbackId/confirmar", authenticateJWT, requireCap("rrhh:evaluaciones:cierre"), desconfirmarNotaOficial);

export default router;
