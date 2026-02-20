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


  // 2) Convertimos los objetivosMap en una lista “bonita” con cálculo anual
  const objetivosList = [];

  for (const [, grupo] of objetivosMap.entries()) {

    // 🔹 Score Calculation Refactor (Unified Engine)
    // Construct "hitos" array from metasMap for the engine
    // The engine expects hitos array like [{ periodo: 'Q1', metas: [{ nombre: 'M1', resultado: 10 }] }]
    // But here we have the transposed data (meta -> registros).
    // We can adapt `calculateAnnualObjectiveProgress` OR we can adapt our data.
    // Since `calculateAnnualObjectiveProgress` expects { metasDefinition, hitos }, let's reconstruct hitos?
    // In recalculoEmpleado, we already iterated evaluations. We could have built `hitos` array directly.

    // Alternative: We can use the lower level `calcularResultadoMeta` if we want, OR we can refactor `recalculoEmpleado` 
    // to just iterate evals and group them into hitos FIRST.

    // Let's refactor the loop above to group by (Plantilla + Periodo) instead of just Plantilla.
    // That matches `dashboard.controller.js` structure better and allows using the engine.

    // ... wait, rewriting the whole file is safer to match the engine pattern.
    // The current file groups by Plantilla then Meta.
    // The Engine expects Plantilla -> Hitos (Periodos).

    // Let's RE-WRITE the group logic below to be compatible.

  }

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
