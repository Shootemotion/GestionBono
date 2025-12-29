// src/controllers/plantilla.controller.js
import Plantilla from "../models/Plantilla.model.js";

export async function createPlantilla(req, res) {
  try {
    const body = req.body;

const nueva = await Plantilla.create({
  ...body,
  fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
  metas: body.metas || [],

});


    res.status(201).json(nueva);
  } catch (err) {
    console.error("createPlantilla error:", err);
    res.status(500).json({ message: "Error creando plantilla" });
  }
}

export async function updatePlantilla(req, res) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updated = await Plantilla.findByIdAndUpdate(
      id,
      {
        ...body,
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        metas: body.metas || [], // 👈 acepta metas en update
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    res.json(updated);
  } catch (err) {
    console.error("updatePlantilla error:", err);
    res.status(500).json({ message: "Error actualizando plantilla" });
  }
}

export async function listPlantillas(req, res) {
  try {
    const { year, scopeType, scopeId, tipoFiltro } = req.query;
    const query = {};

    if (year) query.year = Number(year);
    if (scopeType) query.scopeType = scopeType;
    if (scopeId) query.scopeId = scopeId;
    if (tipoFiltro === "activas") {
      query.activo = true;
    } else if (tipoFiltro === "inactivas") {
      query.activo = false;
    } else if (tipoFiltro === "todos" || tipoFiltro === "all") {
      // No filtrar por activo (traer todo)
    } else {
      // Default: Solo activas (protección seguridad)
      query.activo = true;
    }

    const list = await Plantilla.find(query).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error("listPlantillas error:", err);
    res.status(500).json({ message: "Error listando plantillas" });
  }
}


export async function getPlantillaById(req, res) {
  try {
    const { id } = req.params;
    const tpl = await Plantilla.findById(id);
    if (!tpl) return res.status(404).json({ message: "Plantilla no encontrada" });
    res.json(tpl);
  } catch (err) {
    console.error("getPlantillaById error:", err);
    res.status(500).json({ message: "Error obteniendo plantilla" });
  }
}

export async function deletePlantilla(req, res) {
  try {
    const { id } = req.params;
    const deleted = await Plantilla.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Plantilla no encontrada" });
    res.sendStatus(204);
  } catch (err) {
    console.error("deletePlantilla error:", err);
    res.status(500).json({ message: "Error eliminando plantilla" });
  }
}
