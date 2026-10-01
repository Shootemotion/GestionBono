// src/routes/plantilla.routes.js
import { Router } from "express";
import {
  createPlantilla,
  listPlantillas,
  updatePlantilla,
  deletePlantilla,
  restaurarPlantilla,
  listPlantillasEliminadas,
  getPlantillaById,
  versionarPlantilla,
  aprobarVersionPlantilla
} from "../controllers/plantilla.controller.js";
import { requireCap } from "../auth/auth.middleware.js";
import { listarFantasmas, detalleFantasma } from "../controllers/fantasmas.controller.js";
import { historialPlantilla, impactoCambio, revertirPlantilla } from "../controllers/historialPlantilla.controller.js";

const router = Router();

// La auditoría de escrituras se aplica globalmente en server.js
// (auditarEscrituras), no ruta por ruta.

/* --- Lectura --- */
router.get("/", listPlantillas);
// Antes de "/:id" para que "eliminadas" no se interprete como un id.
router.get("/eliminadas", requireCap("objetivos:eliminar"), listPlantillasEliminadas);
// Deteccion de objetivos sin ningun dato cargado (limpieza de clonaciones).
router.get("/sin-datos", requireCap("objetivos:eliminar"), listarFantasmas);
router.get("/sin-datos/:id", requireCap("objetivos:eliminar"), detalleFantasma);
router.get("/:id", getPlantillaById);

/* --- Escritura --- */
router.post("/", createPlantilla);
router.put("/:id", updatePlantilla);

// 🔒 Eliminar es la operación destructiva: se restringe a RRHH / dirección /
//    superadmin. Igual el borrado es lógico, así que sigue siendo reversible.
router.delete("/:id", requireCap("objetivos:eliminar"), deletePlantilla);
router.post("/:id/restaurar", requireCap("objetivos:eliminar"), restaurarPlantilla);

/* --- Historial, impacto y reversión --- */
// Historial: las versiones previas que guarda la auditoría, con opción de volver.
router.get("/:id/historial", historialPlantilla);
// Impacto: qué se rompe si se guardan estos cambios. Se consulta ANTES de guardar.
router.post("/:id/impacto", impactoCambio);
// Revertir es destructivo sobre la configuración: mismo permiso que eliminar.
router.post("/:id/revertir/:auditoriaId", requireCap("objetivos:eliminar"), revertirPlantilla);

/* --- Versionado --- */
router.post("/:id/versionar", versionarPlantilla);
router.put("/:id/aprobar-version", aprobarVersionPlantilla);

export default router;
