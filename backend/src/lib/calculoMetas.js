// src/lib/calculoMetas.js

// Normaliza 0..100 y opcionalmente permite over hasta max
export const clamp = (v, max = 100) =>
    Math.max(0, Math.min(max, Number(v) || 0));

/**
 * Parses numeric value, treating null/undefined as 0, 
 * and converting Spanish comma decimals to dots (e.g. "0,5" -> 0.5)
 */
export const valNumSeguro = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'string') {
        const parsed = Number(v.replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
    }
    return isNaN(Number(v)) ? 0 : Number(v);
};

/**
 * Normaliza la config de una meta desde Plantilla o metasResultados.
 *
 * metaConfig:
 *  - unidad: "Cumple/No Cumple" | "Porcentual" | "Numerico"
 *  - esperado / target
 *  - reconoceEsfuerzo
 *  - permiteOver
 *  - tolerancia
 *  - modoAcumulacion: "periodo" | "acumulativo"
 *  - reglaCierre: "promedio" | "umbral_periodos" | "cierre_unico"
 *  - umbralPeriodos (opcional)
 *  - maxOver (opcional)
 */
export function normalizarConfigMeta(metaConfig = {}) {
    const rawUnidad = metaConfig.unidad || "Porcentual";
    const u = String(rawUnidad).toLowerCase();

    let tipoUnidad = "numerico"; // default
    if (u.includes("cumple")) tipoUnidad = "binario";
    else if (u.startsWith("porc")) tipoUnidad = "porcentual";

    const esperadoStr = metaConfig.esperado !== undefined ? metaConfig.esperado : metaConfig.target;
    const esperado = valNumSeguro(esperadoStr);

    const operador = metaConfig.operador || ">=";

    const reconoceEsfuerzo = !!metaConfig.reconoceEsfuerzo;
    const permiteOver = !!metaConfig.permiteOver;
    const tolerancia = valNumSeguro(metaConfig.tolerancia);

    const modoAcumulacion = metaConfig.modoAcumulacion || "periodo";
    const reglaCierre = metaConfig.reglaCierre || "promedio";

    const umbralPeriodos = valNumSeguro(metaConfig.umbralPeriodos ?? metaConfig.umbralDePeriodos);

    const maxOver = permiteOver
        ? valNumSeguro(metaConfig.maxOver ?? 120) || 120
        : 100;

    return {
        rawUnidad,
        tipoUnidad, // "porcentual" | "numerico" | "binario"
        operador, // ">=", "<=", "="
        esperado: esperado >= 0 ? esperado : 0,
        reconoceEsfuerzo,
        permiteOver,
        tolerancia,
        modoAcumulacion, // "periodo" | "acumulativo"
        reglaCierre, // "promedio" | "umbral_periodos" | "cierre_unico"
        umbralPeriodos,
        maxOver,
    };
}

/**
 * Calcula score + cumple para UN solo valor de la meta (un período).
 *
 * cfg: resultado de normalizarConfigMeta
 * valorEvaluado: lo que cargó el jefe en este hito
 *
 * Devuelve:
 *  { score: number (0..100/120), cumple: boolean }
 */
export function calcularScorePeriodoMeta(cfg, valorEvaluado) {
    // 1) Binario (Cumple/No Cumple)
    if (cfg.tipoUnidad === "binario") {
        const valBool = !!valorEvaluado;
        return {
            score: valBool ? 100 : 0,
            cumple: valBool,
        };
    }

    const esperado = cfg.esperado;
    const valNum = Number(valorEvaluado) || 0;
    const tol = cfg.tolerancia || 0;
    const op = cfg.operador || ">=";

    // Determinar cumplimiento según operador
    let cumple = false;
    if (op === ">=") {
        cumple = valNum + tol >= esperado;
    } else if (op === ">") {
        cumple = valNum + tol > esperado;
    } else if (op === "<=") {
        cumple = valNum - tol <= esperado;
    } else if (op === "<") {
        cumple = valNum - tol < esperado;
    } else if (op === "=" || op === "==" || op === "===") {
        cumple = Math.abs(valNum - esperado) <= tol;
    }

    // 2) Sin reconocimiento de esfuerzo → todo o nada
    if (!cfg.reconoceEsfuerzo) {
        const score = cumple ? 100 : 0;
        return { score, cumple };
    }

    // 3) Con reconocimiento de esfuerzo → proporcional
    let score = 0;

    // Treat > like >= (Maximization)
    if (op === ">=" || op === ">") {
        if (esperado > 0) {
            score = (valNum / esperado) * 100;
        } else {
            // Si esperado es 0, cualquier valor positivo es infinito%, pero asumimos 100 si cumple
            score = cumple ? 100 : 0;
        }
    }
    // Treat < like <= (Minimization)
    else if (op === "<=" || op === "<") {
        // Formula: (Esperado / Valor) * 100
        // Si valor <= esperado (y valor > 0), score >= 100
        if (valNum > 0) {
            score = (esperado / valNum) * 100;
        } else {
            // Si valor es 0 (y esperado > 0), idealmente es "infinito" mejor. Cap at maxOver.
            score = cfg.maxOver || 100;
        }
    }
    // Equality
    else {
        // Igualdad (=)
        // Difícil hacer proporcional lineal sin rango.
        // Si cumple (dentro de tolerancia), 100. Si no, 0.
        score = cumple ? 100 : 0;
    }

    score = clamp(score, cfg.maxOver);

    return { score, cumple };
}

/**
 * Versión “anual” opcional: calcula resultado global de una meta
 * a lo largo de varios períodos.
 *
 * metaConfig: config de la meta
 * registros: [{ periodo, valor }]
 */
export function calcularResultadoMeta(metaConfig = {}, registros = []) {
    const cfg = normalizarConfigMeta(metaConfig);

    if (!Array.isArray(registros) || registros.length === 0) {
        return {
            scoreMeta: 0,
            cumpleGlobal: false,
            periodos: [],
        };
    }

    const sorted = [...registros].sort((a, b) =>
        String(a.periodo).localeCompare(String(b.periodo), undefined, { numeric: true, sensitivity: 'base' })
    );

    let acumuladoValor = 0;

    const periodosCalc = sorted.map((reg) => {
        const valorCrudo = reg.valor;
        let valorEvaluado;

        if (cfg.modoAcumulacion === "acumulativo") {
            if (cfg.tipoUnidad === "binario") {
                acumuladoValor += valorCrudo ? 1 : 0;
            } else {
                acumuladoValor += Number(valorCrudo) || 0;
            }
            valorEvaluado = acumuladoValor;
        } else {
            // "periodo"
            if (cfg.tipoUnidad === "binario") {
                valorEvaluado = !!valorCrudo;
            } else {
                valorEvaluado = Number(valorCrudo) || 0;
            }
        }

        const { score, cumple } = calcularScorePeriodoMeta(cfg, valorEvaluado);

        return {
            periodo: reg.periodo,
            valor: valorCrudo,
            valorEvaluado,
            score,
            cumple,
        };
    });

    // Regla de cierre
    let scoreMeta = 0;
    let cumpleGlobal = false;

    if (cfg.reglaCierre === "umbral_periodos") {
        const total = periodosCalc.length;
        const cumplidos = periodosCalc.filter((p) => p.cumple).length;
        const umbralNecesario = cfg.umbralPeriodos || 0;

        cumpleGlobal = cumplidos >= umbralNecesario;

        if (cumpleGlobal) {
            if (cfg.permiteOver && umbralNecesario > 0 && total > umbralNecesario) {
                // Interpolación lineal:
                // Umbral -> 100%
                // Total -> MaxOver (ej. 120%)
                const extra = cumplidos - umbralNecesario;
                const gap = total - umbralNecesario;
                const maxOverVal = cfg.maxOver || 120;

                // Score = 100 + (% de avance en el gap) * (diferencia de score)
                scoreMeta = 100 + (extra / gap) * (maxOverVal - 100);
            } else {
                scoreMeta = 100;
            }
        } else {
            // Si no cumple el umbral, vemos si reconoce esfuerzo
            if (cfg.reconoceEsfuerzo) {
                // Return proportional credit based on required threshold
                scoreMeta = umbralNecesario > 0 ? (cumplidos / umbralNecesario) * 100 : 0;
            } else {
                // Return 0 if it doesn't recognize effort and haven't met threshold
                scoreMeta = 0;
            }
        }

        // Aplicar cap de maxOver (por si dio > 100 o > 120)
        scoreMeta = clamp(scoreMeta, cfg.maxOver);
    } else {
        // "promedio" o "cierre_unico"
        // Calculamos un valor representativo (promedio de valores o último valor)
        // y evaluamos el score SOBRE ese valor final.
        let valorRepresentativo = 0;

        if (cfg.reglaCierre === "cierre_unico") {
            const last = periodosCalc[periodosCalc.length - 1];
            valorRepresentativo = last?.valorEvaluado ?? 0;
        } else {
            // "promedio" (default)
            const totalValor = periodosCalc.reduce((acc, p) => acc + p.valorEvaluado, 0);
            valorRepresentativo = periodosCalc.length
                ? totalValor / periodosCalc.length
                : 0;
        }

        const res = calcularScorePeriodoMeta(cfg, valorRepresentativo);
        scoreMeta = res.score;
        cumpleGlobal = res.cumple;
    }

    return {
        scoreMeta: +scoreMeta.toFixed(2),
        cumpleGlobal,
        periodos: periodosCalc,
    };
}
