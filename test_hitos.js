
function getFiscalStart(year) {
    return new Date(year, 8, 1);
}

function getFiscalEnd(year) {
    return new Date(year + 1, 7, 31, 23, 59, 59, 999);
}

function generarHitos(plantilla) {
    if (!plantilla?.frecuencia || !plantilla?.year) return [];

    const year = Number(plantilla.year);

    const start =
        plantilla.fechaInicioFiscal
            ? new Date(plantilla.fechaInicioFiscal)
            : getFiscalStart(year);

    const end =
        plantilla.fechaCierre
            ? new Date(plantilla.fechaCierre)
            : getFiscalEnd(year);

    const hitos = [];
    let d = new Date(start);

    const push = (fecha, { tipo, idx }) => {
        const yReal = fecha.getFullYear();
        let periodo;

        switch (tipo) {
            case "M":
                periodo = `${yReal}M${String(fecha.getMonth() + 1).padStart(2, "0")}`;
                break;
            case "Q":
                periodo = `${year}Q${idx}`;
                break;
            default:
                periodo = `${year}A${idx}`;
                break;
        }

        hitos.push({
            fecha: fecha.toISOString().slice(0, 10), // YYYY-MM-DD
            periodo,
        });
    };

    switch (plantilla.frecuencia) {
        case "mensual":
            while (d <= end) {
                push(d, { tipo: "M" });
                d.setMonth(d.getMonth() + 1);
            }
            break;
    }

    return hitos;
}

console.log("--- Year 2025 ---");
console.log(generarHitos({ year: 2025, frecuencia: "mensual" }).map(h => h.periodo));

console.log("--- Year 2026 ---");
console.log(generarHitos({ year: 2026, frecuencia: "mensual" }).map(h => h.periodo));
