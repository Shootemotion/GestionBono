// src/routes/evaluacion.routes.js
import { Router } from "express";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";
import { revisionEvaluaciones } from "../controllers/revisionEvaluaciones.controller.js";
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
  listarPreviasAlIngreso,        // GET    /evaluaciones/previas-ingreso
  borrarPreviasAlIngreso,        // DELETE /evaluaciones/previas-ingreso/:empleadoId
  closeBulk,                     // POST /evaluaciones/hr/close-bulk
  getScoringAnualEmpleado,
  recalculateEvaluaciones,       // POST /evaluaciones/recalculate
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

// Recalcular Evaluaciones (Sync)
router.post(
  "/recalculate",
  authenticateJWT,
  requireCap("nomina:evaluar"),
  recalculateEvaluaciones
);

// Listado flexible por query
router.get(
  "/",
  authenticateJWT,
  requireCap("nomina:ver"),
  listEvaluaciones
);

// Resultados cargados en períodos anteriores al ingreso de la persona.
// Es solo lectura: señala, no toca nada.
router.get(
  "/previas-ingreso",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:ver"),
  listarPreviasAlIngreso
);

// Vista previa: qué se borraría de esta persona. No toca nada.
//
// Revisión de los resultados cargados: períodos fuera del calendario, metas
// huérfanas, cargas previas al ingreso, duplicados. Lectura pura.
router.get(
  "/revision",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:ver"),
  revisionEvaluaciones
);

// Va como GET y no como DELETE sin confirmar, porque el auditor registra toda
// escritura: con el método DELETE, cada vez que alguien abría la vista previa
// quedaba una línea "ELIMINAR" en la auditoría por un borrado que no ocurrió.
router.get(
  "/previas-ingreso/:empleadoId",
  authenticateJWT,
  requireCap("objetivos:eliminar"),
  borrarPreviasAlIngreso
);

// 🔒 El borrado de verdad. Cada evaluación queda auditada con su contenido.
router.delete(
  "/previas-ingreso/:empleadoId",
  authenticateJWT,
  requireCap("objetivos:eliminar"),
  borrarPreviasAlIngreso
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

router.get(
  "/empleados/:empleadoId/scoring-anual",
  authenticateJWT,
  requireCap("rrhh:evaluaciones:cierre"),
  getScoringAnualEmpleado
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

// testing
import { deleteEvaluacion } from "../controllers/evaluacion.controller.js";
// 🔒 Borrar una evaluación destruye un resultado cargado y puede mover una nota
//    ya comunicada. Antes lo podía hacer cualquiera con sesión iniciada.
router.delete("/:id", authenticateJWT, requireCap("objetivos:eliminar"), deleteEvaluacion);

export default router;
