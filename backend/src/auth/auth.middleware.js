// backend/auth/auth.middleware.js
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../models/Usuario.model.js";
import Area from "../models/Area.model.js";
import Sector from "../models/Sector.model.js";

/**
 * Capabilities por rol (base).
 */
const roleCaps = {
  superadmin: ["*"],
  
  rrhh: [
    "estructura:ver","estructura:crear","estructura:editar","estructura:eliminar",
    "nomina:ver","nomina:crear","nomina:editar","nomina:eliminar","nomina:evaluar",
    "objetivos:ver","objetivos:crear","objetivos:editar","objetivos:eliminar",
    "aptitudes:ver","aptitudes:crear","aptitudes:editar","aptitudes:eliminar",
    "asignaciones:ver","asignaciones:editar", "rrhh:evaluaciones:ver",
    "rrhh:evaluaciones:cierre",
    "rrhh:evaluaciones:reabrir",
    "usuarios:manage"
  ],
  jefe_area: [
    "estructura:ver","nomina:ver","nomina:editar","nomina:evaluar",
    "objetivos:ver","objetivos:editar",
    "aptitudes:ver","aptitudes:editar",
    "asignaciones:ver","asignaciones:editar",
  ],
  jefe_sector: [
    "estructura:ver","nomina:ver","nomina:evaluar",
    "objetivos:ver","nomina:editar",
    "aptitudes:ver",
    "asignaciones:ver","asignaciones:editar",
  ],
  directivo: [
    "estructura:ver","estructura:crear","estructura:editar","estructura:eliminar",
    "nomina:ver","nomina:crear","nomina:editar","nomina:eliminar","nomina:evaluar",
    "objetivos:ver","objetivos:crear","objetivos:editar","objetivos:eliminar",
    "aptitudes:ver","aptitudes:crear","aptitudes:editar","aptitudes:eliminar",
    "asignaciones:ver","asignaciones:editar", "rrhh:evaluaciones:ver",
    "rrhh:evaluaciones:cierre",
    "rrhh:evaluaciones:reabrir",
    "usuarios:manage"

  ],
  visor: ["estructura:ver","nomina:ver","aptitudes:ver"],
};

const arrayUnion = (a = [], b = []) =>
  Array.from(new Set([...(a || []), ...(b || [])]));

/** Helper: construye un nombre legible */
function buildFullName(userDoc) {
  const apellido = userDoc?.empleado?.apellido || userDoc?.apellido || "";
  const nombre = userDoc?.empleado?.nombre || userDoc?.nombre || "";
  if (!apellido && !nombre) return null;
  if (apellido && nombre) return `${apellido}, ${nombre}`;
  return apellido || nombre;
}

export const authenticateJWT = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      const userDoc = await Usuario.findById(payload.sub)
        .populate({
          path: "empleado",
          populate: [{ path: "area" }, { path: "sector" }]
        });

      if (!userDoc || !userDoc.activo) {
        return res.status(401).json({ message: "Usuario inválido o inactivo" });
      }

      const rol = userDoc.rol;
      let permisos = arrayUnion(roleCaps[rol] || [], userDoc.permisos || []);

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
          "nomina:ver","nomina:evaluar","nomina:editar","nomina:crear",
          "objetivos:ver","objetivos:editar",
          "aptitudes:ver","aptitudes:editar",
        ]);
      }

      // 🔹 Rol efectivo (no encajonar en visor)
      let rolEfectivo = rol;
      if (rol === "visor") {
        if (referenteAreas.length > 0) rolEfectivo = "jefe_area";
        else if (referenteSectors.length > 0) rolEfectivo = "jefe_sector";
      }

      req.user = {
        _id: String(userDoc._id),
        email: userDoc.email,
        rol,
        rolEfectivo,
        permisos,

        // 🔗 vínculo completo con el empleado
        empleado: userDoc.empleado ? {
          _id: String(userDoc.empleado._id),
          nombre: userDoc.empleado.nombre,
          apellido: userDoc.empleado.apellido,
          puesto: userDoc.empleado.puesto,
          fotoUrl: userDoc.empleado.fotoUrl,
          area: userDoc.empleado.area,
          sector: userDoc.empleado.sector,
        } : null,

        empleadoId,
        areaId,
        sectorId,
        fullName: buildFullName(userDoc),
        isSuper: rol === "superadmin",
        isRRHH: rol === "rrhh",
        isDirectivo: rol === "directivo",
        isJefeArea: rolEfectivo === "jefe_area",
        isJefeSector: rolEfectivo === "jefe_sector",
        referenteAreas,
        referenteSectors
      };

      return next();
    }

    // Anónimo → visor
    req.user = {
      _id: "anon",
      email: null,
      rol: "visor",
      rolEfectivo: "visor",
      permisos: roleCaps.visor,
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
  if (u.permisos?.includes("*") || u.permisos?.includes(cap)) return next();
  return res.status(403).json({ message: "No autorizado", needed: cap });
};

export const requireRole = (...roles) => (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });
  if (u.isSuper) return next();
  if (roles.includes(u.rolEfectivo || u.rol)) return next();
  return res.status(403).json({ message: "No autorizado", needed: roles.join(", ") });
};

export const whoami = (req, res) => {
  res.json(req.user || { _id: "anon", rol: "visor", permisos: [] });
};
