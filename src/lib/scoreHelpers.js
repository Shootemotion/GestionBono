import { calculateObjectiveProgress, calculateCompetencyProgress } from "@/utils/calculos";

// Helper para convertir el string del periodo a un índice de mes comparable (1-12) basado en el Año Fiscal (Sep-Ago)
export const getCurrentFiscalYear = (date = new Date()) => {
    // Fiscal Year starts in September (Month index 8)
    // If we are in Jan (0) - Aug (7), we are in the fiscal year of (CurrentYear - 1)
    // If we are in Sep (8) - Dec (11), we are in the fiscal year of (CurrentYear)
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();

    if (month >= 8) { // Sep onwards
        return year;
    } else {
        return year - 1;
    }
};


export const getPeriodMonth = (periodStr) => {
    if (!periodStr) return 0;
    if (periodStr === "Q1") return 3;   // Sep-Nov
    if (periodStr === "Q2") return 6;   // Dic-Feb
    if (periodStr === "Q3") return 9;   // Mar-May
    if (periodStr === "FINAL") return 12; // Jun-Ago

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
};

// Calcula los puntajes (Objetivos, Competencias, Global) para un periodo dado usando la data del dashboard
export const calculatePeriodScores = (data, period) => {
    if (!data || !period) return { scores: { obj: 0, comp: 0, global: 0 } };

    const feedbackLimit = getPeriodMonth(period);

    // --- IDENTIFICADOR DE CIERRE ANUAL ---
    // Determina si este periodo representa el cierre definitivo del año (Mes 12)
    // Si es así, se aplican estrictamente reglas como 'Todo o Nada' sin proporcionalidad.
    const isFinalPeriod = feedbackLimit === 12 || period === "FINAL";

    // --- Objetivos ---
    let totalObjScore = 0;
    let totalObjWeight = 0;

    const objetivos = data.objetivos?.items || data.objetivos || [];

    objetivos.forEach(obj => {
        // Filtrar hitos relevantes hasta el periodo actual
        const relevantHitos = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];

        let effectiveScore = 0;

        if (relevantHitos.length > 0) {
            // Use Shared Utility for consistent calculation
            // isFinalPeriod controls whether we do tracking (proportional) or strict closure
            effectiveScore = calculateObjectiveProgress(obj, relevantHitos, isFinalPeriod);
        }
        totalObjScore += (effectiveScore * (obj.peso || 0));
    });

    // Normalización: Dividimos por 100 siempre, NO por la suma de pesos evaluados.
    // Esto asegura que si solo se evaluó un objetivo de peso 10, el score máximo sea 10% (7 puntos).
    // Coincide con la lógica de Sala de Evaluación y Dashboard.
    const scoreObjRaw = totalObjScore / 100; 
    const scoreObj = scoreObjRaw * 0.7; // Contribución ponderada (Máx 70)

    // --- Competencias (Centralizado y Ponderado) ---
    const scoreCompRaw = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, feedbackLimit);
    const scoreComp = scoreCompRaw * 0.3; // Contribución ponderada (Máx 30)

    const global = scoreObj + scoreComp;

    return {
        obj: scoreObj.toFixed(1),
        comp: scoreComp.toFixed(1),
        global: global.toFixed(1)
    };
};

