// backend/src/analytics/analytics.routes.js
// Router principal de la Analytics API.
// Montado en /api/analytics desde el servidor principal.

import { Router } from "express";
import { analyticsAuth } from "./middleware/analyticsAuth.middleware.js";
import { analyticsEmpleados } from "./controllers/empleados.analytics.js";
import { analyticsEvaluaciones } from "./controllers/evaluaciones.analytics.js";
import { analyticsFeedback } from "./controllers/feedback.analytics.js";
import { analyticsBonos } from "./controllers/bonos.analytics.js";
import { analyticsPlantillas } from "./controllers/plantillas.analytics.js";

const router = Router();

// Todas las rutas de analytics requieren el token
router.use(analyticsAuth);

// ─── Endpoints ────────────────────────────────────────────────────────────────
router.get("/empleados", analyticsEmpleados);
router.get("/evaluaciones", analyticsEvaluaciones);
router.get("/feedback", analyticsFeedback);
router.get("/bonos", analyticsBonos);
router.get("/plantillas", analyticsPlantillas);

// Health check (también requiere token)
router.get("/", (req, res) => {
    res.json({
        status: "ok",
        endpoints: [
            "GET /api/analytics/empleados",
            "GET /api/analytics/evaluaciones",
            "GET /api/analytics/feedback",
            "GET /api/analytics/bonos",
            "GET /api/analytics/plantillas",
        ],
    });
});

export default router;
