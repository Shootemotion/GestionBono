import Carrera from "../models/Carrera.model.js";
import Empleado from "../models/Empleado.model.js";

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

    // LOGICA DE SOLAPAMIENTO:
    // Si el nuevo puesto es "abierto" (sin fecha fin), revisamos otros abiertos para cerrarlos o ajustar este.
    if (!hasta) {
      const otrosAbiertos = await Carrera.find({ empleado: id, _id: { $ne: item._id }, hasta: null });

      for (const other of otrosAbiertos) {
        // Caso A: El otro es ANTERIOR a este nuevo (Promoción normal)
        // Cerramos el anterior con la fecha de inicio del nuevo.
        if (new Date(other.desde) < new Date(item.desde)) {
          await Carrera.findByIdAndUpdate(other._id, { hasta: item.desde });
        }
        // Caso B: El otro es POSTERIOR a este nuevo (Inserción histórica olvidada)
        // Cerramos ESTE nuevo registro con la fecha de inicio del posterior, para que no quede como "Actual".
        else {
          await Carrera.findByIdAndUpdate(item._id, { hasta: other.desde });
        }
      }
    }

    const populated = await Carrera.findById(item._id).populate("area", "nombre").populate("sector", "nombre");

    // Actualizar datos actuales del empleado si este puesto es REALMENTE el "vigente" 
    // (Asumimos que si estamos agregando algo es lo actual, o verificar por fecha)
    // Estrategia: Buscar el último por fecha 'desde' y actualizar el empleado con eso.
    const ultimo = await Carrera.findOne({ empleado: id }).sort({ desde: -1 });

    if (ultimo && String(ultimo._id) === String(item._id)) {
      await Empleado.findByIdAndUpdate(id, {
        puesto: ultimo.puesto,
        area: ultimo.area,
        sector: ultimo.sector,
        // No cambiamos fechaIngreso original
      });
    }

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
      desde: ultimo?.desde || null,
    });
  } catch (e) {
    next(e);
  }
}
