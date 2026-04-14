
/**
 * Advanced Score Calculation Engine (Unified for Backend)
 * Ported from src/utils/calculos.js to ensure 100% consistency.
 */

// === HELPERS ===

const val = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'string') {
        const parsed = Number(v.replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
    }
    return isNaN(Number(v)) ? 0 : Number(v);
};

const getPeriodCode = (pStr) => {
    if (!pStr) return 0;
    const suffix = String(pStr).replace(/^\d{4}/, ""); 

    if (suffix === "Q1") return 3;
    if (suffix === "Q2") return 6;
    if (suffix === "Q3") return 9;
    if (suffix === "FINAL") return 12;

    if (suffix.startsWith("M")) {
        const m = parseInt(suffix.slice(1));
        return m >= 9 ? m - 8 : m + 4;
    }
    if (suffix.startsWith("Q")) {
        const q = parseInt(suffix.slice(1));
        return q * 3;
    }
    return 12;
};

// === CORE LOGIC ===

export const calculatePeriodCompliance = (actual, target, config) => {
    if (actual === null || actual === undefined) return null;

    const tgt = val(target);
    const act = val(actual);
    const tol = val(config.tolerancia);
    const op = config.operador || ">=";

    let passed = false;
    if (op === ">=") passed = act >= (tgt - tol);
    else if (op === ">") passed = act > (tgt - tol);
    else if (op === "<=") passed = act <= (tgt + tol);
    else if (op === "<") passed = act < (tgt + tol);
    else if (op === "=" || op === "==" || op === "===") passed = Math.abs(act - tgt) <= tol;

    let rawPct = 0;
    if (tgt === 0) {
        rawPct = passed ? 100 : 0;
    } else {
        if (op === ">=" || op === ">") {
            rawPct = (act / tgt) * 100;
        } else {
            const safeAct = act === 0 ? 0.0001 : act;
            rawPct = (tgt / safeAct) * 100;
        }
    }

    let effectiveScore = 0;
    if (config.reconoceEsfuerzo) {
        effectiveScore = rawPct;
    } else {
        effectiveScore = passed ? 100 : 0;
    }

    if (!config.permiteOver) {
        effectiveScore = Math.min(effectiveScore, 100);
    }

    return effectiveScore;
};

export const calculateMetaScore = (metaDef, hitos, isFinalYearClosure = false) => {
    const metaId = metaDef.metaId || metaDef._id;
    const effectiveReconoce = isFinalYearClosure ? metaDef.reconoceEsfuerzo : true;

    const results = hitos.map(h => {
        const mRes = h.metas?.find(m => String(m.metaId || m._id) === String(metaId));
        return {
            periodo: h.periodo,
            order: getPeriodCode(h.periodo),
            actual: mRes ? mRes.resultado : null,
            target: metaDef.esperado ?? metaDef.target,
            config: {
                reconoceEsfuerzo: effectiveReconoce,
                tolerancia: metaDef.tolerancia,
                permiteOver: metaDef.permiteOver,
                operador: metaDef.operador,
            }
        };
    }).filter(r => r.actual !== null && r.actual !== undefined)
        .sort((a, b) => a.order - b.order);

    if (results.length === 0) return 0;

    const rule = metaDef.reglaCierre || "promedio";
    const acumulativo = metaDef.acumulativa || metaDef.modoAcumulacion === 'acumulativo';

    if (acumulativo) {
        const totalActual = results.reduce((sum, r) => sum + Number(r.actual), 0);
        const target = Number(metaDef.esperado || metaDef.target || 0);
        return calculatePeriodCompliance(totalActual, target, {
            reconoceEsfuerzo: effectiveReconoce,
            tolerancia: metaDef.tolerancia,
            permiteOver: metaDef.permiteOver,
            operador: metaDef.operador
        });
    }

    const periodScores = results.map(r => calculatePeriodCompliance(r.actual, r.target, r.config));

    if (rule === "ultimo_valor") {
        return periodScores[periodScores.length - 1];
    }

    if (rule === "umbral_Periodos" || rule === "umbral_periodos") {
        const required = metaDef.umbralPeriodos || results.length;
        const binaryPeriodScores = results.map(r =>
            calculatePeriodCompliance(r.actual, r.target, {
                ...r.config,
                reconoceEsfuerzo: false,
                permiteOver: false,
            })
        );
        const evaluatedScores = binaryPeriodScores.filter(s => s !== null);
        const evaluatedCount = evaluatedScores.length;
        const passedCount = evaluatedScores.filter(s => s >= 100).length;

        if (passedCount >= required) return 100;

        if (effectiveReconoce && required > 0) {
            return (passedCount / required) * 100;
        } else if (evaluatedCount > 0) {
            if (evaluatedCount >= required) {
                return 0;
            } else {
                return (passedCount / evaluatedCount) * 100;
            }
        }
        return 0;
    }

    let representativeValue = 0;
    if (rule === "cierre_unico") {
        representativeValue = results[results.length - 1]?.actual ?? 0;
    } else {
        const sumValues = results.reduce((acc, r) => acc + Number(r.actual), 0);
        representativeValue = results.length ? sumValues / results.length : 0;
    }

    const lastConfig = results[results.length - 1]?.config || {
        reconoceEsfuerzo: effectiveReconoce,
        tolerancia: metaDef.tolerancia,
        permiteOver: metaDef.permiteOver,
        operador: metaDef.operador
    };

    return calculatePeriodCompliance(representativeValue, metaDef.esperado ?? metaDef.target, lastConfig);
};

export const calculateObjectiveProgress = (objective, hitosOverride = null, isFinalYearClosure = false) => {
    const hitos = hitosOverride || objective.hitos || [];
    const metasDefs = objective.metas || [];

    if (!metasDefs || metasDefs.length === 0) {
        const validHitos = hitos.filter(h => h.actual !== null && h.actual !== undefined);
        if (validHitos.length === 0) return 0;
        const values = validHitos.map(h => Number(h.actual));
        const progress = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.min(progress, 100);
    }

    let totalWeightedScore = 0;
    let totalWeights = 0;

    metasDefs.forEach(meta => {
        const metaScore = calculateMetaScore(meta, hitos, isFinalYearClosure);
        const weight = meta.pesoMeta || (100 / metasDefs.length);
        totalWeightedScore += (metaScore * weight);
        totalWeights += weight;
    });

    if (totalWeights === 0) return 0;
    const finalScore = totalWeightedScore / totalWeights;
    return Math.round(finalScore * 10) / 10;
};
