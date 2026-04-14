// backend/src/analytics/middleware/analyticsAuth.middleware.js
// Valida el token de acceso para la Analytics API.
// Power BI lo envía como header: X-Analytics-Token: <valor>

export function analyticsAuth(req, res, next) {
    // Si no lo encuentra en .env, usa nuestra clave por defecto de PowerBI
    const secret = process.env.ANALYTICS_SECRET || "diagnos_analytics_2025_powerbi";
    const token =
        req.headers["x-analytics-token"] ||
        req.query.token; // alternativa: ?token=xxx (útil para pruebas en browser)
    if (!token || token !== secret) {
        return res.status(401).json({ error: "Token de analytics inválido o ausente." });
    }
    next();
}