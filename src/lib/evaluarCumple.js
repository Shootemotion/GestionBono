// src/lib/evaluarCumple.js

/**
 * Evalúa el % de cumplimiento de una meta puntual.
 * @param {number|boolean|null} resultado - Valor obtenido.
 * @param {number|null} esperado - Valor objetivo.
 * @param {string} operador - Operador (">=", ">", "<=", "<", "==", "!=").
 * @param {string} unidad - "Cumple/No Cumple" | "Porcentual" | "Numerico".
 * @returns {number} - Porcentaje de cumplimiento (0–100).
 */
export function calcularPorcentajeMeta(resultado, esperado, operador = ">=", unidad = "Numerico", permiteOver = false, reconoceEsfuerzo = false) {
  if (unidad === "Cumple/No Cumple") {
    return resultado ? 100 : 0;
  }
  if (resultado == null || esperado == null) return 0;

  const r = Number(resultado);
  const e = Number(esperado);

  let p = 0;

  switch (operador) {
    case ">=": p = r >= e ? 100 : (r / e) * 100; break;
    case ">": p = r > e ? 100 : (r / e) * 100; break;
    case "<=": p = r <= e ? 100 : (e / (r || 1)) * 100; break;
    case "<": p = r < e ? 100 : (e / (r || 1)) * 100; break;
    case "==": p = r === e ? 100 : 0; break;
    case "!=": p = r !== e ? 100 : 0; break;
    default: p = 0;
  }

  // Si NO reconoce esfuerzo y no llegó al 100%, es 0.
  if (!reconoceEsfuerzo && p < 100) {
    p = 0;
  }

  // Si permiteOver es true, no limitamos a 100 (salvo que sea binaria o casos especiales)
  // Si es false, limitamos a 100.
  if (!permiteOver) {
    p = Math.min(p, 100);
  }

  return Math.max(0, p);
}

export function evaluarCumple(resultado, esperado, operador = ">=", unidad = "Numerico") {
  // Para evaluar si cumple, usamos la lógica estándar (sin over) para ver si llega al 100%
  // O simplemente verificamos si el cálculo base (incluso con over) es >= 100
  // Nota: Pasar reconoceEsfuerzo=true aquí simplemente para ver el % bruto, aunque evaluarCumple es binario.
  return calcularPorcentajeMeta(resultado, esperado, operador, unidad, true, true) >= 100;
}

export function calcularResultadoGlobal(metas) {
  if (!metas || metas.length === 0) return 0;

  let totalPeso = 0;
  let totalValor = 0;

  for (const m of metas) {
    const peso = m.peso ?? 1;
    if (m.resultado != null) {
      const porcentaje = calcularPorcentajeMeta(
        m.resultado,
        m.esperado,
        m.operador,
        m.unidad,
        m.permiteOver, // Pasamos el flag
        m.reconoceEsfuerzo // Pasamos el flag
      );
      console.debug("[calcularResultadoGlobal] meta:", m.nombre, {
        resultado: m.resultado,
        esperado: m.esperado,
        operador: m.operador,
        unidad: m.unidad,
        permiteOver: m.permiteOver,
        porcentaje,
        peso,
      });
      totalValor += porcentaje * peso;
      totalPeso += peso;
    }
  }

  if (totalPeso === 0) return 0;

  const final = Math.round((totalValor / totalPeso) * 10) / 10;
  console.debug("[calcularResultadoGlobal] totalValor:", totalValor, "totalPeso:", totalPeso, "final:", final);
  return final;
}
