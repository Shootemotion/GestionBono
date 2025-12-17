// src/routes/templates.routes.js
import { Router } from "express";
import {
  createTemplate,
  listTemplates,
  updateTemplate,
  deleteTemplate,
} from "../controllers/templates.controller.js";

const router = Router();

router.post("/", createTemplate);
router.get("/", listTemplates);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

export default router;
