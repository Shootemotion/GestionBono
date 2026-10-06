// backend/src/routes/notaOficial.routes.js
import { Router } from "express";
import { authenticateJWT, requireRole } from "../auth/auth.middleware.js";
import {
  estadoNotasOficiales,
  confirmarNotaOficial,
  desconfirmarNotaOficial,
  confirmarSinObservaciones,
} from "../controllers/notaOficial.controller.js";

const router = Router();

// Cerrado al superadmin, lectura incluida.
//
// Acá se fija el número que paga el bono y que, una vez confirmado, le gana al
// cálculo en todas las pantallas. No es una pantalla de consulta: es el lugar
// donde se decide entre tres números distintos para la misma persona.
//
// Va en la ruta y no solo en el menú: ocultar el link no impide que alguien
// escriba la URL, y el `requireCap` anterior lo habilitaba a cualquiera con la
// capacidad de cierre de RRHH.
const soloSuperadmin = [authenticateJWT, requireRole("superadmin")];

router.get("/", ...soloSuperadmin, estadoNotasOficiales);
router.post("/confirmar-sin-observaciones", ...soloSuperadmin, confirmarSinObservaciones);
router.post("/:feedbackId/confirmar", ...soloSuperadmin, confirmarNotaOficial);
router.delete("/:feedbackId/confirmar", ...soloSuperadmin, desconfirmarNotaOficial);

export default router;
