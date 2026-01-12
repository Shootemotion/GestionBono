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

    // --- Objetivos ---
    let totalObjScore = 0;
    let totalObjWeight = 0;

    const objetivos = data.objetivos?.items || data.objetivos || [];

    objetivos.forEach(obj => {
        // Filtrar hitos relevantes hasta el periodo actual
        const relevantHitos = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
        let score = 0;

        if (relevantHitos.length > 0) {
            const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
            const progresos = relevantHitos.map(h => h.actual ?? 0);
            // Si es acumulativo toma el máximo, sino el promedio
            score = isCumulative
                ? Math.max(...progresos, 0)
                : Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length);
        }

        // Verificar si permite superar el 100%
        const hasPermiteOver = obj.metas?.some(m => m.permiteOver) || obj.hitos?.some(h => h.metas?.some(m => m.permiteOver));
        const effectiveScore = hasPermiteOver ? score : Math.min(score, 100);

        totalObjScore += effectiveScore * (obj.peso || 0);
        totalObjWeight += (obj.peso || 0);
    });

    const scoreObjRaw = totalObjScore / 100; // Normalizar a base 100
    const scoreObj = scoreObjRaw * 0.7; // Contribución ponderada (Máx 70)

    // --- Competencias ---
    let totalCompScore = 0;
    let compCount = 0;
    const aptitudes = data.aptitudes?.items || data.aptitudes || [];

    aptitudes.forEach(apt => {
        const relevantHitos = apt.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
        let score = 0;
        const puntuaciones = relevantHitos.map(h => h.actual).filter(val => val !== null && val !== undefined);

        if (puntuaciones.length > 0) {
            score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
        }

        totalCompScore += score;
        compCount++;
    });

    const scoreCompRaw = compCount > 0 ? (totalCompScore / compCount) : 0;
    const scoreComp = scoreCompRaw * 0.3; // Contribución ponderada (Máx 30)

    const global = scoreObj + scoreComp;

    return {
        obj: scoreObj.toFixed(1),
        comp: scoreComp.toFixed(1),
        global: global.toFixed(1)
    };
};
