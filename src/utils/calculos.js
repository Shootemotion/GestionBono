
/**
 * Advanced Score Calculation Engine
 * Implements business rules for Metas (KPIs) and Objectives.
 */

// === HELPERS ===

/**
 * Parses numeric value, treating null/undefined as 0.
 */
const val = (v) => Number(v || 0);

/**
 * Resolves the "Period Index" for chronological sorting.
 * Sep=1, ..., Aug=12
 */
const getPeriodCode = (pStr) => {
    if (!pStr) return 0;
    // Handle Qs
    if (pStr === "Q1") return 3;
    if (pStr === "Q2") return 6;
    if (pStr === "Q3") return 9;
    if (pStr === "FINAL") return 12;

    // Handle Months M01..M12
    // Fiscal Year starts Sep (M09?? No, usually M01 is fiscal month 1)
    // Assuming standard notation M1 = Jan, M12 = Dec? OR M1 = Fiscal Month 1?
    // Based on EvaluacionFlujo logic:
    // if (suffix.startsWith("M")) { const m = parseInt... return m >= 9 ? m - 8 : m + 4; }
    // This implies M09 (Sep) is Month 1. M08 (Aug) is Month 12.

    const suffix = pStr.replace(/^\d{4}/, ""); // Remove year if present "2025Q1" -> "Q1"

    if (suffix.startsWith("M")) {
        const m = parseInt(suffix.slice(1));
        return m >= 9 ? m - 8 : m + 4;
    }
    if (suffix.startsWith("Q")) {
        const q = parseInt(suffix.slice(1));
        return q * 3;
    }
    return 12; // Default to end
};

// === CORE LOGIC ===

/**
 * Calculates the score of a SINGLE PERIOD (Hito) for a specific Meta.
 * Applies 'reconoceEsfuerzo', 'tolerancia', and 'permiteOver'.
 * 
 * @param {number} actual - The actual result achieved.
 * @param {number} target - The target (esperado).
 * @param {Object} config - { reconoceEsfuerzo, tolerancia, permiteOver, operador, unidad }
 */
export const calculatePeriodCompliance = (actual, target, config) => {
    if (actual === null || actual === undefined) return null; // No data

    const tgt = val(target);
    const act = val(actual);
    const tol = val(config.tolerancia);
    const op = config.operador || ">=";

    // 1. Check Compliance (Binary)
    let passed = false;
    if (op === ">=") passed = act >= (tgt - tol);
    else if (op === "<=") passed = act <= (tgt + tol);
    else if (op === "=") passed = Math.abs(act - tgt) <= tol;

    // 2. Calculate Raw Score %
    let rawPct = 0;
    if (tgt === 0) {
        // Avoid division by zero. If target is 0 and we want >= 0...
        rawPct = passed ? 100 : 0;
    } else {
        // Standard percentage calculation
        // If operator is <= (e.g. Reduce Defects), lower is better.
        // 0 defects vs 10 target => 100%? Or more?
        // Usually: (Target / Actual) * 100 ? Or (Target - Actual)/Target?
        // Let's assume standard linear for now: (Actual / Target) * 100 for >=.
        if (op === ">=") {
            rawPct = (act / tgt) * 100;
        } else {
            // Inverse logic for minimization (Target / Actual) * 100
            const safeAct = act === 0 ? 0.0001 : act;
            rawPct = (tgt / safeAct) * 100;
        }
    }

    // 3. Apply 'reconoceEsfuerzo' logic
    // "Si es true, se toma el valor real. Si es false, se convierte a 0% o 100%."
    let effectiveScore = 0;

    if (config.reconoceEsfuerzo) {
        effectiveScore = rawPct;
    } else {
        // Binary
        effectiveScore = passed ? 100 : 0;
    }

    // 4. Force 100% if passed using Tolerancia?
    // "Margen de tolerancia para considerar 'cumple' aun si se queda un poco corto".
    // Usually implies if Actual is 98, Target 100, Tol 2 => Passed.
    // Does it mean score is 100? Or 98?
    // If 'reconoceEsfuerzo' is true, it stays 98.
    // If 'reconoceEsfuerzo' is false, it becomes 100.
    // Logic covers this:
    // If reconoce=true, score=98. Passed=true.
    // If reconoce=false, passed=true => score=100.

    // 5. Cap at 100 unless 'permiteOver'
    if (!config.permiteOver) {
        effectiveScore = Math.min(effectiveScore, 100);
    }

    return effectiveScore;
};

/**
 * Calculates the Final Score of a META by aggregating its period results.
 * Applies 'reglaCierre' (Promedio, Ultimo, Umbral, etc.).
 * 
 * @param {Object} metaDef - The Meta definition (from Objective or Template).
 * @param {Array} hitos - All hitos of the objective (Evaluaciones).
 */
export const calculateMetaScore = (metaDef, hitos) => {
    const metaId = metaDef.metaId || metaDef._id; // ID to link hito results

    // 1. Gather Results
    // Extract results for THIS meta from all hitos
    const results = hitos.map(h => {
        // Find the result in the hito's metasResultados
        const mRes = h.metas?.find(m => String(m.metaId || m._id) === String(metaId));
        return {
            periodo: h.periodo,
            order: getPeriodCode(h.periodo),
            actual: mRes ? mRes.resultado : null, // The raw value entered
            target: metaDef.esperado, // Use definition target (or hito override if supported)
            config: {
                // Use hito config if it evolves, or metaDef default
                reconoceEsfuerzo: metaDef.reconoceEsfuerzo,
                tolerancia: metaDef.tolerancia,
                permiteOver: metaDef.permiteOver,
                operador: metaDef.operador,
                acumulativa: metaDef.acumulativa || metaDef.modoAcumulacion === 'acumulativo'
            }
        };
    }).filter(r => r.actual !== null && r.actual !== undefined)
        .sort((a, b) => a.order - b.order);

    if (results.length === 0) return 0;

    const rule = metaDef.reglaCierre || "promedio";
    const acumulativo = metaDef.acumulativa || metaDef.modoAcumulacion === 'acumulativo';

    // HANDLE ACUMULATIVO (Before Period Logic? or as a Cierre Rule?)
    // "Cada registro suma al total final".
    // If Acumulativo, we perform ONE calculation on the SUM.
    if (acumulativo) {
        const totalActual = results.reduce((sum, r) => sum + Number(r.actual), 0);
        const target = Number(metaDef.esperado || 0);
        // Config properties (use the def)
        const config = {
            reconoceEsfuerzo: metaDef.reconoceEsfuerzo,
            tolerancia: metaDef.tolerancia,
            permiteOver: metaDef.permiteOver,
            operador: metaDef.operador
        };
        return calculatePeriodCompliance(totalActual, target, config);
    }

    // HANDLE PERIOD-BASED RULES (Promedio, Ultimo, Umbral)
    // First, calculate score for EACH period independently
    const periodScores = results.map(r => calculatePeriodCompliance(r.actual, r.target, r.config));

    if (rule === "ultimo_valor") {
        return periodScores[periodScores.length - 1];
    }

    if (rule === "umbral_Periodos" || rule === "umbral_periodos") {
        // "Necesito X períodos cumplidos"
        // Assuming metaDef.umbralPeriodos holds the number required
        const required = metaDef.umbralPeriodos || results.length; // Default to all? or 1?
        const passedCount = periodScores.filter(s => s >= 100).length; // Assuming 100 means passed

        // Binary or Proportional? "Cuenta cuántos... vs total"?
        // Usually logic is: "If you met 3/4, do you get 75% or 0%?"
        // If "Umbral" implies a Cutoff, it's likely Binary.
        // "Necesito X periodos cumplidos de N".
        // If I need 3 and I have 2 => 0%.
        // If I have 3 => 100%.
        if (passedCount >= required) return 100;

        // If "Reconoce Esfuerzo" is active, give proportional credit for the periods achieved
        if (metaDef.reconoceEsfuerzo && required > 0) {
            return (passedCount / required) * 100;
        }

        return 0; // Fail (Binary)
    }

    // Default: Promedio / Cierre Único
    // "Cierre Único" is handled similar to "Ultimo Valor" but usually implies we take a single representative value for the year.
    // "Promedio": We should Average the INPUTS (e.g. 62.5%) then Check Compliance.
    // NOT Average the Scores (e.g. 50%).

    let representativeValue = 0;

    if (rule === "cierre_unico") {
        // Last available value
        representativeValue = results[results.length - 1]?.actual ?? 0;
    } else {
        // "promedio"
        const sumValues = results.reduce((acc, r) => acc + Number(r.actual), 0);
        representativeValue = results.length ? sumValues / results.length : 0;
    }

    const lastConfig = results[results.length - 1]?.config || {
        reconoceEsfuerzo: metaDef.reconoceEsfuerzo,
        tolerancia: metaDef.tolerancia,
        permiteOver: metaDef.permiteOver,
        operador: metaDef.operador
    };

    // Calculate Single Score based on Representative Value
    return calculatePeriodCompliance(representativeValue, metaDef.esperado, lastConfig);
};


/**
 * Calculates the progress of an OBJECTIVE by aggregating its METAS.
 * 
 * @param {Object} objective - The objective definition.
 * @param {Array} hitosOverride - Optional hitos with results.
 */
export const calculateObjectiveProgress = (objective, hitosOverride = null) => {
    const hitos = hitosOverride || objective.hitos || [];

    // 1. Identify Metas
    // Strategy: Inspect 'objective.metas' (the config). 
    // If not present, warn or fallback to 'hitos[0].metas'.
    const metasDefs = objective.metas || [];

    if (!metasDefs || metasDefs.length === 0) {
        // Fallback: This might be a legacy objective without metas, just direct hito values?
        // In that case, use the old "Simple Average/Sum of Hitos" logic (Legacy Mode)
        // Checking if legacy...
        return calculateLegacyObjectiveProgress(objective, hitos);
    }

    // 2. Calculate Score per Meta
    let totalWeightedScore = 0;
    let totalWeights = 0;

    metasDefs.forEach(meta => {
        // Calc Meta Score
        const metaScore = calculateMetaScore(meta, hitos);

        // Weighting
        const weight = meta.pesoMeta || (100 / metasDefs.length); // Default to equal weights
        totalWeightedScore += (metaScore * weight);
        totalWeights += weight;
    });

    // 3. Normalize
    if (totalWeights === 0) return 0;

    // Result
    const finalScore = totalWeightedScore / totalWeights;

    // Apply Objective-Level caps? (Usually Meta-level caps suffice, but Obj shouldn't exceed 100 unless Metas allow)
    // If Metas allowed Over, finalScore can be > 100.
    return Math.round(finalScore * 10) / 10;
};

// Legacy fallback (from Phase 1)
const calculateLegacyObjectiveProgress = (objective, hitos) => {
    const validHitos = hitos.filter(h => h.actual !== null && h.actual !== undefined);
    if (validHitos.length === 0) return 0;
    const values = validHitos.map(h => Number(h.actual));

    const isCumulative = objective.metas?.some(m => m.acumulativa); // unlikely to trigger if no metas

    let progress = 0;
    if (isCumulative) {
        progress = values.reduce((a, b) => a + b, 0);
    } else {
        progress = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return Math.min(progress, 100);
};

export const calculateWeightedScore = (progress, weight) => {
    return (progress * weight) / 100;
};

export const calculateGlobalScore = (objectivesScore, competenciesScore) => {
    const objPart = objectivesScore * 0.7;
    const compPart = competenciesScore * 0.3;
    return Math.round(objPart + compPart);
};
