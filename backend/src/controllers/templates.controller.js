// src/controllers/templates.controller.js
import Plantilla from "../models/Plantilla.model.js";

export const createTemplate = async (req, res) => {
  try {
    const tpl = await Plantilla.create(req.body);
    res.json(tpl);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const listTemplates = async (req, res) => {
  try {
    const { year, scopeType, scopeId, tipo, activo } = req.query;
    const q = {};
    if (year) q.year = Number(year);
    if (scopeType) q.scopeType = scopeType;
    if (scopeId) q.scopeId = scopeId;
    if (tipo) q.tipo = tipo;
    if (activo !== undefined) q.activo = activo === "true";

    const data = await Plantilla.find(q).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const tpl = await Plantilla.findByIdAndUpdate(id, req.body, { new: true });
    res.json(tpl);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await Plantilla.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
