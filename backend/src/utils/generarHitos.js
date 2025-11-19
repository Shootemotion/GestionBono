// backend/src/utils/generarHitos.js

// Mismo criterio que en Plantilla.model.js
function getFiscalStart(year) {
  // 1 de septiembre
  return new Date(year, 8, 1);
}

function getFiscalEnd(year) {
  // 31 de agosto del año siguiente
  return new Date(year + 1, 7, 31, 23, 59, 59, 999);
}

/**
 * Genera los hitos de seguimiento en base a la frecuencia y fechas fiscales.
 *
 * @param {Object} plantilla
 * @param {Number} plantilla.year
 * @param {String} plantilla.frecuencia  "mensual" | "trimestral" | "semestral" | "anual"
 * @param {Date|String} [plantilla.fechaInicioFiscal]
 * @param {Date|String} [plantilla.fechaCierre]
 * @returns {Array<{ fecha: String, periodo: String }>}
 */
export function generarHitos(plantilla) {
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
      case "S":
        periodo = `${year}S${idx}`;
        break;
      case "A":
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

    case "trimestral": {
      let i = 1;
      while (d <= end) {
        push(d, { tipo: "Q", idx: i++ });
        d.setMonth(d.getMonth() + 3);
      }
      break;
    }

    case "semestral": {
      let i = 1;
      while (d <= end) {
        push(d, { tipo: "S", idx: i++ });
        d.setMonth(d.getMonth() + 6);
      }
      break;
    }

    case "anual":
    default:
      push(d, { tipo: "A", idx: 1 });
      break;
  }

  return hitos;
}
