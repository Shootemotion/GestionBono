// backend/src/controllers/auditoria.controller.js
//
// Consulta del registro de cambios. Solo lectura: nadie edita ni borra
// auditoría desde la API — si se pudiera, no serviría como auditoría.

import Auditoria from "../models/Auditoria.model.js";

/**
 * GET /api/auditoria
 * Filtros: entidad, accion, email, desde, hasta, q (texto libre sobre el resumen)
 * Paginado: page, limit
 * Tiempo real: `desde` con la marca del último registro visto devuelve solo lo nuevo.
 */
export async function listAuditoria(req, res) {
  try {
    const { entidad, accion, email, desde, hasta, q, page = 1, limit = 50 } = req.query;

    const filtro = {};
    if (entidad) filtro.entidad = entidad;
    if (accion) filtro.accion = accion;
    const escapar = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (email) filtro.email = new RegExp(escapar(email), "i");
    if (q) {
      const rx = new RegExp(escapar(q), "i");
      filtro.$or = [{ resumen: rx }, { email: rx }, { ruta: rx }];
    }
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gt = new Date(desde);
      if (hasta) filtro.createdAt.$lte = new Date(hasta);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));

    const [items, total] = await Promise.all([
      Auditoria.find(filtro)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        // `antes` puede ser un documento grande: no viaja en el listado.
        .select("-antes -cambios")
        .lean(),
      Auditoria.countDocuments(filtro),
    ]);

    res.json({ items, total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error("listAuditoria error:", err);
    res.status(500).json({ message: "Error consultando la auditoría" });
  }
}

/** GET /api/auditoria/:id — el registro completo, con el estado previo. */
export async function getAuditoria(req, res) {
  try {
    const reg = await Auditoria.findById(req.params.id).lean();
    if (!reg) return res.status(404).json({ message: "Registro no encontrado" });
    res.json(reg);
  } catch (err) {
    console.error("getAuditoria error:", err);
    res.status(500).json({ message: "Error consultando el registro" });
  }
}

/** GET /api/auditoria/resumen — números para el encabezado del panel. */
export async function resumenAuditoria(req, res) {
  try {
    const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const desde7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, ultimas24h, ultimos7d, porAccion, porEntidad, top, ultimo] = await Promise.all([
      Auditoria.countDocuments({}),
      Auditoria.countDocuments({ createdAt: { $gte: desde24h } }),
      Auditoria.countDocuments({ createdAt: { $gte: desde7d } }),
      Auditoria.aggregate([{ $group: { _id: "$accion", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Auditoria.aggregate([{ $group: { _id: "$entidad", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Auditoria.aggregate([
        { $match: { createdAt: { $gte: desde7d } } },
        { $group: { _id: "$email", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
      ]),
      Auditoria.findOne({}).sort({ createdAt: -1 }).select("createdAt").lean(),
    ]);

    res.json({
      total,
      ultimas24h,
      ultimos7d,
      porAccion,
      porEntidad,
      masActivos: top,
      ultimoRegistro: ultimo?.createdAt ?? null,
    });
  } catch (err) {
    console.error("resumenAuditoria error:", err);
    res.status(500).json({ message: "Error calculando el resumen" });
  }
}
