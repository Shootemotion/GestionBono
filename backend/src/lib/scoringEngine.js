import { calcularResultadoMeta } from "./calculoMetas.js";
import { calcularScoreObjetivoDesdeMetas } from "./scoringGlobal.js";

/**
 * Calculates the progress of a set of goals (Metas) for an Objective based on a list of periodical records (Hitos).
 * This unifies the logic found in dashboard.controller.js and recalculoEmpleado.js.
 *
 * @param {Array} metasDefinition - List of meta definitions (from Plantilla).
 * @param {Array} hitos - List of Hitos (evaluations per period) containing results.
 * @returns {Object} { metasAnuales, progreso }
 *    - metasAnuales: List of metas with their calculated annual 'scoreMeta'.
 *    - progreso: The final score (0-100) for the objective.
 */
export function calculateAnnualObjectiveProgress(metasDefinition, hitos) {
    if (!metasDefinition || metasDefinition.length === 0) {
        // Fallback for legacy objectives without specific metas
        const progresos = hitos.map((h) => h.actual ?? 0);
        const progreso = progresos.length
            ? Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length)
            : 0;
        return { metasAnuales: [], progreso };
    }

    const metasAnuales = metasDefinition.map(metaDef => {
        // Extract relevant values from hitos for this specific meta
        const registros = hitos.map(h => {
            // Find the result for this meta within the hito
            const mRes = h.metas?.find(m =>
                (m._id && String(m._id) === String(metaDef._id)) ||
                m.nombre === metaDef.nombre
            );
            return {
                periodo: h.periodo,
                valor: mRes ? mRes.resultado : null
            };
        }).filter(r => r.valor !== null && r.valor !== undefined && r.valor !== "");

        // Calculate the Annual Score for this Meta (using standard logic)
        const { scoreMeta } = calcularResultadoMeta(metaDef, registros);

        return {
            ...metaDef,
            scoreMeta
        };
    });

    // Aggregate Meta Scores into Objective Score (weighted)
    const progreso = calcularScoreObjetivoDesdeMetas(metasAnuales);

    return { metasAnuales, progreso };
}


/**
 * Calculates the Global Performance Score for an employee.
 * Applies the 70/30 rule (Objectives/Aptitudes) and handles Snapshot Overrides.
 *
 * @param {Array} objetivos - List of processed objectives. Must contain { peso, progreso/actual }.
 * @param {Array} aptitudes - List of processed aptitudes. Must contain { peso, puntuacion/actual }.
 * @param {Object} [latestFeedback] - (Optional) The latest closed feedback document. Used for Snapshot Overrides.
 * @param {Object} [config] - Configuration for weights. Defaults to { obj: 0.7, apt: 0.3 }.
 * @returns {Object} { scoreObj, scoreApt, scoreFinal, bono, isSnapshot }
 */
export function calculateGlobalPerformance(objetivos = [], aptitudes = [], latestFeedback = null, config = { obj: 0.7, apt: 0.3 }) {
    // 1. Calculate weighted sums
    // Note: Use 'progreso' for objectives (standard in dashboard) or 'actual' (standard in scoringGlobal)
    // We try 'progreso' first, then 'actual'. 

    let sumPesoObj = 0;
    let weightedProgressSum = 0;

    objetivos.forEach(obj => {
        const p = Number(obj.peso || 0);
        const val = Number(obj.progreso ?? obj.actual ?? 0);
        sumPesoObj += p;
        weightedProgressSum += val * p;
    });

    let sumPesoApt = 0;
    let weightedAptScoreSum = 0;

    aptitudes.forEach(apt => {
        const p = Number(apt.peso || 0);
        const val = Number(apt.puntuacion ?? apt.actual ?? 0);
        sumPesoApt += p;
        weightedAptScoreSum += val * p;
    });

    // 2. Compute raw scores (0-100)
    let scoreObj = sumPesoObj > 0 ? weightedProgressSum / sumPesoObj : 0;
    let scoreApt = sumPesoApt > 0 ? weightedAptScoreSum / sumPesoApt : 0;

    // 3. Compute Final Score (Formula: 70% Obj + 30% Apt)
    // We use Math.round(X * 10) / 10 to keep 1 decimal place.
    let scoreFinal = Math.round((config.obj * scoreObj + config.apt * scoreApt) * 10) / 10;
    let bono = (objetivos.length > 0 || aptitudes.length > 0) ? `${scoreFinal}%` : null;
    let isSnapshot = false;

    // 4. Apply Snapshot Override if exists
    // The "snapshot" is the score frozen when feedback was closed.
    // Logic: If a closed feedback exists and has valid global score, it TRUMPS the live calculation.
    if (latestFeedback && latestFeedback.scores?.global != null) {
        scoreObj = latestFeedback.scores.obj ?? scoreObj;
        scoreApt = latestFeedback.scores.comp ?? scoreApt;
        scoreFinal = latestFeedback.scores.global;
        bono = `${scoreFinal}%`;
        isSnapshot = true;
    }

    return {
        scoreObj,
        scoreApt,
        scoreFinal,
        bono,
        isSnapshot,
        // Debug info
        totals: {
            sumPesoObj,
            sumPesoApt
        }
    };
}
