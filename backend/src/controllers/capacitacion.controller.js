import Capacitacion from "../models/Capacitacion.model.js";

export async function listCapacitaciones(req, res, next) {
  try {
    const { id } = req.params; // empleadoId
    const items = await Capacitacion.find({ empleado: id })
      .sort({ fecha: -1 })
      .lean();
    res.json(items);
  } catch (e) { next(e); }
}

export async function createCapacitacion(req, res, next) {
  try {
    const { id } = req.params; // empleadoId
    const { nombre, proveedor, horas, fecha, vence, fechaVto, estado, lugar } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ message: "nombre y fecha son requeridos" });

    const base = { empleado: id, nombre, proveedor, horas, fecha, vence, fechaVto, estado, lugar };
    const isHR = req.user?.permisos?.includes("nomina:editar") || req.user?.rol === "admin" || req.user?.rol === "director";

    // Si no es RRHH/Admin, forzamos que quede en PENDIENTE sin importar lo que mande el frontend
    if (!isHR) {
      base.estado = "PENDIENTE";
    } else {
      // Si RRHH no manda estado, puede entrar como COMPLETO o VERIFICADO (por defecto el frontend manda COMPLETO actualmente)
      base.estado = estado || "VERIFICADO";
    }

    if (req.file) {
      // normalizar ruta a /uploads/...
      const abs = String(req.file.path).replaceAll("\\", "/");
      const i = abs.lastIndexOf("/uploads/");
      base.certificadoUrl = (i >= 0 ? abs.substring(i) : `/uploads/${req.file.filename}`).replace(/^\/+/, "");
    }

    const item = await Capacitacion.create(base);
    res.status(201).json(item);
  } catch (e) { next(e); }
}

export async function updateCapacitacion(req, res, next) {
  try {
    const { itemId } = req.params;
    const isHR = req.user?.permisos?.includes("nomina:editar") || req.user?.rol === "admin" || req.user?.rol === "director";

    // Buscar el original para ver si el empleado tiene permiso de editarlo
    const original = await Capacitacion.findById(itemId);
    if (!original) return res.status(404).json({ message: "Registro no encontrado" });

    if (!isHR && original.estado !== "PENDIENTE") {
      return res.status(403).json({ message: "Solo podés editar capacitaciones que estén pendientes de aprobación." });
    }

    const updates = { ...req.body };

    if (!isHR) {
      if (original.estado === "POR_REALIZAR") {
        // El empleado está completando una asignación (subiendo certificado)
        updates.estado = "PENDIENTE";
      } else {
        // Es un upload suyo que edita
        updates.estado = "PENDIENTE";
      }
    }

    if (req.file) {
      const abs = String(req.file.path).replaceAll("\\", "/");
      const i = abs.lastIndexOf("/uploads/");
      updates.certificadoUrl = (i >= 0 ? abs.substring(i) : `/uploads/${req.file.filename}`).replace(/^\/+/, "");
    }
    const updated = await Capacitacion.findByIdAndUpdate(itemId, updates, { new: true });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function deleteCapacitacion(req, res, next) {
  try {
    const { itemId } = req.params;
    const isHR = req.user?.permisos?.includes("nomina:editar") || req.user?.rol === "admin" || req.user?.rol === "director";

    const original = await Capacitacion.findById(itemId);
    if (!original) return res.status(404).json({ message: "Registro no encontrado" });

    if (!isHR && original.estado !== "PENDIENTE") {
      return res.status(403).json({ message: "No podés eliminar una capacitación que ya fue procesada por RRHH." });
    }

    await Capacitacion.findByIdAndDelete(itemId);
    res.sendStatus(204);
  } catch (e) { next(e); }
}

export async function getCapacitacionesResumen(req, res, next) {
  try {
    const { id } = req.params;
    const items = await Capacitacion.find({ empleado: id }).lean();

    // TOTAL = Sólo las capacitaciones validadas (COMPLETO o VERIFICADO)
    const validStates = ["COMPLETO", "VERIFICADO"];
    const validItems = items.filter(c => validStates.includes(c.estado));
    const total = validItems.length;

    // PENDIENTES = PENDIENTE, EN_PROGRESO
    const pendingStates = ["PENDIENTE", "EN_PROGRESO"];
    const totalPendientes = items.filter(c => pendingStates.includes(c.estado)).length;

    // POR REALIZAR = POR_REALIZAR
    const totalPorRealizar = items.filter(c => c.estado === "POR_REALIZAR").length;

    // Vencen en 30 días
    const today = new Date();
    const limit = new Date();
    limit.setDate(today.getDate() + 30);

    const vencen30 = items.filter(c => {
      if (!c.vence || !c.fechaVto) return false;
      const d = new Date(c.fechaVto);
      return d >= today && d <= limit;
    }).length;

    res.json({ total, totalPendientes, totalPorRealizar, vencen30 });
  } catch (e) { next(e); }
}
