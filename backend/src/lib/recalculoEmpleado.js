// src/lib/recalculoEmpleado.js

import mongoose from "mongoose";
import Evaluacion from "../models/Evaluacion.model.js";
import Plantilla from "../models/Plantilla.model.js";

import {
  calculateAnnualObjectiveProgress,
  calculateGlobalPerformance,
} from "./scoringEngine.js";

const asId = (v) => (v ? String(v) : null);

/**
 * Heavy:
 * Recalcula TODO el año de un empleado:
 *  - metas → resultado anual por meta
 *  - objetivos → score por objetivo (0..100)
 *  - aptitudes → usa actual tal cual
 *  - global → mezcla objetivos / aptitudes (70/30 por defecto)
 *
 * params:
 *  - empleadoId (ObjectId o string)
 *  - year (fiscal, ej: 2025)
 *  - pesoObj / pesoApt (mezcla global, ej: 0.7 / 0.3)
 */
export async function recalcularAnualEmpleado({
  empleadoId,
  year,
  pesoObj = 0.7,
  pesoApt = 0.3,
}) {
  if (!empleadoId) {
    throw new Error("recalcularAnualEmpleado: falta empleadoId");
  }
  const anio = Number(year || new Date().getFullYear());

  // 1) Traemos TODAS las evaluaciones del año para el empleado
  const evals = await Evaluacion.find({
    empleado: new mongoose.Types.ObjectId(String(empleadoId)),
    year: anio,
  })
    .populate("plantillaId", "tipo nombre metas pesoBase")
    .lean();


  // 2) Agrupamos las evaluaciones por objetivo, con sus hitos.
  //
  // Acá vivía un bucle sobre `objetivosMap`, una variable que no existe: resto
  // de un refactor a medio hacer, con las notas del autor adentro. La ruta
  // /evaluaciones/empleados/:id/scoring-anual devolvía 500 —"objetivosMap is
  // not defined"— desde entonces. Lo encontró el chequeo de tipos.
  //
  // El agrupamiento real es el de abajo, que sí estaba escrito y funciona.

  // RE-IMPLEMENTATION OF LOGIC TO MATCH ENGINE INPUTS
  // We need to group evals by Plantilla.

  const plantillasMap = new Map();

  for (const ev of evals) {
    const tpl = ev.plantillaId || {};
    const tplId = asId(tpl._id) || asId(ev.plantillaId);

    if (!plantillasMap.has(tplId)) {
      plantillasMap.set(tplId, {
        def: {
          _id: tplId,
          nombre: tpl.nombre || ev.nombre,
          // We need the full meta definition for the engine!
          // `ev.plantillaId` populate might have it if it's the doc.
          // In populate("plantillaId", "tipo nombre metas pesoBase"), we have metas!
          metas: tpl.metas || [],
          tipo: tpl.tipo || "objetivo",
          pesoBase: Number(tpl.pesoBase ?? ev.pesoBase ?? 0),
        },
        hitos: []
      });
    }

    const pEntry = plantillasMap.get(tplId);

    // Add hito
    pEntry.hitos.push({
      periodo: ev.periodo,
      actual: ev.actual,
      metas: ev.metasResultados
    });
  }

  const objetivosResult = [];
  const aptitudesResult = [];

  for (const [tplId, { def, hitos }] of plantillasMap.entries()) {
    const peso = def.pesoBase; // Recalculo doesn't seem to handle overrides? The original code didn't load them!
    // NOTE: The original code in `recalculoEmpleado.js` did NOT load overrides.
    // It used `tpl.pesoBase`.
    // We will stick to that behavior to avoiding scope creep, strictly refactoring computation.

    if (def.tipo === "objetivo") {
      const { progreso, metasAnuales } = calculateAnnualObjectiveProgress(def.metas, hitos);

      objetivosResult.push({
        plantillaId: tplId,
        nombre: def.nombre,
        pesoBase: peso,
        peso, // Assuming no override
        actual: progreso, // Engine returns 'progreso' (0-100)
        metas: metasAnuales
      });
    } else {
      // Aptitud
      const puntuaciones = hitos.map(h => h.actual).filter(v => v !== null && v !== undefined);
      const puntuacion = puntuaciones.length
        ? Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length)
        : 0;

      aptitudesResult.push({
        evaluacionId: null, // mixed
        plantillaId: tplId,
        nombre: def.nombre,
        pesoBase: peso,
        peso,
        actual: puntuacion
      });
    }
  }

  // 3) Global: mezcla objetivos / aptitudes (70/30 por defecto)
  // Note: recalculoEmpleado doesn't seem to pass "latestFeedback" for snapshot.
  // The original code calculated strictly from components.
  // We will pass null for feedback to keep "Live Recalculation" behavior (ignoring snapshot for now, or should we?)
  // If the user wants "Real Data", they probably expect the Snapshot found in Dashboard.
  // But `recalculoEmpleado` is often used to "Fix" data.
  // Let's stick to strict calculation (null feedback) unless we want to fetch feedback here too.
  // Original `recalculoEmpleado` imported `calcularResultadoGlobalEmpleado` from `scoringGlobal.js`.
  // That function did NOT look at feedback snapshots.
  // So passing `null` preserves EXACT original behavior of this specific file.

  const resumen = calculateGlobalPerformance(
    objetivosResult,
    aptitudesResult,
    null, // No snapshot override in this script
    { obj: pesoObj, apt: pesoApt }
  );

  // Adapt return format to match previous output structure exactly if possible, 
  // or return the new cleaner structure.
  // Previous output: { objetivos: [{..., actual, metas: [...] }], aptitudes: [...], resumen: { objetivos, aptitudes, global } }
  // Our new structure is very similar.

  return {
    empleado: empleadoId,
    year: anio,
    objetivos: objetivosResult,
    aptitudes: aptitudesResult,
    resumen: {
      objetivos: resumen.scoreObj,
      aptitudes: resumen.scoreApt,
      global: resumen.scoreFinal
    },
    // evals,
  };
}
