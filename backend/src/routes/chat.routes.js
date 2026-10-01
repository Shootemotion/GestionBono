import express from "express";
import { authenticateJWT } from "../auth/auth.middleware.js";
import {
  getContactos,
  getConversaciones,
  getMensajes,
  enviarMensaje,
  getNoLeidos,
} from "../controllers/chat.controller.js";

const router = express.Router();

// Cualquier usuario autenticado puede usar el chat ("todos con todos").
router.use(authenticateJWT);

router.get("/contactos", getContactos);
router.get("/conversaciones", getConversaciones);
router.get("/no-leidos", getNoLeidos);
router.get("/mensajes/:otroId", getMensajes);
router.post("/mensajes", enviarMensaje);

export default router;
