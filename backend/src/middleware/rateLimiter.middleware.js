// src/middleware/rateLimiter.middleware.js
import rateLimit from 'express-rate-limit';

/**
 * Limita intentos de LOGIN a 10 por IP cada 15 minutos.
 * Protege contra ataques de fuerza bruta en credenciales.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máximo 10 intentos por ventana
  standardHeaders: 'draft-7', // Retorna headers RateLimit-*
  legacyHeaders: false,
  message: {
    success: false,
    status: 429,
    message: 'Demasiados intentos de inicio de sesión. Intentá nuevamente en 15 minutos.',
  },
  // Clave por IP (default de express-rate-limit, con soporte IPv6 correcto).
  // Detrás de un proxy (IIS/ARR) hay que configurar app.set('trust proxy', ...) en server.js
  // para que req.ip sea la IP real del cliente y no la del proxy (loopback).

  // No contabiliza intentos exitosos (status 2xx/3xx)
  skipSuccessfulRequests: true,
});

/**
 * Limita intentos de forgot-password a 5 por IP cada 60 minutos.
 * Previene el abuso del sistema de emails.
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutos
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    status: 429,
    message: 'Demasiadas solicitudes de recuperación de contraseña. Intentá en 1 hora.',
  },
  skipSuccessfulRequests: false,
});

/**
 * Limita el endpoint del Bot a 30 requests por IP por minuto.
 * Protege contra spam al endpoint de IA (Groq).
 */
export const botLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    status: 429,
    message: 'Límite de consultas al asistente alcanzado. Esperá un momento.',
  },
});
