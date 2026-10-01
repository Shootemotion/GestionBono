// src/routes/overrides.routes.js
import { Router } from "express";
import {
  upsertOverride,
  listOverrides,
  deleteOverride,
} from "../controllers/overrides.controller.js";
import { requireCap } from "../auth/auth.middleware.js";

const router = Router();

// El override guarda el PESO de un objetivo para una persona: escribirlo le
// cambia la nota. Antes lo podía hacer cualquiera con sesión iniciada, visor
// incluido. Ahora pide la misma capacidad que editar un objetivo, que ya
// tienen RRHH, dirección, jefes de área y los referentes.
router.post("/", requireCap("objetivos:editar"), upsertOverride);
router.get("/", listOverrides);
router.delete("/:id", requireCap("objetivos:editar"), deleteOverride);

export default router;
