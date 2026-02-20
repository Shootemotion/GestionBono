// backend/src/routes/procesosISO.routes.js
import { Router } from "express";
import { getAll, getById, create, update, remove, seed } from "../controllers/procesosISO.controller.js";

const router = Router();

// authenticateJWT ya se aplica globalmente en server.js
router.get("/", getAll);
router.post("/seed", seed);   // POST /api/procesos-iso/seed → crea P01-P15 si no existen
router.get("/:id", getById);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
