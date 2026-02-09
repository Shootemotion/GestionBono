import OverrideObjetivo from "../models/OverrideObjetivo.model.js";
import Empleado from "../models/Empleado.model.js";
import Plantilla from "../models/Plantilla.model.js";

export const upsertOverride = async (req, res) => {
  try {
    const { empleado, year, template, excluido, peso, meta, notas } = req.body;

    // VALIDATION: Check for cross-sector/area assignment
    // Only check if we are activating/assigning (not forcing exclusion)
    if (!excluido) {
      const emp = await Empleado.findById(empleado);
      const tpl = await Plantilla.findById(template);

      if (emp && tpl) {
        if (tpl.scopeType === 'sector' && String(tpl.scopeId) !== String(emp.sector)) {
          return res.status(400).json({
            success: false,
            message: `⚠️ Bloqueo de seguridad: No podés asignar la plantilla "${tpl.nombre}" a ${emp.nombre} ${emp.apellido} porque pertenece a otro Sector.`
          });
        }
        if (tpl.scopeType === 'area' && String(tpl.scopeId) !== String(emp.area)) {
          return res.status(400).json({
            success: false,
            message: `⚠️ Bloqueo de seguridad: No podés asignar la plantilla "${tpl.nombre}" a ${emp.nombre} ${emp.apellido} porque pertenece a otra Área.`
          });
        }
      }
    }

    const doc = await OverrideObjetivo.findOneAndUpdate(
      { empleado, year, template },
      { $set: { excluido: !!excluido, peso: peso ?? null, meta: meta ?? null, notas } },
      { new: true, upsert: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const listOverrides = async (req, res) => {
  try {
    const { empleado, year } = req.query;
    const q = {};
    if (empleado) q.empleado = empleado;
    if (year) q.year = Number(year);
    const data = await OverrideObjetivo.find(q).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteOverride = async (req, res) => {
  try {
    await OverrideObjetivo.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
