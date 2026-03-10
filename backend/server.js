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

import feedbackRoutes from './src/routes/feedback.routes.js';
import bonoRoutes from './src/routes/bono.routes.js';
import systemRoutes from './src/routes/system.routes.js';
import cron from 'node-cron';
import { runBackup } from './scripts/backup.js';
import { seedRoles } from './seedRoles.js';
import rolesRouter from './src/routes/roles.routes.js';

// ... existing imports ...
import globalAvisoRoutes from './src/routes/globalAviso.routes.js';
import objetivosISORoutes from './src/routes/objetivosISO.routes.js';
import procesosISORoutes from './src/routes/procesosISO.routes.js';
import analyticsRoutes from './src/analytics/analytics.routes.js';
import Empleado from './src/models/Empleado.model.js';

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

const app = express();

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
        '/api/dashboard/debug/empleado/{empleadoId}': {
          get: {
            tags: ['🔍 Debug Sistema'],
            summary: 'Comparar fuentes de plantillas por empleado',
            description:
              'Devuelve un análisis comparativo de las 3 fuentes de datos que usa el sistema:\n\n' +
              '**Fuente 1 — Gantt** (`computeForEmployees`): override de inclusión tiene prioridad sobre `isTemplateApplicable`.\n\n' +
              '**Fuente 2 — Mi Desempeño** (`dashByEmpleado`): solo aplica `isTemplateApplicable` (STICKY_HISTORY, scope activo).\n\n' +
              '**Fuente 3 — Gestión Plantillas** (query directa): solo plantillas activas que coincidan con el scope actual del empleado.\n\n' +
              '---\n**Empleados disponibles:**\n```\n' + empEnumDesc + '\n```',
            security: [{ BearerAuth: [] }],
            parameters: [
              {
                name: 'empleadoId',
                in: 'path',
                required: true,
                description: 'ID del empleado a analizar',
                schema: {
                  type: 'string',
                  enum: empEnum,
                },
              },
              {
                name: 'anio',
                in: 'query',
                required: false,
                description: 'Año fiscal (por defecto el año actual)',
                schema: {
                  type: 'integer',
                  example: new Date().getFullYear(),
                },
              },
            ],
            responses: {
              200: {
                description: 'Análisis completo con discrepancias entre fuentes',
              },
              401: { description: 'No autorizado' },
              404: { description: 'Empleado no encontrado' },
            },
          },
        },
      },
      // Agregar esquema de seguridad Bearer para el debug endpoint
      components: {
        ...(swaggerBase.components || {}),
        securitySchemes: {
          ...(swaggerBase.components?.securitySchemes || {}),
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT obtenido en /api/auth/login',
          },
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
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/avisos', globalAvisoRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/roles', rolesRouter);
app.use('/api/objetivos-iso', objetivosISORoutes);
app.use('/api/procesos-iso', procesosISORoutes);

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
const PORT = process.env.PORT || 5000;

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
