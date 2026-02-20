// backend/src/routes/objetivosISO.routes.js
import { Router } from "express";
import { getAll, getById, create, update, remove } from "../controllers/objetivosISO.controller.js";

const router = Router();

// authenticateJWT ya se aplica globalmente en server.js
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;

