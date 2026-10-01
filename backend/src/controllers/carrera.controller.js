import Carrera from "../models/Carrera.model.js";
import Empleado from "../models/Empleado.model.js";
import fs from "fs";
import path from "path";

export async function listCarrera(req, res, next) {
  try {
    const { id } = req.params; // empleadoId
    const items = await Carrera.find({ empleado: id })
      .populate("area", "nombre")
      .populate("sector", "nombre")
      .sort({ desde: -1 })
      .lean();
    res.json(items);
  } catch (e) { next(e); }

}

export async function createCarrera(req, res, next) {
  try {
    const { id } = req.params; // empleadoId
    const { puesto, area, sector, desde, hasta, motivo, principal } = req.body;
    if (!puesto || !desde) return res.status(400).json({ message: "puesto y desde son requeridos" });

    // Los puestos pueden ser SIMULTÁNEOS: no cerramos automáticamente los otros vigentes.
    // El cierre (fecha 'hasta') se hace manualmente cuando corresponde.
    const item = await Carrera.create({ empleado: id, puesto, area, sector, desde, hasta, motivo });

    // ¿Debe ser el puesto PRINCIPAL?
    // - Si viene marcado explícitamente, o
    // - Si es el primer/único registro de carrera del empleado (arranque).
    const totalCount = await Carrera.countDocuments({ empleado: id });
    const shouldBePrincipal = !!principal || totalCount === 1;

    if (shouldBePrincipal) {
      // Solo puede haber un principal: desmarcamos los demás y marcamos este.
      await Carrera.updateMany({ empleado: id, _id: { $ne: item._id } }, { $set: { principal: false } });
      item.principal = true;
      await item.save();

      // El principal define area/sector/puesto del empleado (no tocamos fechaIngreso).
      await Empleado.findByIdAndUpdate(id, {
        puesto: item.puesto,
        area: item.area,
        sector: item.sector,
      });
    }

    const populated = await Carrera.findById(item._id).populate("area", "nombre").populate("sector", "nombre");
    res.status(201).json(populated);
  } catch (e) { next(e); }
}

export async function updateCarrera(req, res, next) {
  try {
    const { itemId } = req.params;
    const updated = await Carrera.findByIdAndUpdate(itemId, req.body, { new: true })
      .populate("area", "nombre")
      .populate("sector", "nombre");
    if (!updated) return res.status(404).json({ message: "Registro no encontrado" });
    res.json(updated);
  } catch (e) { next(e); }
}

// PATCH /:id/carrera/:itemId/principal
// Marca un puesto como principal (define area/sector/puesto del empleado) y desmarca los demás.
export async function setPrincipalCarrera(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const item = await Carrera.findById(itemId);
    if (!item) return res.status(404).json({ message: "Registro no encontrado" });

    await Carrera.updateMany({ empleado: id, _id: { $ne: itemId } }, { $set: { principal: false } });
    item.principal = true;
    await item.save();

    await Empleado.findByIdAndUpdate(id, {
      puesto: item.puesto,
      area: item.area,
      sector: item.sector,
    });

    const populated = await Carrera.findById(itemId).populate("area", "nombre").populate("sector", "nombre");
    res.json(populated);
  } catch (e) { next(e); }
}

export async function deleteCarrera(req, res, next) {
  try {
    const { itemId } = req.params;
    const del = await Carrera.findByIdAndDelete(itemId);
    if (!del) return res.status(404).json({ message: "Registro no encontrado" });
    res.sendStatus(204);
  } catch (e) { next(e); }
}

// POST /:id/carrera/:itemId/perfil  (multipart/form-data, campo "archivo")
// Adjunta o reemplaza el perfil de puesto firmado de un registro de carrera.
export async function uploadPerfilPuesto(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!req.file) return res.status(400).json({ message: "No se subió archivo." });

    const item = await Carrera.findById(itemId);
    if (!item) return res.status(404).json({ message: "Registro no encontrado" });

    // Si ya había un perfil, borramos el archivo físico anterior
    if (item.perfilPuestoUrl) {
      const prev = path.resolve(item.perfilPuestoUrl);
      if (fs.existsSync(prev)) {
        try { fs.unlinkSync(prev); } catch { /* noop */ }
      }
    }

    // Normalizar ruta a "uploads/..."
    const abs = String(req.file.path).replaceAll("\\", "/");
    const i = abs.lastIndexOf("/uploads/");
    const relative = i >= 0 ? abs.substring(i) : `/uploads/${req.file.filename}`;

    item.perfilPuestoUrl = relative.replace(/^\/+/, "");
    item.perfilPuestoNombre = req.file.originalname || null;
    item.perfilPuestoSubidoEl = new Date();
    await item.save();

    const populated = await Carrera.findById(item._id)
      .populate("area", "nombre")
      .populate("sector", "nombre");
    res.json(populated);
  } catch (e) { next(e); }
}

// DELETE /:id/carrera/:itemId/perfil
// Elimina el perfil de puesto firmado adjunto (archivo + referencia).
export async function deletePerfilPuesto(req, res, next) {
  try {
    const { itemId } = req.params;
    const item = await Carrera.findById(itemId);
    if (!item) return res.status(404).json({ message: "Registro no encontrado" });

    if (item.perfilPuestoUrl) {
      const p = path.resolve(item.perfilPuestoUrl);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* noop */ }
      }
    }

    item.perfilPuestoUrl = null;
    item.perfilPuestoNombre = null;
    item.perfilPuestoSubidoEl = null;
    await item.save();

    const populated = await Carrera.findById(item._id)
      .populate("area", "nombre")
      .populate("sector", "nombre");
    res.json(populated);
  } catch (e) { next(e); }
}

export async function getCarreraResumen(req, res, next) {
  try {
    const { id } = req.params;
    // Buscamos el último puesto (ordenado por fecha 'desde' descendente)
    const ultimo = await Carrera.findOne({ empleado: id }).sort({ desde: -1 });
    // Si no hay, devolvemos null o string vacía
    res.json({
      ultimoPuesto: ultimo?.puesto || null,
      desde: ultimo?.desde || null,
    });
  } catch (e) {
    next(e);
  }
}
