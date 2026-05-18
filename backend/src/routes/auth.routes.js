// backend/src/routes/auth.routes.js
import { Router } from 'express';
import { authenticateJWT, whoami } from '../auth/auth.middleware.js';
import { bootstrapSuperadmin, login, me } from '../controllers/auth.controller.js';
import { resetSuperadmin } from '../controllers/auth.controller.js';
import { completeInvite, changePassword, forgotPassword } from "../controllers/auth.controller.js";
import { loginLimiter, forgotPasswordLimiter } from '../middleware/rateLimiter.middleware.js';
const router = Router();

router.post('/bootstrap-superadmin', bootstrapSuperadmin);
router.post('/login', loginLimiter, login);                    // 🔒 máx 10 intentos / 15 min
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword); // 🔒 máx 5 intentos / hora
router.post('/reset-superadmin', resetSuperadmin);
router.get('/me', authenticateJWT, me);
router.get('/_whoami', authenticateJWT, whoami); // alias útil en dev
router.post("/complete-invite", completeInvite);
router.post("/change-password", authenticateJWT, changePassword);


export default router;
