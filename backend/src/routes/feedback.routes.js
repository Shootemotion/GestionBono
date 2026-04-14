import { Router } from "express";
import { 
    getFeedbacksByEmpleado, 
    saveFeedback, 
    getPendingFeedbacks, 
    closeFeedbacksBulk, 
    deleteFeedback, 
    getPendingNotifications, 
    reopenFeedback, 
    reopenFeedbacksBulk,
    auditScores,
    fixScores
} from "../controllers/feedback.controller.js";
import { authenticateJWT, requireCap } from "../auth/auth.middleware.js";

const router = Router();

router.use(authenticateJWT);

router.get("/notifications", getPendingNotifications);
router.get("/empleado/:empleadoId", getFeedbacksByEmpleado);
router.post("/", saveFeedback);

// Rutas para RRHH
router.get("/hr/pending", getPendingFeedbacks);
router.post("/hr/close-bulk", closeFeedbacksBulk);
router.put("/hr/reopen-bulk", reopenFeedbacksBulk);
router.put("/:id/reopen", reopenFeedback);

// Rutas de Auditoria (solo Superadmin)
router.get("/admin/audit-scores", requireCap("admin"), auditScores);
router.post("/admin/fix-scores", requireCap("admin"), fixScores);

// testing
router.delete("/:id", deleteFeedback);

export default router;
