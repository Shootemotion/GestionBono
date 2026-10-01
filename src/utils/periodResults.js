// src/utils/periodResults.js
//
// Motor de resultados por período que VE EL EMPLEADO en Mi Desempeño.
// Extraído tal cual del hook useDesempenoData para que la página de validación
// use EXACTAMENTE la misma lógica (misma calculadora, mismos parámetros).
//
// No cambia el comportamiento: es una extracción pura.

import {
  calculateObjectiveProgress,
  calculateWeightedScore,
  calculateCompetencyProgress,
} from "@/utils/calculos";

/**
 * Traduce un string de período (Q1/Q2/Q3/FINAL o 2025Q1 / 2025M03 / 2025S1)
 * a un índice de mes fiscal (1..12) para filtrar hitos cronológicamente.
 */
export function getPeriodMonth(periodStr) {
  if (!periodStr) return 0;
  if (periodStr === "Q1") return 3;
  if (periodStr === "Q2") return 6;
  if (periodStr === "Q3") return 9;
  if (periodStr === "FINAL") return 12;

  let suffix = periodStr;
  if (periodStr.length > 4 && !isNaN(periodStr.slice(0, 4))) {
    suffix = periodStr.slice(4);
  }

  if (suffix.startsWith("M")) {
    const m = parseInt(suffix.slice(1));
    return m >= 9 ? m - 8 : m + 4;
  }
  if (suffix.startsWith("Q")) {
    const q = parseInt(suffix.slice(1));
    return q * 3;
  }
  if (suffix.startsWith("S")) {
    const s = parseInt(suffix.slice(1));
    return s * 6;
  }
  if (suffix === "FINAL" || suffix.endsWith("FINAL")) return 12;
  return 12;
}

/**
 * Primer año fiscal con el techo unificado.
 *
 * Hasta el AF 2025/26 inclusive, la tarjeta de objetivos mostraba TRES
 * denominadores distintos: el score sobre 70, la etiqueta "Esperado" sobre
 * `expectedScores` y la barra sobre `maxScores` (que solo cuenta objetivos con
 * hitos cargados). En 65 de 76 empleados esos dos últimos no coincidían.
 *
 * A partir del AF 2026/27 la barra y la etiqueta usan la MISMA escala.
 * Los años anteriores se calculan exactamente igual que antes, a propósito:
 * son los que se están informando y no se tocan.
 */
export const AF_TECHO_UNIFICADO = 2026;

/**
 * Calcula los resultados de un período para un empleado.
 * @param {Object} data   - dashboard del empleado (objetivos[], aptitudes[])
 * @param {String} periodo - "Q1" | "Q2" | "Q3" | "FINAL"
 * @param {Number} [anioFiscal] - año fiscal consultado. Decide si aplica el
 *   techo unificado. Sin este dato se asume comportamiento anterior.
 * @returns {Object} { objetivos, aptitudes, scores, maxScores, expectedScores,
 *   desglose, escala, usaTechoUnificado, sparklineData }
 */
export function computePeriodResults(data, periodo, anioFiscal) {
  if (!data || !periodo) {
    return { objetivos: [], aptitudes: [], scores: { obj: 0, comp: 0, global: 0 } };
  }
  const usaTechoUnificado = Number(anioFiscal) >= AF_TECHO_UNIFICADO;
  const p = periodo;

  const feedbackLimit = getPeriodMonth(p);
  /** El último feedback del año ya no es seguimiento: es el cierre. */
  const esCierre = feedbackLimit === 12 || p === "FINAL";

  let totalObjScore = 0;
  let totalObjWeight = 0;
  let maxActiveObjWeight = 0;
  const timeFraction = Math.min(feedbackLimit / 12, 1);
  const objetivos = [];

  data.objetivos?.forEach((obj) => {
    const relevantHitos = obj.hitos?.filter((h) => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
    let score = 0;

    const hitoPeriodo = obj.hitos?.find((h) => {
      if (!h.periodo) return false;
      if (h.periodo === p) return true;
      if (h.periodo.endsWith(p)) return true;
      if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
      return false;
    });

    if (relevantHitos.length > 0) {
      // En el FINAL se aplica la regla de cierre, no la de seguimiento.
      //
      // Durante el año esta pantalla acompaña el avance: si la meta pide 12
      // períodos y van 3 cumplidos de 3 transcurridos, muestra el progreso
      // sobre lo pedido. Pero el último feedback ya no es seguimiento: es la
      // nota, y tiene que calcularse con la regla que el jefe configuró.
      //
      // Sin esto la pantalla decía una cosa y el feedback otra: a Guido
      // Barretto le mostraba 88,9 mientras su feedback guardaba 76,1.
      score = calculateObjectiveProgress(obj, relevantHitos, esCierre);
      maxActiveObjWeight += obj.peso || 0;
    }

    const effectiveScore = score;
    totalObjScore += effectiveScore * (obj.peso || 0);
    totalObjWeight += obj.peso || 0;

    objetivos.push({
      ...obj,
      hitoActual: hitoPeriodo,
      scorePeriodo: effectiveScore,
      rawScore: score,
    });
  });

  const scoreObjRaw = totalObjWeight > 0 ? totalObjScore / totalObjWeight : 0;
  const scoreObj = scoreObjRaw * 0.7;

  const aptitudes = [];
  data.aptitudes?.forEach((apt) => {
    const relevantHitos = apt.hitos?.filter((h) => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
    let score = 0;
    const puntuaciones = relevantHitos.map((h) => h.actual).filter((v) => v !== null && v !== undefined);
    if (puntuaciones.length > 0) {
      score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
    }
    const hitoPeriodo = apt.hitos?.find((h) => h.periodo === p);
    aptitudes.push({ ...apt, hitoActual: hitoPeriodo, scorePeriodo: score });
  });

  const scoreCompRaw = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, feedbackLimit);
  const scoreComp = scoreCompRaw * 0.3;

  const global = scoreObj + scoreComp;

  const displayObj = scoreObj;
  const displayComp = scoreComp;
  const displayGlobal = global;

  const maxObj = (maxActiveObjWeight / 100) * 70;
  const maxComp = aptitudes.length > 0 ? 30 : 0;

  // Escala del período: cuánto del año ya está "en juego" a esta altura.
  //   · Objetivo de mantenimiento (por período): cuenta con todo su peso desde
  //     el primer día, porque hay que sostenerlo todo el año.
  //   · Objetivo acumulativo: cuenta proporcional al tiempo transcurrido,
  //     porque todavía no terminó de acumularse.
  let expectedObjScore = 0;
  const desglose = [];
  data.objetivos?.forEach((obj, i) => {
    const isCumulative = obj.metas?.some((m) => m.acumulativa || m.modoAcumulacion === "acumulativo");
    const factor = isCumulative ? timeFraction : 1;
    const peso = obj.peso || 0;
    const pesoEnJuego = peso * factor;
    expectedObjScore += pesoEnJuego;

    // Lo que este objetivo aporta hoy al score de objetivos (sobre 70).
    const scoreObjetivo = objetivos[i]?.scorePeriodo ?? 0;
    const tieneDatos = (obj.hitos || []).some(
      (h) => getPeriodMonth(h.periodo) <= feedbackLimit
    );

    desglose.push({
      _id: obj._id,
      nombre: obj.nombre,
      tipo: isCumulative ? "acumulativo" : "mantenimiento",
      peso,
      factor,
      pesoEnJuego,
      score: scoreObjetivo,
      // Aporte al puntaje de objetivos (0..70), con la misma ponderación que usa scoreObj
      aporte: totalObjWeight > 0 ? (scoreObjetivo * peso) / totalObjWeight * 0.7 : 0,
      tieneDatos,
    });
  });

  const expectedObjDisplay = (expectedObjScore / 100) * 70;
  const expectedCompDisplay = aptitudes.length > 0 ? 30 : 0;

  // Cuántos objetivos todavía no tienen ninguna carga en este período: es la
  // causa más frecuente de que dos personas vean escalas distintas.
  const sinDatos = desglose.filter((d) => !d.tieneDatos).length;
  const acumulativos = desglose.filter((d) => d.tipo === "acumulativo").length;


  return {
    objetivos,
    aptitudes,
    scores: {
      obj: displayObj,
      comp: displayComp,
      global: displayGlobal,
    },
    maxScores: {
      obj: maxObj,
      comp: maxComp,
      global: maxObj + maxComp,
    },
    expectedScores: {
      obj: expectedObjDisplay,
      comp: expectedCompDisplay,
      global: expectedObjDisplay + expectedCompDisplay,
    },

    // Aditivo: no cambia ningún número existente, solo permite mostrarlos.
    usaTechoUnificado,
    desglose,
    escala: {
      // Qué porcentaje del año ya se puede medir, y por qué.
      porcentajeDelAnio: expectedObjScore,
      objetivosSinDatos: sinDatos,
      objetivosAcumulativos: acumulativos,
      objetivosTotales: desglose.length,
      tieneCompetencias: aptitudes.length > 0,
      // Denominador que debe usar la barra de objetivos.
      techoObj: usaTechoUnificado ? expectedObjDisplay : maxObj,
    },
    sparklineData: (() => {
      const timeline = ["Q1", "Q2", "Q3", "FINAL"];
      return timeline.map((tPeriod) => {
        const relevantLimit = getPeriodMonth(tPeriod);

        let tObjScore = 0;
        data.objetivos?.forEach((o) => {
          const rh = o.hitos?.filter((h) => getPeriodMonth(h.periodo) <= relevantLimit) || [];
          if (rh.length > 0) {
            const prog = calculateObjectiveProgress(o, rh);
            tObjScore += calculateWeightedScore(prog, o.peso || 0);
          }
        });

        const rawComp = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, relevantLimit);

        return {
          name: tPeriod === "FINAL" ? "Fin" : tPeriod,
          obj: tObjScore * 0.7,
          comp: rawComp * 0.3,
          global: tObjScore * 0.7 + rawComp * 0.3,
        };
      });
    })(),
  };
}
