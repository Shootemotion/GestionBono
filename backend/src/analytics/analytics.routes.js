// backend/src/analytics/analytics.routes.js
import { Router } from "express";
import { analyticsAuth } from "./middleware/analyticsAuth.middleware.js";

import { analyticsEmpleados } from "./controllers/empleados.analytics.js";
import { analyticsEvaluaciones } from "./controllers/evaluaciones.analytics.js";
import { analyticsFeedback } from "./controllers/feedback.analytics.js";
import { analyticsBonos } from "./controllers/bonos.analytics.js";
import { analyticsPlantillas } from "./controllers/plantillas.analytics.js";
import { analyticsISO } from "./controllers/iso.analytics.js";
import { analyticsAreas } from "./controllers/areas.analytics.js";
import { analyticsSectores } from "./controllers/sectores.analytics.js";
import { analyticsUsuarios } from "./controllers/usuarios.analytics.js";

const router = Router();

// Todas las rutas de analytics requieren el token
router.use(analyticsAuth);

// ─── Endpoints ────────────────────────────────────────────────────────────────
router.get("/empleados", analyticsEmpleados);
router.get("/evaluaciones", analyticsEvaluaciones);
router.get("/feedback", analyticsFeedback);
router.get("/bonos", analyticsBonos);
router.get("/plantillas", analyticsPlantillas);
router.get("/iso", analyticsISO);
router.get("/areas", analyticsAreas);
router.get("/sectores", analyticsSectores);
router.get("/usuarios", analyticsUsuarios);

// Health check (también requiere token)
router.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "Analytics API is running",
        endpoints: [
            "GET /api/analytics/empleados",
            "GET /api/analytics/evaluaciones",
            "GET /api/analytics/feedback",
            "GET /api/analytics/bonos",
            "GET /api/analytics/plantillas",
            "GET /api/analytics/iso",
            "GET /api/analytics/areas",
            "GET /api/analytics/sectores",
            "GET /api/analytics/usuarios",
        ],
    });
});

export default router;
