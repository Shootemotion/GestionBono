import Carrera from "../models/Carrera.model.js";

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
    const { puesto, area, sector, desde, hasta, motivo } = req.body;
    if (!puesto || !desde) return res.status(400).json({ message: "puesto y desde son requeridos" });
    const item = await Carrera.create({ empleado: id, puesto, area, sector, desde, hasta, motivo });
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

export async function deleteCarrera(req, res, next) {
  try {
    const { itemId } = req.params;
    const del = await Carrera.findByIdAndDelete(itemId);
    if (!del) return res.status(404).json({ message: "Registro no encontrado" });
    res.sendStatus(204);
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
    });
  } catch (e) {
    next(e);
  }
}
