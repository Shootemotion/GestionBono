// backend/auth/auth.middleware.js
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../models/Usuario.model.js";
import Role from "../models/Role.model.js"; // Import Role model
import Area from "../models/Area.model.js";
import Sector from "../models/Sector.model.js";

const arrayUnion = (a = [], b = []) =>
  Array.from(new Set([...(a || []), ...(b || [])]));

// Match cap con soporte de wildcard (ej: "nomina:*" matchea "nomina:editar")
export const matchCap = (perms, cap) =>
  Array.isArray(perms) && perms.some(p =>
    p === '*' ||
    p === cap ||
    (typeof p === 'string' && p.endsWith(':*') && cap.startsWith(p.slice(0, -2)))
  );

/** Helper: construye un nombre legible */
function buildFullName(userDoc) {
  const apellido = userDoc?.empleado?.apellido || userDoc?.apellido || "";
  const nombre = userDoc?.empleado?.nombre || userDoc?.nombre || "";
  if (!apellido && !nombre) return null;
  if (apellido && nombre) return `${apellido}, ${nombre}`;
  return apellido || nombre;
}

const userCache = new Map(); // cache simple en memoria
const CACHE_TTL = 15 * 1000; // 15 segundos (reduce tiempo de stale para permisos)

// Permite invalidar la caché de un usuario por su userId (llamado al actualizar isCalidad, rol, etc)
export function invalidateUserCacheByUserId(userId) {
  const uid = String(userId);
  for (const [token, cached] of userCache.entries()) {
    if (String(cached?.user?._id) === uid || String(cached?.user?.userId) === uid) {
      userCache.delete(token);
    }
  }
}

export const authenticateJWT = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (token) {
      // 1. Revisar caché
      const now = Date.now();
      if (userCache.has(token)) {
        const cached = userCache.get(token);
        if (now < cached.expiry) {
          req.user = cached.user;
          return next();
        } else {
          userCache.delete(token);
        }
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);

      const userDoc = await Usuario.findById(payload.sub)
        .populate({
          path: "empleado",
          populate: [{ path: "area" }, { path: "sector" }]
        });

      if (!userDoc || !userDoc.activo) {
        return res.status(401).json({ message: "Usuario inválido o inactivo" });
      }

      const rolSlug = userDoc.rol;

      // 🔹 Fetch Permissions from DB (vs hardcoded)
      let rolePerms = [];
      try {
        const roleDoc = await Role.findOne({ slug: rolSlug }).select('permissions').lean();
        if (roleDoc) {
          rolePerms = roleDoc.permissions;
        } else {
          console.warn(`⚠️ Role '${rolSlug}' not found in DB for user ${userDoc.email}. Permissions may be missing.`);
        }
      } catch (err) {
        console.error("Error fetching permissions from DB:", err);
      }

      let permisos = arrayUnion(rolePerms, userDoc.permisos || []);

      // ids en string o null
      const empleadoId = userDoc.empleado?._id ? String(userDoc.empleado._id) : null;
      const areaId = userDoc.empleado?.area?._id ? String(userDoc.empleado.area._id)
        : userDoc.empleado?.area ? String(userDoc.empleado.area) : null;
      const sectorId = userDoc.empleado?.sector?._id ? String(userDoc.empleado.sector._id)
        : userDoc.empleado?.sector ? String(userDoc.empleado.sector) : null;

      // Calcular referentes (castear a ObjectId siempre)
      let referenteAreas = [];
      let referenteSectors = [];
      if (empleadoId) {
        try {
          const empObjId = new mongoose.Types.ObjectId(empleadoId);

          const ares = await Area.find({ referentes: empObjId }, "_id").lean();
          const secs = await Sector.find({ referentes: empObjId }, "_id").lean();

          referenteAreas = (ares || []).map(a => String(a._id));
          referenteSectors = (secs || []).map(s => String(s._id));
        } catch (err) {
          console.error("Error fetching referentes for user:", err);
        }
      }

      // 🔹 Extender permisos si es referente
      if (referenteAreas.length > 0 || referenteSectors.length > 0) {
        permisos = arrayUnion(permisos, [
          "nomina:ver", "nomina:evaluar", "nomina:editar", "nomina:crear",
          "objetivos:ver", "objetivos:editar",
          "aptitudes:ver", "aptitudes:editar",
        ]);
      }

      // 🔹 Rol efectivo (no encajonar en visor)
      let rolEfectivo = rolSlug;
      if (rolSlug === "visor") {
        if (referenteAreas.length > 0) rolEfectivo = "jefe_area";
        else if (referenteSectors.length > 0) rolEfectivo = "jefe_sector";
      }

      req.user = {
        _id: String(userDoc._id),
        email: userDoc.email,
        rol: rolSlug,
        rolEfectivo,
        permisos,

        // 🔗 vínculo completo con el empleado
        empleado: userDoc.empleado ? {
          _id: String(userDoc.empleado._id),
          nombre: userDoc.empleado.nombre,
          apellido: userDoc.empleado.apellido,
          apodo: userDoc.empleado.apodo,
          puesto: userDoc.empleado.puesto,
          fotoUrl: userDoc.empleado.fotoUrl,
          area: userDoc.empleado.area,
          sector: userDoc.empleado.sector,
        } : null,

        empleadoId,
        areaId,
        sectorId,
        fullName: buildFullName(userDoc),
        isSuper: rolSlug === "superadmin",
        isCalidad: userDoc.isCalidad || false,
        isRRHH: rolSlug === "rrhh",
        isDirectivo: rolSlug === "directivo",
        isJefeArea: rolEfectivo === "jefe_area" || referenteAreas.length > 0,
        isJefeSector: rolEfectivo === "jefe_sector" || referenteSectors.length > 0,
        referenteAreas,
        referenteSectors
      };

      // Guardar en caché
      userCache.set(token, { user: req.user, expiry: Date.now() + CACHE_TTL });

      return next();
    }

    // Anónimo → visor (Read from DB 'visor' role if possible, or fallback minimal)
    // NOTE: For anonymity we might want to spare a DB call and just give 0 permissions or minimal
    // For now, let's keep it safe: basic view perms if strict. Or we could fetch 'visor' from DB too.
    // To safe DB performace, hardcode fallback for anon or empty array.
    req.user = {
      _id: "anon",
      email: null,
      rol: "visor",
      rolEfectivo: "visor",
      permisos: [], // Anon user gets no special permissions by default now
      empleadoId: null,
      areaId: null,
      sectorId: null,
      fullName: null,
      isSuper: false,
      isRRHH: false,
      isDirectivo: false,
      isJefeArea: false,
      isJefeSector: false,
      referenteAreas: [],
      referenteSectors: []
    };
    return next();
  } catch (err) {
    console.error("authenticateJWT error:", err.message || err);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export const requireCap = (cap) => (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });
  if (u.isSuper) return next();
  if (matchCap(u.permisos, cap)) return next();
  return res.status(403).json({ message: "No autorizado", needed: cap });
};

export const requireRole = (...roles) => (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });
  if (u.isSuper) return next();
  if (roles.includes(u.rolEfectivo || u.rol)) return next();
  return res.status(403).json({ message: "No autorizado", needed: roles.join(", ") });
};

export const requireCapOrSelf = (cap) => (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });
  if (u.isSuper) return next();
  if (matchCap(u.permisos, cap)) return next();

  // Check Self
  if (req.params.id && u.empleadoId === req.params.id) return next();

  return res.status(403).json({ message: "No autorizado", needed: cap });
};

export const whoami = async (req, res) => {
  const u = req.user;
  if (!u) return res.json({ _id: "anon", rol: "visor", permisos: [] });

  // 🎭 Soporte para Enmascaramiento (Impersonation)
  // Si soy superadmin y pido un empleadoId, buscamos ESE perfil para devolverlo al front
  if (u.isSuper && req.query.empleadoId) {
    try {
      const targetUserId = req.query.empleadoId;
      const targetUserDoc = await Usuario.findOne({ empleado: targetUserId })
        .populate({
          path: "empleado",
          populate: [{ path: "area" }, { path: "sector" }]
        });

      if (targetUserDoc) {
        // Construimos el objeto req.user para el target (casi igual a authenticateJWT)
        const rolSlug = targetUserDoc.rol;
        let rolePerms = [];
        const roleDoc = await Role.findOne({ slug: rolSlug }).select('permissions').lean();
        if (roleDoc) rolePerms = roleDoc.permissions;

        const arrayUnion = (a = [], b = []) => Array.from(new Set([...(a || []), ...(b || [])]));
        let permisos = arrayUnion(rolePerms, targetUserDoc.permisos || []);

        // Referente areas/sectores del target (para isJefeArea/Sector)
        let referenteAreas = [];
        let referenteSectors = [];
        if (targetUserDoc.empleado?._id) {
          try {
            const empObjId = new mongoose.Types.ObjectId(String(targetUserDoc.empleado._id));
            const ares = await Area.find({ referentes: empObjId }, "_id").lean();
            const secs = await Sector.find({ referentes: empObjId }, "_id").lean();
            referenteAreas = (ares || []).map(a => String(a._id));
            referenteSectors = (secs || []).map(s => String(s._id));
          } catch (err) {
            console.error("Error fetching referentes en impersonation:", err);
          }
        }

        if (referenteAreas.length > 0 || referenteSectors.length > 0) {
          permisos = arrayUnion(permisos, [
            "nomina:ver", "nomina:evaluar", "nomina:editar", "nomina:crear",
            "objetivos:ver", "objetivos:editar",
            "aptitudes:ver", "aptitudes:editar",
          ]);
        }

        let rolEfectivo = rolSlug;
        if (rolSlug === "visor") {
          if (referenteAreas.length > 0) rolEfectivo = "jefe_area";
          else if (referenteSectors.length > 0) rolEfectivo = "jefe_sector";
        }

        return res.json({
          _id: String(targetUserDoc._id),
          email: targetUserDoc.email,
          rol: rolSlug,
          rolEfectivo,
          permisos,
          empleado: targetUserDoc.empleado ? {
            _id: String(targetUserDoc.empleado._id),
            nombre: targetUserDoc.empleado.nombre,
            apellido: targetUserDoc.empleado.apellido,
            apodo: targetUserDoc.empleado.apodo,
            puesto: targetUserDoc.empleado.puesto,
            fotoUrl: targetUserDoc.empleado.fotoUrl,
            area: targetUserDoc.empleado.area,
            sector: targetUserDoc.empleado.sector,
          } : null,
          empleadoId: String(targetUserDoc.empleado?._id || ""),
          fullName: buildFullName(targetUserDoc),
          isSuper: rolSlug === "superadmin",
          isCalidad: targetUserDoc.isCalidad || false,
          isRRHH: rolSlug === "rrhh",
          isDirectivo: rolSlug === "directivo",
          isJefeArea: rolEfectivo === "jefe_area" || referenteAreas.length > 0,
          isJefeSector: rolEfectivo === "jefe_sector" || referenteSectors.length > 0,
          referenteAreas,
          referenteSectors,
        });
      }
    } catch (err) {
      console.error("Error en whoami impersonation:", err);
    }
  }

  res.json(u);
};
