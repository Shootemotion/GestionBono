// backend/src/lib/scoringCore.ts
//
//  Escrito en TypeScript, que Node 24 ejecuta borrando los tipos al vuelo: no
//  hay compilación ni archivo generado, y el .ts es lo que corre. Los tipos
//  del dominio viven en tipos.ts.
//
//  Los tipos no cambian el comportamiento: este archivo calcula exactamente
//  lo mismo que la versión anterior, y el test golden lo verifica contra los
//  casos reales.
//
// ============================================================================
//  MOTOR DE CÁLCULO UNIFICADO — FUENTE ÚNICA DE VERDAD
// ============================================================================
//  Lo usan:
//    - Backend (dashboard, evaluación, simulación, recálculo) vía calculoMetas.js
//    - Frontend: src/utils/calculos.js re-exporta este archivo (Vite lo bundlea)
//
//  Semántica acordada (ver tests golden en backend/src/lib/__tests__):
//    · Meta binaria "Cumple/No Cumple": cada período vale 100 (cumple) o 0.
//    · Meta acumulativa: suma todos los resultados y compara el total vs esperado.
//    · reglaCierre: promedio | cierre_unico | umbral_periodos.
//    · umbral + permiteOver: interpola linealmente de 100% a maxOver.
//    · isFinalYearClosure=false (seguimiento) fuerza reconoceEsfuerzo=true.
// ============================================================================

import type {
  Meta, Hito, Objetivo, Aptitud, ConfigDeCalculo, EsCierreAnual,
} from "./tipos.ts";

export type { Meta, Hito, Objetivo, Aptitud, ConfigDeCalculo, EsCierreAnual };

// === HELPERS ===
/** Convierte a número lo que venga: strings con coma, booleanos, vacíos. */
const val = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "string") {
    const parsed = Number(v.replace(",", "."));
    return isNaN(parsed) ? 0 : parsed;
  }
  return isNaN(Number(v)) ? 0 : Number(v);
};

const getPeriodCode = (pStr?: string): number => {
  if (!pStr) return 0;
  if (pStr === "Q1") return 3;
  if (pStr === "Q2") return 6;
  if (pStr === "Q3") return 9;
  if (pStr === "FINAL") return 12;
  const suffix = pStr.replace(/^\d{4}/, "");
  if (suffix.startsWith("M")) {
    const m = parseInt(suffix.slice(1));
    return m >= 9 ? m - 8 : m + 4;
  }
  if (suffix.startsWith("Q")) return parseInt(suffix.slice(1)) * 3;
  if (suffix.startsWith("S")) return parseInt(suffix.slice(1)) * 6;
  return 12;
};

const esBinaria = (metaDef?: Meta): boolean =>
  String(metaDef?.unidad || "").toLowerCase().includes("cumple");

// ¿El valor cumple el objetivo? (pass/fail puro, sin reconocer esfuerzo)
const cumpleTarget = (
  actual: unknown,
  target: unknown,
  operador: string = ">=",
  tolerancia: unknown = 0
): boolean => {
  const act = val(actual), tgt = val(target), tol = val(tolerancia);
  const op = operador || ">=";
  if (op === ">=") return act >= tgt - tol;
  if (op === ">") return act > tgt - tol;
  if (op === "<=") return act <= tgt + tol;
  if (op === "<") return act < tgt + tol;
  if (op === "=" || op === "==" || op === "===") return Math.abs(act - tgt) <= tol;
  return false;
};

// === CORE: score de UN período (numérico) ===
export const calculatePeriodCompliance = (
  actual: unknown,
  target: unknown,
  config: ConfigDeCalculo = {}
): number | null => {
  if (actual === null || actual === undefined) return null;

  const tgt = val(target);
  const act = val(actual);
  const op = config.operador || ">=";
  const passed = cumpleTarget(act, tgt, op, config.tolerancia);

  let rawPct: number = 0;
  if (tgt === 0) {
    rawPct = passed ? 100 : 0;
  } else if (op === ">=" || op === ">") {
    rawPct = (act / tgt) * 100;
  } else if (op === "=" || op === "==" || op === "===") {
    // Igualdad: avance proporcional hacia el objetivo (40 de 100 = 40%).
    //
    // Antes caía en el `else`, que es la fórmula de MINIMIZAR (tgt/act), y el
    // resultado quedaba invertido: cuanto MENOS se cargaba, más alto daba
    // —40 sobre 100 devolvía 250%— y el tope de 100% lo escondía. Una meta de
    // "% de avance == 100" mostraba 100% de logro con cualquier valor cargado.
    rawPct = (act / tgt) * 100;
  } else {
    const safeAct = act === 0 ? 0.0001 : act;
    rawPct = (tgt / safeAct) * 100;
  }

  let effectiveScore = config.reconoceEsfuerzo ? rawPct : (passed ? 100 : 0);

  const maxOver = config.permiteOver ? (val(config.maxOver) || 120) : 100;
  // Clamp a [0, maxOver]: nunca negativo (defensivo ante datos cargados inválidos) ni sobre el tope.
  effectiveScore = Math.max(0, Math.min(effectiveScore, maxOver));

  return effectiveScore;
};

// === Agregación por umbral de períodos (compartida binaria/numérica) ===
/**
 * Primer año fiscal con las reglas corregidas.
 *
 * Misma convención que `AF_TECHO_UNIFICADO` en src/utils/periodResults.js: un
 * cambio de regla rige desde un año y los anteriores se calculan exactamente
 * igual que antes, a propósito. El AF2025 se está informando —hay notas ya
 * comunicadas y feedbacks cerrados— y no se toca.
 */
export const AF_REGLAS_CORREGIDAS = 2026;

/** Año fiscal al que pertenecen unos hitos, leído de sus períodos ("2025Q1" → 2025). */
function anioDeHitos(hitos?: Hito[]): number | null {
  for (const h of hitos || []) {
    const m = /^(\d{4})/.exec(String(h?.periodo || ""));
    if (m) return Number(m[1]);
  }
  return null; // sin período reconocible: se asume año en curso
}

function scoreUmbral(
  cumples: boolean[],
  effectiveReconoce: boolean | undefined,
  metaDef: Meta,
  reglasCorregidas: boolean = true
): number {
  // cumples: array de booleanos (uno por período evaluado)
  const evaluatedCount = cumples.length;
  const passedCount = cumples.filter(Boolean).length;
  const required = metaDef.umbralPeriodos || evaluatedCount;

  if (passedCount >= required) {
    // Alcanzó el umbral. Con permiteOver interpola 100 -> maxOver por períodos extra.
    if (metaDef.permiteOver && required > 0 && evaluatedCount > required) {
      const maxOver = val(metaDef.maxOver) || 120;
      const extra = passedCount - required;
      const gap = evaluatedCount - required;
      return Math.min(100 + (extra / gap) * (maxOver - 100), maxOver);
    }
    return 100;
  }
  // No alcanzó el umbral.
  //
  // Con esfuerzo reconocido: proporción de lo pedido, no de lo cargado.
  if (effectiveReconoce && required > 0) return (passedCount / required) * 100;

  // Todo o nada: no alcanzó el umbral, no suma. Punto.
  //
  // La rama de abajo premiaba los datos incompletos: si el umbral pedía 12
  // períodos y solo había 6 cargados —todos cumplidos— devolvía 6/6 = 100%.
  // Verónica Oyarzo tenía 6 de 12 meses cargados y el cierre le daba 100 en esa
  // meta, mientras que a Guido, con los 12 cargados y uno fallado, le daba 0.
  // Cargar menos puntuaba mejor que cargar todo.
  if (reglasCorregidas) return 0;

  // AF2025 y anteriores: se conserva el comportamiento con el que se calcularon
  // e informaron esas notas.
  if (evaluatedCount > 0) return evaluatedCount >= required ? 0 : (passedCount / evaluatedCount) * 100;
  return 0;
}

// === CORE: score ANUAL de una meta (agrega los períodos según reglaCierre) ===
export const calculateMetaScore = (
  metaDef: Meta,
  hitos: Hito[],
  isFinalYearClosure: EsCierreAnual = false
): number => {
  const metaId = metaDef.metaId || metaDef._id;

  // Se respeta SIEMPRE lo que configuró el jefe.
  //
  // Antes esto era `isFinalYearClosure ? metaDef.reconoceEsfuerzo : true`: durante
  // el año ignoraba la configuración y forzaba "reconocer esfuerzo", y recién al
  // cerrar la respetaba. Con 83 de 236 metas configuradas "todo o nada", eso hacía
  // que la nota SALTARA el último día.
  //
  // El caso que lo mostró: Guido Barretto cumplió la meta de WhatsApp en 11 de los
  // 12 meses que exigía. Vio 91,7% en esa meta durante todo el año y al cierre le
  // quedó 0, porque la meta pide los 12. Su pantalla decía 88,9 y su feedback 76,1.
  //
  // Ahora lo que la persona ve, lo que el jefe evalúa y lo que se guarda son el
  // mismo número desde el primer mes. Si un objetivo tiene que reconocer esfuerzo,
  // se prende el flag y vale desde el día uno — para la pantalla y para la nota.
  //
  // `reconoceEsfuerzo` es una regla DEL CIERRE, no del seguimiento.
  //
  // Durante el año el seguimiento muestra avance sobre lo pedido —en el mes 1
  // de una meta de 12 períodos, cumplir 1 da 8,3%— y eso es lo correcto: la
  // pantalla acompaña el año, no lo juzga. La configuración del jefe (todo o
  // nada, o esfuerzo parcial) se aplica recién al cerrar.
  //
  // Lo intenté al revés —respetar el flag siempre— y rompía el seguimiento:
  // alguien que cumplía TODOS los meses transcurridos veía 0 hasta diciembre.
  //
  // Lo que sí estaba mal no era esto, sino que la pantalla del FINAL mostrara
  // el seguimiento en vez del cierre. Eso se arregla en quien llama, pasando
  // `isFinalYearClosure` cuando el período es el de cierre.
  const effectiveReconoce = isFinalYearClosure ? metaDef.reconoceEsfuerzo : true;

  // El arreglo de los datos incompletos sí rige desde el AF2026 (ver
  // AF_REGLAS_CORREGIDAS): antes, cerrar con 6 de 12 períodos cargados daba 100%.
  const anio = anioDeHitos(hitos);
  const reglasCorregidas = anio === null || anio >= AF_REGLAS_CORREGIDAS;
  const binaria = esBinaria(metaDef);
  const acumulativo = metaDef.acumulativa || metaDef.modoAcumulacion === "acumulativo";
  const rule = metaDef.reglaCierre || "promedio";

  const config = {
    reconoceEsfuerzo: effectiveReconoce,
    tolerancia: metaDef.tolerancia,
    permiteOver: metaDef.permiteOver,
    operador: metaDef.operador,
    maxOver: metaDef.maxOver,
  };

  // Extraer resultados crudos de esta meta desde los hitos
  const results: { periodo?: string; order: number; actual: unknown }[] = hitos
    .map((h) => {
      const mRes = h.metas?.find((m) => String(m.metaId || m._id) === String(metaId));
      return { periodo: h.periodo, order: getPeriodCode(h.periodo), actual: mRes ? mRes.resultado : null };
    })
    .filter((r) => r.actual !== null && r.actual !== undefined && r.actual !== "")
    .sort((a, b) => a.order - b.order);

  if (results.length === 0) return 0;

  const esperado = metaDef.esperado ?? metaDef.target;

  // ===================== META BINARIA (Cumple/No Cumple) =====================
  if (binaria) {
    const cumpleP = (v) => !!v && val(v) !== 0;

    if (acumulativo) {
      // Cuenta de "cumple" acumulados vs esperado (numérico)
      const totalCumple = results.reduce((s, r) => s + (cumpleP(r.actual) ? 1 : 0), 0);
      return calculatePeriodCompliance(totalCumple, esperado, config);
    }
    if (rule === "cierre_unico" || rule === "ultimo_valor") {
      return cumpleP(results[results.length - 1].actual) ? 100 : 0;
    }
    if (rule === "umbral_periodos" || rule === "umbral_Periodos") {
      return scoreUmbral(results.map((r) => cumpleP(r.actual)), effectiveReconoce, metaDef, reglasCorregidas);
    }
    // promedio → % de períodos cumplidos
    const perScore = results.map((r) => (cumpleP(r.actual) ? 100 : 0));
    return perScore.reduce((a, b) => a + b, 0) / perScore.length;
  }

  // ===================== META NUMÉRICA / PORCENTUAL =====================
  if (acumulativo) {
    const totalActual = results.reduce((s, r) => s + Number(r.actual), 0);
    return calculatePeriodCompliance(totalActual, esperado, config);
  }

  if (rule === "umbral_periodos" || rule === "umbral_Periodos") {
    const cumples = results.map((r) => cumpleTarget(r.actual, esperado, config.operador, config.tolerancia));
    return scoreUmbral(cumples, effectiveReconoce, metaDef, reglasCorregidas);
  }

  if (rule === "ultimo_valor" || rule === "cierre_unico") {
    return calculatePeriodCompliance(results[results.length - 1].actual, esperado, config);
  }

  // promedio: promedia los valores crudos y evalúa una vez
  const sumValues = results.reduce((acc, r) => acc + Number(r.actual), 0);
  const representativeValue = results.length ? sumValues / results.length : 0;
  return calculatePeriodCompliance(representativeValue, esperado, config);
};

// === Score de un OBJETIVO (agrega sus metas ponderadas por pesoMeta) ===
export const calculateObjectiveProgress = (
  objective: Objetivo,
  hitosOverride: Hito[] | null = null,
  isFinalYearClosure: EsCierreAnual = false
): number => {
  const hitos = hitosOverride || objective.hitos || [];
  const metasDefs = objective.metas || [];

  if (!metasDefs || metasDefs.length === 0) {
    return calculateLegacyObjectiveProgress(objective, hitos);
  }

  let totalWeightedScore = 0;
  let totalWeights = 0;

  metasDefs.forEach((meta) => {
    const metaScore = calculateMetaScore(meta, hitos, isFinalYearClosure);
    const weight = meta.pesoMeta || 100 / metasDefs.length;
    totalWeightedScore += metaScore * weight;
    totalWeights += weight;
  });

  if (totalWeights === 0) return 0;
  const finalScore = totalWeightedScore / totalWeights;
  return Math.round(finalScore * 10) / 10;
};

const calculateLegacyObjectiveProgress = (objective: Objetivo, hitos: Hito[]): number => {
  const validHitos = hitos.filter((h) => h.actual !== null && h.actual !== undefined);
  if (validHitos.length === 0) return 0;
  const values = validHitos.map((h) => Number(h.actual));
  const isCumulative = objective.metas?.some((m) => m.acumulativa);
  let progress = isCumulative
    ? values.reduce((a, b) => a + b, 0)
    : values.reduce((a, b) => a + b, 0) / values.length;
  return Math.min(progress, 100);
};

export const calculateWeightedScore = (progress: number, weight: number): number =>
  (progress * weight) / 100;

export const calculateGlobalScore = (
  objectivesScore: number,
  competenciesScore: number
): number => {
  const objPart = objectivesScore * 0.7;
  const compPart = competenciesScore * 0.3;
  return Math.round(objPart + compPart);
};

// === Competencias (promedio ponderado) ===
export const calculateCompetencyProgress = (
  aptitudes: Aptitud[] | { items?: Aptitud[] } | null | undefined,
  getMonthFn?: (p?: string) => number,
  monthLimit?: number
): number => {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const items = Array.isArray(aptitudes) ? aptitudes : aptitudes?.items || [];

  items.forEach((apt) => {
    let relevantHitos = apt.hitos || [];
    if (getMonthFn && monthLimit !== undefined) {
      relevantHitos = relevantHitos.filter((h) => getMonthFn(h.periodo) <= monthLimit);
    }
    const puntuaciones = relevantHitos.map((h) => h.actual).filter((v) => v !== null && v !== undefined);
    let aptitudeScore = 0;
    if (puntuaciones.length > 0) {
      aptitudeScore = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
    }
    const peso = Number(apt.peso || 0);
    totalWeightedScore += aptitudeScore * peso;
    totalWeight += peso;
  });

  if (totalWeight === 0) return 0;
  return totalWeightedScore / totalWeight;
};
