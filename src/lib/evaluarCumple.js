// src/lib/evaluarCumple.js
//
// Evaluación de metas al cargar un resultado.
//
// ⚠️ ESTE ARCHIVO YA NO CALCULA NADA. Es un adaptador sobre scoringCore, que
// es el único motor. Lo que queda acá son las tres firmas que usan las
// pantallas de carga, para no tener que tocarlas.
//
// POR QUÉ IMPORTA
// Este es el código que calcula el valor que SE GUARDA en cada hito cuando el
// jefe carga un resultado. Era una copia vieja del motor, sin dos arreglos:
//
//   · El operador "=" daba 0 salvo coincidencia exacta. Una meta de
//     "% de avance == 100" con 15 cargado valía 0 en vez de 15.
//   · Los operadores de minimizar ("<", "<=") devolvían 100 sin mirar
//     `reconoceEsfuerzo`: una meta de "% de errores < 0,5" con 0,5 cargado
//     —que NO cumple— puntuaba 100.
//
// Medido sobre los 1887 resultados cargados en la base: 15 daban distinto, y
// en los 15 el motor unificado es el correcto. Los valores ya guardados no
// cambian; esto rige para lo que se cargue de ahora en más.
//
// Tampoco soportaba `tolerancia`, que el motor sí tiene.

import {
  calculatePeriodCompliance,
  calculateWeightedScore,
} from "@/utils/calculos";

/** Una meta "Cumple/No Cumple" vale 100 o 0, sin proporción. */
const esBinaria = (unidad) => String(unidad || "").toLowerCase().includes("cumple");

/**
 * Configuración de la meta en la forma que espera el motor.
 * Se arma acá porque las pantallas de carga pasan los campos sueltos.
 */
const configDe = (meta = {}) => ({
  operador: meta.operador,
  tolerancia: meta.tolerancia,
  permiteOver: meta.permiteOver,
  reconoceEsfuerzo: meta.reconoceEsfuerzo,
  maxOver: meta.maxOver,
});

/**
 * Porcentaje de cumplimiento de una meta en un período.
 *
 * @param {number|boolean|null} resultado  valor cargado
 * @param {number|null} esperado           valor objetivo
 * @param {string} operador
 * @param {string} unidad                  "Cumple/No Cumple" | "Porcentual" | "Numerico"
 * @param {boolean} permiteOver
 * @param {boolean} reconoceEsfuerzo
 * @param {number} [tolerancia]            el motor la aplica; la firma vieja no la tenía
 * @returns {number} 0–100 (o hasta maxOver con permiteOver)
 */
export function calcularPorcentajeMeta(
  resultado,
  esperado,
  operador = ">=",
  unidad = "Numerico",
  permiteOver = false,
  reconoceEsfuerzo = false,
  tolerancia = 0
) {
  if (esBinaria(unidad)) return resultado && Number(resultado) !== 0 ? 100 : 0;
  if (resultado === null || resultado === undefined || resultado === "") return 0;

  const p = calculatePeriodCompliance(resultado, esperado, {
    operador,
    tolerancia,
    permiteOver,
    reconoceEsfuerzo,
  });
  return p ?? 0;
}

/**
 * ¿La meta se cumplió? Binario, para el cartelito de "Cumple / No cumple".
 *
 * Se evalúa con `reconoceEsfuerzo` APAGADO: así el motor devuelve 100 o 0
 * según se alcance el objetivo, que es la pregunta de acá. Con el flag
 * prendido devuelve la proporción, y una meta cumplida gracias a la
 * tolerancia —88 sobre 90 con 2 de margen— daría 97,8 y se leería como no
 * cumplida.
 */
export function evaluarCumple(resultado, esperado, operador = ">=", unidad = "Numerico", tolerancia = 0) {
  if (esBinaria(unidad)) return !!resultado && Number(resultado) !== 0;
  return calcularPorcentajeMeta(resultado, esperado, operador, unidad, false, false, tolerancia) >= 100;
}

/**
 * Resultado del hito: promedio de sus metas, ponderado por el peso de cada una.
 *
 * Es el número que se guarda en `hito.actual`.
 *
 * Ponderación: se usa `calculateWeightedScore` del motor y se divide por el
 * peso total, que es lo que hacía esta función y lo que esperan las
 * pantallas. No se cambia a la normalización /100 del cierre anual: acá se
 * resume UN hito, no se reparte la nota del año.
 */
export function calcularResultadoGlobal(metas) {
  if (!metas || metas.length === 0) return 0;

  let totalPeso = 0;
  let totalValor = 0;

  for (const m of metas) {
    if (m.resultado === null || m.resultado === undefined || m.resultado === "") continue;
    const peso = m.peso ?? m.pesoMeta ?? 1;
    const porcentaje = calcularPorcentajeMeta(
      m.resultado,
      m.esperado,
      m.operador,
      m.unidad,
      m.permiteOver,
      m.reconoceEsfuerzo,
      m.tolerancia
    );
    totalValor += calculateWeightedScore(porcentaje, peso);
    totalPeso += peso;
  }

  if (totalPeso === 0) return 0;
  // `calculateWeightedScore` ya dividió por 100; se reescala por el peso total.
  return Math.round(((totalValor * 100) / totalPeso) * 10) / 10;
}
