// backend/src/lib/fiscalYear.js
//
// Espejo de src/lib/fiscalYear.js del front y de los helpers que vivían
// sueltos dentro de Plantilla.model.js.
//
//   AF `year`  =  01/09/`year`  →  31/08/`year + 1`
//
// Existe porque el backend no tenía forma de responder "¿este año ya cerró?".
// Sin esa pregunta no se puede impedir que alguien escriba sobre un ejercicio
// terminado, que es exactamente lo que pasó con AF2025 en el Área Técnica.

/** Mes de inicio del año fiscal, índice 0-11 (8 = septiembre). */
export const FISCAL_START_MONTH = 8;

/**
 * Año fiscal al que pertenece una fecha.
 * De septiembre a diciembre es el año calendario; de enero a agosto, el anterior.
 */
export function anioFiscalActual(fecha = new Date()) {
  return fecha.getMonth() >= FISCAL_START_MONTH
    ? fecha.getFullYear()
    : fecha.getFullYear() - 1;
}

/**
 * Un año fiscal está cerrado cuando ya empezó el siguiente.
 *
 * Es deliberadamente una regla de calendario y no un flag que alguien tenga
 * que acordarse de marcar: los flags de cierre se olvidan, el almanaque no.
 * Si más adelante RRHH necesita cerrar antes o reabrir un ejercicio, esto es
 * el lugar donde se agrega la excepción, y sigue habiendo un solo lugar.
 */
export function anioFiscalCerrado(year, fecha = new Date()) {
  const n = Number(year);
  if (!Number.isFinite(n)) return false;
  return n < anioFiscalActual(fecha);
}

/** Etiqueta corta para mensajes de error legibles: `AF 2025/26`. */
export function etiquetaAnioFiscal(year) {
  return `AF ${year}/${String(Number(year) + 1).slice(-2)}`;
}

/** Primer día del año fiscal: 1 de septiembre de `year`. */
export function inicioAnioFiscal(year) {
  return new Date(Number(year), FISCAL_START_MONTH, 1);
}

/** Último instante del año fiscal: 31 de agosto de `year + 1`. */
export function finAnioFiscal(year) {
  return new Date(Number(year) + 1, FISCAL_START_MONTH - 1, 31, 23, 59, 59, 999);
}
