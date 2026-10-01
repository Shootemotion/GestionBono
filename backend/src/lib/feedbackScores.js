// backend/src/lib/feedbackScores.js
//
// Cálculo de la nota de un feedback, del lado del servidor.
//
// POR QUÉ EXISTE
// -------------
// Hasta ahora el backend NO calculaba esta nota. `saveFeedback` recibía
// `scores` en el body y lo guardaba tal cual —el comentario del código lo
// decía: "Scores calculated by frontend"—. Es decir: el número que se le
// comunica a la persona, el que queda congelado en su legajo y el que le gana
// al cálculo en vivo en todas las pantallas, lo decidía el navegador y nadie
// lo revisaba.
//
// La prueba de que no había ningún control: hay dos feedbacks CERRADOS con
// global 112 y 116,8. En una escala de 0 a 100.
//
// Este módulo replica exactamente lo que hace el front en
// `src/lib/scoreHelpers.js::calculatePeriodScores`, con las MISMAS funciones
// de `scoringCore.js` que el front importa. No es un motor nuevo: es el mismo
// cálculo, corriendo donde se puede verificar.
//
// PRIMERA ETAPA, A PROPÓSITO
// Hoy esto NO pisa el número del navegador. Valida el rango y deja constancia
// de las diferencias. Se hace así porque los resultados finales del AF2025 se
// están entregando ahora mismo: cambiar el número por debajo mientras alguien
// está comunicando notas sería peor que el problema que arregla. Medido sobre
// los 10 feedbacks en vuelo, front y back dan idéntico en los 10.

import { computeForEmployees } from "../controllers/dashboard.controller.js";
import { calculateObjectiveProgress, calculateCompetencyProgress } from "./scoringCore.js";

/**
 * Mes del año fiscal al que corresponde un período (1 = septiembre).
 * Copia exacta de la del front: si las dos no ordenan igual, los dos cálculos
 * recortan distinto y todo lo demás sobra.
 */
export function getPeriodMonth(periodStr) {
  if (!periodStr) return 0;
  if (periodStr === "Q1") return 3;
  if (periodStr === "Q2") return 6;
  if (periodStr === "Q3") return 9;
  if (periodStr === "FINAL") return 12;

  let suffix = periodStr;
  if (periodStr.length > 4 && !isNaN(periodStr.slice(0, 4))) suffix = periodStr.slice(4);

  if (suffix.startsWith("M")) {
    const m = parseInt(suffix.slice(1));
    return m >= 9 ? m - 8 : m + 4;
  }
  if (suffix.startsWith("Q")) return parseInt(suffix.slice(1)) * 3;
  if (suffix.startsWith("S")) return parseInt(suffix.slice(1)) * 6;
  if (suffix === "FINAL" || suffix.endsWith("FINAL")) return 12;
  return 12;
}

/**
 * Nota de un período a partir del payload del dashboard.
 *
 * Réplica de `calculatePeriodScores` del front. Objetivos aportan hasta 70 y
 * competencias hasta 30. La normalización divide por 100 fijo, no por la suma
 * de pesos: con los pesos sumando 100 —que es el estado correcto— las dos
 * reglas dan lo mismo, y dividir por 100 no le regala nota a nadie cuyos pesos
 * quedaron incompletos por un error de carga.
 */
export function calcularScoresPeriodo(data, periodo) {
  if (!data || !periodo) return { obj: 0, comp: 0, global: 0 };

  const limite = getPeriodMonth(periodo);
  const esCierreAnual = limite === 12 || periodo === "FINAL";

  const objetivos = data.objetivos?.items || data.objetivos || [];
  let totalObj = 0;

  for (const obj of objetivos) {
    const hitosDelPeriodo = (obj.hitos || []).filter((h) => getPeriodMonth(h.periodo) <= limite);
    if (hitosDelPeriodo.length === 0) continue;
    const progreso = calculateObjectiveProgress(obj, hitosDelPeriodo, esCierreAnual);
    totalObj += progreso * (obj.peso || 0);
  }

  const scoreObj = (totalObj / 100) * 0.7;
  const scoreComp = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, limite) * 0.3;

  return {
    obj: +scoreObj.toFixed(1),
    comp: +scoreComp.toFixed(1),
    global: +(scoreObj + scoreComp).toFixed(1),
  };
}

/** Calcula la nota de un empleado para un período, leyendo de la base. */
export async function calcularScoresEnBackend(empleadoId, anio, periodo) {
  const [data] = await computeForEmployees([empleadoId], Number(anio));
  if (!data) return null;
  return calcularScoresPeriodo(data, periodo);
}

/* ------------------------------------------------------------------ *
 * Validación de rango
 * ------------------------------------------------------------------ */

// Se deja medio punto de margen por el redondeo a un decimal de cada parte.
const MAX_OBJ = 70.5;
const MAX_COMP = 30.5;
const MAX_GLOBAL = 100.5;

/**
 * Motivos por los que una nota es imposible, o [] si está bien.
 *
 * No depende de ningún cálculo: son los límites de la escala. Un 116,8 no
 * necesita que nadie recalcule nada para saber que está mal.
 */
export function motivosFueraDeRango(scores) {
  if (!scores || typeof scores !== "object") return ["No se enviaron los puntajes."];

  const problemas = [];
  const rev = (nombre, valor, max) => {
    const n = Number(valor);
    if (valor == null) return;             // ausente es válido: no todos los guardados los traen
    if (!Number.isFinite(n)) problemas.push(`${nombre} no es un número (${valor}).`);
    else if (n < 0) problemas.push(`${nombre} no puede ser negativo (${n}).`);
    else if (n > max) problemas.push(`${nombre} no puede superar ${Math.floor(max)} (${n}).`);
  };

  rev("El puntaje de objetivos", scores.obj, MAX_OBJ);
  rev("El puntaje de competencias", scores.comp, MAX_COMP);
  rev("El puntaje global", scores.global, MAX_GLOBAL);

  return problemas;
}

/** Diferencia, en puntos de nota final, a partir de la cual vale la pena avisar. */
export const TOLERANCIA_DIVERGENCIA = 1;
