// backend/src/middleware/auditoria.middleware.js
//
// Deja rastro de TODAS las escrituras sobre entidades sensibles.
//
// Se monta una sola vez en server.js, después de authenticateJWT y antes de
// los routers. Es preferible a repartir el middleware por cada archivo de
// rutas: un solo lugar que mantener y ninguna ruta que se olvide.
//
// Cómo funciona:
//   1. Si el método escribe y la ruta está en el mapa, busca el id del
//      documento en la URL y lee su estado ANTES del cambio. Ese snapshot es
//      lo que permite deshacer, no solo señalar culpables.
//   2. Se engancha a `res.on("finish")` y registra solo si la respuesta fue
//      2xx: los intentos rechazados por permisos no ensucian el log.
//
// Nunca hace fallar la operación: si auditar rompe, se loguea y la petición
// sigue. Perder una línea de auditoría es malo; perder el trabajo del usuario
// porque el logger falló, es peor.

import Auditoria from "../models/Auditoria.model.js";

const ACCION_POR_METODO = { POST: "CREAR", PUT: "EDITAR", PATCH: "EDITAR", DELETE: "ELIMINAR" };
const ES_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Primer segmento de la URL que parezca un ObjectId. */
function idDeLaRuta(ruta) {
  for (const seg of String(ruta).split("?")[0].split("/")) {
    if (ES_OBJECT_ID.test(seg)) return seg;
  }
  return null;
}

/**
 * Rutas que usan POST pero no escriben nada: consultas que necesitan mandar
 * un body. Auditarlas llenaba el log de líneas "CREAR" que no crearon nada
 * —`/impacto` llegó a aparecer como si fueran altas de objetivos— y hacía
 * más difícil encontrar los cambios de verdad.
 */
const RUTAS_SOLO_LECTURA = [/\/impacto$/, /\/preview$/, /\/previo$/, /\/simular$/];

/** Acción más precisa que el método, cuando la URL lo dice. */
function accionDeLaRuta(metodo, ruta) {
  if (RUTAS_SOLO_LECTURA.some((r) => r.test(String(ruta).split("?")[0]))) return null;
  if (/\/restaurar$/.test(ruta)) return "RESTAURAR";
  if (/\/versionar$/.test(ruta)) return "VERSIONAR";
  if (/aprobar/.test(ruta)) return "APROBAR";
  return ACCION_POR_METODO[metodo] || null;
}

/**
 * @param {Object} mapa  { "/api/templates": { entidad, modelo }, ... }
 */
export function auditarEscrituras(mapa) {
  const prefijos = Object.keys(mapa).sort((a, b) => b.length - a.length); // más específico primero

  return (req, res, next) => {
    const accion = accionDeLaRuta(req.method, req.originalUrl);
    if (!accion) return next(); // GET / HEAD / OPTIONS

    const prefijo = prefijos.find((p) => req.originalUrl.startsWith(p));
    if (!prefijo) return next();

    const { entidad, modelo } = mapa[prefijo];
    const id = idDeLaRuta(req.originalUrl);

    // En un alta la URL todavía no tiene id —el documento no existe— así que
    // `documentoId` quedaba en null y el registro no se podía atar a nada.
    // Eso fue lo que hizo imposible reconstruir de entrada qué objetivos
    // había creado cada persona durante el incidente del Área Técnica: había
    // 40 líneas de CREAR sin decir qué se había creado.
    // Se lo sacamos a la respuesta, que sí trae el documento recién guardado.
    let idCreado = null;
    if (!id) {
      const jsonOriginal = res.json.bind(res);
      res.json = (payload) => {
        const doc = Array.isArray(payload) ? payload[0] : payload;
        if (doc && typeof doc === "object" && doc._id) idCreado = String(doc._id);
        return jsonOriginal(payload);
      };
    }

    const registrar = (antes) => {
      res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        const u = req.user || {};
        const base = antes || req.body || {};
        Auditoria.create({
          usuarioId: u._id || null,
          email: u.email || "(sin usuario)",
          rol: u.rolEfectivo || u.rol || null,
          empleadoNombre: u.fullName || null,
          accion,
          entidad,
          documentoId: id || idCreado || null,
          resumen: resumirDoc(entidad, base),
          antes,
          cambios: accion === "ELIMINAR" ? null : req.body ?? null,
          metodo: req.method,
          ruta: req.originalUrl,
          statusCode: res.statusCode,
          ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
        }).catch((err) => console.error("[Auditoria] no se pudo registrar:", err.message));
      });
      next();
    };

    if (!id || !modelo) return registrar(null);

    modelo
      .findById(id)
      .setOptions({ incluirEliminadas: true })
      .lean()
      .then(registrar)
      .catch(() => registrar(null)); // id inválido: responde el controlador
  };
}

/** Texto legible para poder leer el log sin resolver ids a mano. */
function resumirDoc(entidad, doc) {
  if (!doc || typeof doc !== "object") return undefined;
  if (doc.nombre && doc.apellido) return `${entidad}: ${doc.apellido}, ${doc.nombre}`;
  if (doc.nombre) return doc.year ? `${entidad}: "${doc.nombre}" (AF ${doc.year})` : `${entidad}: "${doc.nombre}"`;
  if (doc.email) return `${entidad}: ${doc.email}`;
  return undefined;
}
