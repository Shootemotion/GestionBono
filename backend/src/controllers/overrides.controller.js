// backend/src/controllers/overrides.controller.js
//
// El override es el ÚNICO objeto por empleado: es donde vive el peso que se
// le asigna a cada objetivo. Cambiarlo cambia la nota final de esa persona,
// así que se trata con el mismo cuidado que la plantilla misma.

import OverrideObjetivo from "../models/OverrideObjetivo.model.js";
import Empleado from "../models/Empleado.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import { bloqueoPorAnioCerrado } from "../lib/plantillaGuards.js";
import { anioFiscalCerrado } from "../lib/fiscalYear.js";

export const upsertOverride = async (req, res) => {
  try {
    const { empleado, year, template, excluido, peso, meta, notas } = req.body;

    // Un año cerrado tiene las notas comunicadas: cambiar un peso ahí las
    // mueve para atrás. RRHH y dirección pueden; el resto no.
    const bloqueo = bloqueoPorAnioCerrado(year, req.user);
    if (bloqueo) {
      return res.status(403).json({ success: false, motivo: "anio_cerrado", message: bloqueo });
    }

    // VALIDATION: Check for cross-sector/area assignment
    // Only check if we are activating/assigning (not forcing exclusion)
    if (!excluido) {
      const emp = await Empleado.findById(empleado);
      const tpl = await Plantilla.findById(template);

      if (emp && tpl) {
        // Excepción al bloqueo cruzado: si la persona YA tiene resultados
        // cargados de ese objetivo, es que en su momento le correspondía.
        //
        // Sin esta excepción, mover a alguien de sector dejaba sus pesos
        // viejos imposibles de recrear por pantalla —quedaban bloqueados por
        // "otro sector"— y había que escribirlos a mano en la base. Fue lo
        // que pasó al reparar los 29 pesos del 22/09.
        const tuvoDatos = await Evaluacion.exists({
          empleado,
          plantillaId: template,
          metasResultados: { $elemMatch: { resultado: { $nin: [null, undefined, ""] } } },
        });

        if (!tuvoDatos && !anioFiscalCerrado(year)) {
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
    // Se lee antes de borrar para saber de qué año es. Además el middleware
    // de auditoría guarda ese estado previo, así que el borrado individual
    // sí se puede deshacer —a diferencia del `deleteMany` por cambio de
    // sector, que no dejaba rastro de nada.
    const ov = await OverrideObjetivo.findById(req.params.id).lean();
    if (!ov) return res.json({ success: true }); // ya no estaba: nada que hacer

    const bloqueo = bloqueoPorAnioCerrado(ov.year, req.user);
    if (bloqueo) {
      return res.status(403).json({ success: false, motivo: "anio_cerrado", message: bloqueo });
    }

    await OverrideObjetivo.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
