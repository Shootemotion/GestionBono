// backend/src/analytics/middleware/analyticsAuth.middleware.js
// Valida el token de acceso para la Analytics API.
// Power BI lo envía como header: X-Analytics-Token: <valor>

export function analyticsAuth(req, res, next) {
    const secret = process.env.ANALYTICS_SECRET;

    // Si no está configurado el secret, bloquear siempre
    if (!secret) {
        return res.status(503).json({
            error: "Analytics API no configurada. Definí ANALYTICS_SECRET en .env",
        });
    }

    const token =
        req.headers["x-analytics-token"] ||
        req.query.token; // alternativa: ?token=xxx (útil para pruebas en browser)

    if (!token || token !== secret) {
        return res.status(401).json({ error: "Token de analytics inválido o ausente." });
    }

    next();
}
