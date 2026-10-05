// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Auth & middlewares
import { authenticateJWT, whoami } from './src/auth/auth.middleware.js';

// Routers
import authRouter from './src/routes/auth.routes.js';
import areasRouter from './src/routes/areas.routes.js';
import sectoresRouter from './src/routes/sector.routes.js';
import empleadosRouter from './src/routes/empleados.routes.js';
import dashboardRouter from './src/routes/dashboard.routes.js';
import seguimientoRoutes from './src/routes/seguimiento.routes.js';
import assignmentsRoutes from './src/routes/assignments.routes.js';
import templatesRoutes from './src/routes/plantilla.routes.js';
import participacionesRoutes from './src/routes/participaciones.routes.js';
import overridesRoutes from './src/routes/overrides.routes.js';
import usuariosRoutes from './src/routes/usuarios.routes.js';
import evaluacionRoutes from './src/routes/evaluacion.routes.js';
import simulacionRoutes from './src/routes/simulacion.routes.js';
import reportesRoutes from './src/routes/reportes.routes.js';
import comparadorRoutes from './src/routes/comparador.routes.js';

import feedbackRoutes from './src/routes/feedback.routes.js';
import bonoRoutes from './src/routes/bono.routes.js';
import systemRoutes from './src/routes/system.routes.js';
import auditoriaRoutes from './src/routes/auditoria.routes.js';
import divergenciasRoutes from './src/routes/divergencias.routes.js';
import cron from 'node-cron';
import { runBackup, backupSiHaceFalta } from './scripts/backup.js';
import { seedRoles } from './seedRoles.js';
import rolesRouter from './src/routes/roles.routes.js';

// ... existing imports ...
import globalAvisoRoutes from './src/routes/globalAviso.routes.js';
import objetivosISORoutes from './src/routes/objetivosISO.routes.js';
import procesosISORoutes from './src/routes/procesosISO.routes.js';
import analyticsRoutes from './src/analytics/analytics.routes.js';
import appFeedbackRoutes from './src/routes/appFeedback.routes.js';
import botRoutes from './src/routes/bot.routes.js';
import chatRoutes from './src/routes/chat.routes.js';
import Empleado from './src/models/Empleado.model.js';
import Plantilla from './src/models/Plantilla.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import Usuario from './src/models/Usuario.model.js';
import Role from './src/models/Role.model.js';
import Area from './src/models/Area.model.js';
import Sector from './src/models/Sector.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import { auditarEscrituras } from './src/middleware/auditoria.middleware.js';
import { botLimiter } from './src/middleware/rateLimiter.middleware.js';

// --- CRON JOBS ---
// Run Daily Backup at 03:00 AM
cron.schedule('0 3 * * *', async () => {
  console.log('🕒 [Cron] Executing daily backup...');
  try {
    await runBackup();
    console.log('✅ [Cron] Daily backup completed.');
  } catch (error) {
    console.error('❌ [Cron] Backup failed:', error);
  }
});

// Recuperación de corridas perdidas.
//
// `cron.schedule` solo dispara si el proceso está vivo a las 03:00 en punto y
// no recupera lo que se perdió. Entre el 25 y el 28/09/2026 la máquina estuvo
// apagada a esa hora: tres noches sin backup, sin error y sin nada que lo
// dijera. Esto corre al arrancar y tapa ese hueco.
//
// Va con 30 s de demora para no pelear con el arranque del servidor, y nunca
// tumba el proceso: quedarse sin backup es malo, no levantar es peor.
setTimeout(() => {
  backupSiHaceFalta(24).catch((e) =>
    console.error('❌ [Backup] La recuperación al arranque falló:', e.message)
  );
}, 30_000).unref();

const app = express();

// Detrás de IIS/ARR (reverse proxy en la misma máquina): confiar en el proxy loopback
// para que req.ip sea la IP real del cliente (vía X-Forwarded-For) y el rate limiter
// keyee por cliente y no por la IP del proxy.
app.set('trust proxy', 'loopback');

// --- MIDDLEWARES GLOBALES ---
const whitelist = (process.env.CORS_ORIGIN || "").split(",").map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origen (como Postman o server-to-server)
    if (!origin) return callback(null, true);
    // En desarrollo, permitir todo si no hay whitelist definida
    if (process.env.NODE_ENV !== 'production' && whitelist.length === 0) return callback(null, true);

    if (whitelist.includes('*') || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Bloqueado por CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));
app.use(express.json());

// Servir archivos subidos (acceso público sin JWT)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 1) Rutas públicas (sin JWT)
app.use('/api/auth', authRouter);

// --- Rutas de App Feedback ---
app.use('/api/app-feedback', appFeedbackRoutes);
app.use('/api/bot', botLimiter, botRoutes); // 🔒 máx 30 req / min

// --- SWAGGER API DOCS (Dynamic Spec con picklist de empleados) ---

const swaggerPath = path.join(__dirname, 'src', 'docs', 'swagger.json');
const swaggerBase = fs.existsSync(swaggerPath)
  ? JSON.parse(fs.readFileSync(swaggerPath, 'utf8'))
  : { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' }, paths: {} };

// Endpoint dinámico: genera el spec con el enum de empleados actualizado desde la DB
app.get('/api/docs/spec', async (req, res) => {
  try {
    const empleados = await Empleado.find({}, '_id nombre apellido').sort({ apellido: 1 }).lean();
    const empEnum = empleados.map(e => String(e._id));
    const empEnumDesc = empleados.map(e => `${e.apellido}, ${e.nombre} → ${e._id}`).join('\n');

    const spec = {
      ...swaggerBase,
      paths: {
        ...swaggerBase.paths,
        '/api/analytics/debug/empleado/{empleadoId}': {
          get: {
            tags: ['🔍 Debug Sistema'],
            summary: 'Comparar fuentes de plantillas por empleado',
            description:
              '**Compara nombre + tipo + peso** de objetivos/competencias entre las 3 fuentes del sistema:\n\n' +
              '- **fuenteA_MiDesempeno** → lo que ve el empleado en Mi Desempeño / Sala de Evaluación\n' +
              '- **fuenteB_Gantt** → lo que compute el Gantt (computeForEmployees)\n' +
              '- **fuenteC_GestionPlantillas** → query directa a la DB sin overrides\n\n' +
              '> **🔑 Auth:** Usá el botón **Authorize** arriba e ingresá el token de analytics.\n\n' +
              '> **🖥️ Servidor:** Seleccioná el servidor correcto arriba (Producción o Local).\n\n' +
              '---\n**Empleados disponibles:**\n```\n' + empEnumDesc + '\n```',
            security: [{ ApiKeyAuth: [] }],
            parameters: [
              {
                name: 'empleadoId',
                in: 'path',
                required: true,
                description: 'Empleado a analizar (seleccioná del dropdown)',
                schema: { type: 'string', enum: empEnum },
              },
              {
                name: 'anio',
                in: 'query',
                required: false,
                description: 'Año fiscal',
                schema: { type: 'integer', example: new Date().getFullYear() },
              },
            ],
            responses: {
              200: { description: 'Comparación compacta de las 3 fuentes con discrepancias' },
              401: { description: 'Token inválido — asegurate de hacer Authorize con el X-Analytics-Token' },
              404: { description: 'Empleado no encontrado' },
            },
          },
        },
      },
      components: {
        ...(swaggerBase.components || {}),
        securitySchemes: {
          ...(swaggerBase.components?.securitySchemes || {}),
        },
      },
    };

    res.json(spec);
  } catch (err) {
    console.error('Error generando swagger spec dinámico:', err);
    res.json(swaggerBase);
  }
});

// Swagger UI apunta al spec dinámico
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
  customSiteTitle: 'DiagnosLab API Docs',
  swaggerOptions: {
    url: '/api/docs/spec',
  },
}));

// Analytics API — autenticación propia por token (no requiere JWT)
// Power BI conecta aquí usando el header X-Analytics-Token
app.use('/api/analytics', analyticsRoutes);
// 2) A partir de acá, TODAS las rutas requieren JWT (o mock interno)
app.use(authenticateJWT);

// 2b) Registro de cambios. Va acá —después de identificar al usuario y antes
//     de los routers— para que ninguna ruta de escritura quede sin auditar por
//     olvido. Solo registra métodos que escriben y respuestas 2xx.
app.use(auditarEscrituras({
  '/api/templates':   { entidad: 'plantilla',  modelo: Plantilla },
  '/api/empleados':   { entidad: 'empleado',   modelo: Empleado },
  '/api/usuarios':    { entidad: 'usuario',    modelo: Usuario },
  '/api/roles':       { entidad: 'rol',        modelo: Role },
  '/api/areas':       { entidad: 'area',       modelo: Area },
  '/api/sectores':    { entidad: 'sector',     modelo: Sector },
  '/api/overrides':   { entidad: 'override',   modelo: OverrideObjetivo },
  // Con el modelo puesto, la auditoría guarda el documento ANTES de borrarlo.
  // Sin eso registraba que alguien borró una evaluación pero no qué decía, y
  // el borrado era irreversible: no se podía reconstruir el valor perdido.
  '/api/evaluaciones':{ entidad: 'evaluacion', modelo: Evaluacion },
  '/api/feedbacks':   { entidad: 'feedback',   modelo: null },
}));

// 3) Rutas protegidas por capacidades
app.use('/api/areas', areasRouter);
app.use('/api/sectores', sectoresRouter);
app.use('/api/empleados', empleadosRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/bono', bonoRoutes);
app.use('/api/seguimiento', seguimientoRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/participaciones', participacionesRoutes);
app.use('/api/overrides', overridesRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/evaluaciones', evaluacionRoutes);
app.use('/api/simulacion', simulacionRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/comparador', comparadorRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.get('/api/test-me', (req, res) => res.json({ message: "I AM THE ONE" }));
app.use('/api/avisos', globalAvisoRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/divergencias', divergenciasRoutes);
app.use('/api/roles', rolesRouter);
app.use('/api/objetivos-iso', objetivosISORoutes);
app.use('/api/procesos-iso', procesosISORoutes);
app.use('/api/chat', chatRoutes);

// Alias útil para debug del usuario autenticado
app.get('/api/_whoami', whoami);

// --- MIDDLEWARE DE MANEJO DE ERRORES ---
// Debe ir DESPUÉS de todas las rutas.
const errorHandler = (error, req, res, next) => {
  console.error('ERROR DETECTADO EN LA CENTRAL:', error.message);

  // Errores de Multer (tamaño de archivo, campo inesperado, etc.)
  if (error instanceof multer.MulterError) {
    const map = {
      LIMIT_FILE_SIZE: 413,         // Payload Too Large
      LIMIT_UNEXPECTED_FILE: 400,   // Bad Request
    };
    const status = map[error.code] || 400;
    return res.status(status).json({
      success: false,
      status,
      message: `Error de subida: ${error.message}`,
    });
  }

  // Error de validación custom del fileFilter (no image/*)
  if (error?.message === 'Solo imágenes') {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Solo se permiten archivos de imagen.',
    });
  }

  // Fallback general
  let status = error.statusCode || 500;
  let message = error.message || 'Algo salió mal en el servidor.';

  // Mongoose: Duplicate Key
  if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyValue)[0];
    message = `El valor de '${field}' ya existe en el sistema.`;
  }

  // Mongoose: Validation Error
  if (error.name === 'ValidationError') {
    status = 400;
    const messages = Object.values(error.errors).map(val => val.message);
    message = messages.join('. ') || 'Error de validación.';
  }

  res.status(status).json({
    success: false,
    status,
    message,
    // data: error.errors // Opcional, si el frontend lo usara
  });
};
app.use(errorHandler);

// --- CONEXIÓN A DB y ARRANQUE DEL SERVIDOR ---
const MONGO_URI = process.env.MONGO_URI;
// Respeta PORT del entorno (útil para levantar una segunda instancia en otro
// puerto sin tocar la que ya está corriendo). Si no viene, 5007 como siempre.
const PORT = Number(process.env.PORT) || 5007;

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB conectado exitosamente.');
    await seedRoles();
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error al conectar a MongoDB:', error.message);
  });
// Hot reload trigger
// Hot reload trigger for feedback fix - v2.0
// Force nodemon to pick up new engine files
// chat routes mounted at /api/chat
