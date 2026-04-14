import express from 'express';
import { chatWithBot } from '../controllers/bot.controller.js';
import { authenticateJWT } from '../auth/auth.middleware.js';

const router = express.Router();

// Endpoint para el chat del BonoBot
// POST /api/bot/chat
router.post('/chat', authenticateJWT, chatWithBot);

export default router;
