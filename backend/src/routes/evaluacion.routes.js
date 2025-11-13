// src/routes/evaluacion.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import {
  // EXISTENTES
  getEvaluacionesEmpleado,
  updateHitoMultiple,
  updateHito,

  // NUEVOS
  listEvaluaciones,              // GET /evaluaciones?empleado=&year=&plantillaId=&periodo=
  getEvaluacionById,             // GET /evaluaciones/detalle/:id
  patchEvaluacion,               // PATCH /evaluaciones/:id (solo MANAGER_DRAFT)
  submitToEmployee,              // POST /evaluaciones/:id/submit-to-employee
  employeeAck,                   // POST /evaluaciones/:id/employee-ack
  employeeContest,               // POST /evaluaciones/:id/employee-contest
  submitToHR,                    // POST /evaluaciones/:id/submit-to-hr
  closeEvaluacion,               // POST /evaluaciones/:id/close
  reopenEvaluacion,              // POST /evaluaciones/:id/reopen
  createEvaluacion,              // POST /evaluaciones
  listPendingHR,                 // GET  /evaluaciones/hr/pending
  closeBulk,                     // POST /evaluaciones/hr/close-bulk
} from "../controllers/evaluacion.controller.js";

const router = Router();

/* ================== NUEVOS (primero los específicos) ================== */

// Detalle por ID
router.get(
  "/detalle/:id",
  authenticateJWT,
  requireCap("nomina:ver"),
  getEvaluacionById
);

// Listado flexible por query
router.get(
  "/",
  authenticateJWT,
  requireCap("nomina:ver"),
  listEvaluaciones
);

// *** RRHH: ver pendientes y cerrar en lote ***
router.get(
  "/hr/pending",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:ver"),   // asegúrate de mapearlo al rol rrhh
  listPendingHR
);

router.post(
  "/hr/close-bulk",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:cierre"),
  closeBulk
);

// Editar contenido SOLO si está en MANAGER_DRAFT
router.patch(
  "/:id",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  patchEvaluacion
);

// Acciones de flujo
router.post(
  "/:id/submit-to-employee",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  submitToEmployee
);

router.post("/:id/employee-ack", authenticateJWT, employeeAck);
router.post("/:id/employee-contest", authenticateJWT, employeeContest);

router.post(
  "/:id/submit-to-hr",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  submitToHR
);

router.post(
  "/:id/close",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:cierre"),
  closeEvaluacion
);

router.post(
  "/:id/reopen",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:reabrir"),
  reopenEvaluacion
);

// Crear evaluación
router.post(
  "/",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  createEvaluacion
);

/* ================== EXISTENTES (dejan al final) ================== */

router.put("/:empleadoId/:plantillaId/:periodo", updateHito);

router.put(
  "/hitos",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  updateHitoMultiple
);

router.get(
  "/:empleadoId/:year",
  authenticateJWT,
  requireCap("nomina:ver"),
  getEvaluacionesEmpleado
);

export default router;
