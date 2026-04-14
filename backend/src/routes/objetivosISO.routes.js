import { Router } from "express";
import { getAll, getById, create, update, remove, subirAdjuntoMes } from "../controllers/objetivosISO.controller.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Configuración de Multer para Adjuntos ISO
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(process.cwd(), "uploads", "iso-evidencias");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `iso-${req.params.id}-m${req.params.mes}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// authenticateJWT ya se aplica globalmente en server.js
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

// Nueva ruta para adjuntos mensuales
router.post("/:id/mes/:mes/adjunto", upload.single("archivo"), subirAdjuntoMes);

export default router;

