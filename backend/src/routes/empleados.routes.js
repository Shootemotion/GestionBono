import { Router } from 'express';
import {
  obtenerEmpleados,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado,
  subirFotoEmpleado,
  subirCVEmpleado,
  actualizarSueldoEmpleado,
  eliminarSueldoHistorico,
} from '../controllers/empleados.controller.js';
import { requireCap, requireCapOrSelf, requireRole } from '../auth/auth.middleware.js';
import { listCarrera, createCarrera, updateCarrera, deleteCarrera, getCarreraResumen, uploadPerfilPuesto, deletePerfilPuesto, setPrincipalCarrera } from "../controllers/carrera.controller.js";
import { listCapacitaciones, createCapacitacion, updateCapacitacion, deleteCapacitacion, getCapacitacionesResumen } from "../controllers/capacitacion.controller.js";
import { listDocumentos, createDocumento, deleteDocumento } from "../controllers/documento.controller.js";
import { listIncidencias, createIncidencia, deleteIncidencia } from "../controllers/incidencias.controller.js";
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import mongoose from 'mongoose';
import Empleado from '../models/Empleado.model.js';
import { puedeVerEmpleado } from '../utils/alcanceEmpleados.js';
import { redactSueldoEmpleado } from '../utils/salaryVisibility.js';

const router = Router();

// ---- helpers ----
function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-_.]/g, '')
    .trim()
    .replace(/\s/g, '-')
    .toLowerCase();
}

// ObjectId simple check
function assertObjectId(req, res, next) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID inválido' });
  }
  next();
}

// ---- middleware: precargar empleado por :id ----
async function preloadEmpleado(req, res, next) {
  try {
    const emp = await Empleado.findById(req.params.id)
      .populate({
        path: "area",
        populate: { path: "referentes", select: "nombre apellido email celular" }
      })
      .populate("sector", "nombre");
    if (!emp) return res.status(404).json({ message: 'Empleado no encontrado' });
    // 🔒 Un jefe solo opera sobre su gente. Dirección, RRHH y superadmin pasan
    // siempre; cualquiera puede acceder a su propio legajo.
    if (!puedeVerEmpleado(req.user, emp)) {
      return res.status(403).json({ message: 'Este empleado está fuera de tu alcance' });
    }
    req.empleado = emp;
    next();
  } catch (err) {
    next(err);
  }
}

// ---- multer con destino por empleado ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), 'uploads', 'empleados', legible);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg').toLowerCase();
    cb(null, `perfil-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) return cb(new Error('Solo imágenes'));
    cb(null, true);
  }
});

// 📋 Listado + alta
router.get('/', requireCap('nomina:ver'), obtenerEmpleados);
router.post('/', requireCap('nomina:crear'), crearEmpleado);

// 📄 Obtener un empleado por ID (útil para legajo)
router.get('/:id',
  requireCapOrSelf('nomina:ver'),
  assertObjectId,
  preloadEmpleado,
  (req, res) => res.json(redactSueldoEmpleado(req.empleado, req.user))
);

// ✏️ Actualizar datos del legajo
router.patch('/:id',
  requireCapOrSelf('nomina:editar'),
  assertObjectId,
  actualizarEmpleado
);

// 🗑️ Eliminar empleado
router.delete('/:id',
  requireCap('nomina:eliminar'),
  assertObjectId,
  eliminarEmpleado
);

// 🖼️ Subir foto al legajo → carpeta por empleado
router.post(
  '/:id/foto',
  requireCapOrSelf('nomina:editar'),
  assertObjectId,
  preloadEmpleado,
  upload.single('foto'),
  subirFotoEmpleado
);

// 💰 Actualizar sueldo base con histórico — SOLO Dirección / RRHH (+ superadmin)
router.post(
  '/:id/sueldo',
  requireRole('rrhh', 'directivo'),
  assertObjectId,
  actualizarSueldoEmpleado
);

router.delete(
  '/:id/sueldo/:subId',
  requireRole('rrhh', 'directivo'),
  assertObjectId,
  eliminarSueldoHistorico
);

// ---- multer para CV con destino por empleado ----
const storageCV = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), 'uploads', 'empleados', legible);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.pdf').toLowerCase();
    cb(null, `cv-${Date.now()}${ext}`);
  }
});

const uploadCV = multer({
  storage: storageCV,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|doc|docx)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Solo se aceptan archivos PDF, DOC o DOCX'));
    cb(null, true);
  },
});

router.post(
  '/:id/cv',
  requireCap('nomina:editar'),
  preloadEmpleado,
  uploadCV.single('cv'),
  subirCVEmpleado
);

/* ========== uploads certificados (capacitaciones) ========== */
const storageCert = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), "uploads", "empleados", legible, "certificados");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".pdf").toLowerCase();
    cb(null, `cert-${Date.now()}${ext}`);
  }
});
const uploadCert = multer({
  storage: storageCert,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|doc|docx/i.test(file.mimetype) || /\.(pdf|doc|docx)$/i.test(file.originalname || "");
    if (!ok) return cb(new Error("Formato no permitido (PDF/DOC/DOCX)"));
    cb(null, true);
  }
});

/* ========== CARRERA (historial de puestos) ========== */
// ---- multer para perfil de puesto firmado (destino por empleado) ----
const storagePerfil = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), "uploads", "empleados", legible, "perfiles");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".pdf").toLowerCase();
    cb(null, `perfil-${Date.now()}${ext}`);
  }
});
const uploadPerfil = multer({
  storage: storagePerfil,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(file.originalname || "");
    if (!ok) return cb(new Error("Formato no permitido"));
    cb(null, true);
  }
});

router.get("/:id/carrera",
  requireCapOrSelf("nomina:ver"), assertObjectId, preloadEmpleado, listCarrera);

router.post("/:id/carrera",
  requireCap("nomina:editar"), assertObjectId, preloadEmpleado, createCarrera);

router.put("/:id/carrera/:itemId",
  requireCap("nomina:editar"), assertObjectId, updateCarrera);

router.delete("/:id/carrera/:itemId",
  requireCap("nomina:editar"), assertObjectId, deleteCarrera);

router.patch("/:id/carrera/:itemId/principal",
  requireCap("nomina:editar"), assertObjectId, setPrincipalCarrera);

// Perfil de puesto firmado (adjunto por puesto)
router.post("/:id/carrera/:itemId/perfil",
  requireCap("nomina:editar"), assertObjectId, preloadEmpleado, uploadPerfil.single("archivo"), uploadPerfilPuesto);

router.delete("/:id/carrera/:itemId/perfil",
  requireCap("nomina:editar"), assertObjectId, preloadEmpleado, deletePerfilPuesto);

router.get("/:id/carrera/resumen",
  requireCapOrSelf("nomina:ver"), assertObjectId, preloadEmpleado, getCarreraResumen);

/* ========== CAPACITACIONES ========== */
router.get("/:id/capacitaciones",
  requireCapOrSelf("nomina:ver"), assertObjectId, preloadEmpleado, listCapacitaciones);

router.post("/:id/capacitaciones",
  requireCapOrSelf("nomina:editar"), assertObjectId, preloadEmpleado, uploadCert.single("certificado"), createCapacitacion);

router.put("/:id/capacitaciones/:itemId",
  requireCapOrSelf("nomina:editar"), assertObjectId, preloadEmpleado, uploadCert.single("certificado"), updateCapacitacion);

router.delete("/:id/capacitaciones/:itemId",
  requireCapOrSelf("nomina:editar"), assertObjectId, preloadEmpleado, deleteCapacitacion);

router.get("/:id/capacitaciones/resumen",
  requireCapOrSelf("nomina:ver"), assertObjectId, preloadEmpleado, getCapacitacionesResumen);

/* ========== DOCUMENTOS ========== */
const storageDoc = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), "uploads", "empleados", legible, "documentos");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Mantener extensión original o sanear nombre
    const ext = path.extname(file.originalname || ".pdf").toLowerCase();
    cb(null, `doc-${Date.now()}${ext}`);
  }
});
const uploadDoc = multer({
  storage: storageDoc,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    // Permitir varios
    const ok = /\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png)$/i.test(file.originalname || "");
    if (!ok) return cb(new Error("Formato no permitido"));
    cb(null, true);
  }
});

router.get("/:id/documentos",
  requireCapOrSelf("nomina:ver"), assertObjectId, listDocumentos);

router.post("/:id/documentos",
  requireCapOrSelf("nomina:editar"), assertObjectId, preloadEmpleado, uploadDoc.single("archivo"), createDocumento);

router.delete("/:id/documentos/:docId",
  requireCapOrSelf("nomina:editar"), assertObjectId, deleteDocumento);

/* ========== INCIDENCIAS ========== */
const storageInc = multer.diskStorage({
  destination: (req, file, cb) => {
    const emp = req.empleado;
    const legible = `${slugify(emp.apellido)}-${slugify(emp.nombre)}-${emp._id}`;
    const dir = path.join(process.cwd(), "uploads", "empleados", legible, "incidencias");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".pdf").toLowerCase();
    cb(null, `inc-${Date.now()}${ext}`);
  }
});
const uploadInc = multer({
  storage: storageInc,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(file.originalname || "");
    if (!ok) return cb(new Error("Formato no permitido"));
    cb(null, true);
  }
});

router.get("/:id/incidencias",
  requireCapOrSelf("nomina:ver"), assertObjectId, listIncidencias);

router.post("/:id/incidencias",
  requireCap("nomina:editar"), assertObjectId, preloadEmpleado, uploadInc.single("archivo"), createIncidencia);

router.delete("/:id/incidencias/:itemId",
  requireCap("nomina:editar"), assertObjectId, deleteIncidencia);

export default router;
