// backend/src/lib/tiempoEfectivo.js
//
// Cuánto tiempo del ciclo trabajó realmente una persona, y qué implica eso.
//
// POR QUÉ EXISTE
// -------------
// El bono ya prorratea por antigüedad y licencias —está en la política y en
// `bono.controller.js`— pero la EVALUACIÓN nunca miró la fecha de ingreso.
// Resultado: Olguin Oriana ingresó el 21/05, tiene 2 de 16 períodos cargados
// porque los otros 14 no existía en la empresa, y cerró el AF2025 con 37,8.
// Ese número no es un resultado de desempeño, es aritmética sobre catorce ceros
// que no cometió.
//
// De las 236 metas del sistema, 138 castigan a quien entra a mitad de ciclo sin
// que nadie lo haya decidido: 74 piden cumplir N períodos y 64 piden un total
// anual. Las otras 98 promedian lo cargado y no se ven afectadas.
//
// LA REGLA
// --------
// Los mismos cortes que la política de bonos, para que la empresa tenga una
// sola regla, pero con consecuencias distintas: no pagar un bono es una
// decisión de compensación; poner una nota que no corresponde es un error de
// cálculo. Por eso acá nadie queda sin evaluar — se evalúa con las metas
// ajustadas a su tiempo, y se marca que el ajuste fue automático.

import { anioFiscalCerrado } from "./fiscalYear.js";

/** Meses mínimos en el ciclo para tener nota comparable. Es el corte del bono. */
export const MESES_MINIMOS = 6;

/** Días de licencia a partir de los cuales se descuenta. Punto (d) de la política. */
export const DIAS_LICENCIA_TOLERADOS = 60;

/** Primer año fiscal con prorrateo. Mismo criterio que el resto de las correcciones. */
export const AF_PRORRATEO = 2026;

const inicioCiclo = (anio) => new Date(anio, 8, 1);
const finCiclo = (anio) => new Date(anio + 1, 7, 31, 23, 59, 59, 999);

/**
 * Lleva una fecha "sin hora" al mediodía local.
 *
 * Una fecha de ingreso se guarda como medianoche UTC. En UTC-3 eso se lee como
 * el día ANTERIOR a las 21:00, así que alguien que ingresó el 1 de noviembre
 * contaba como ingresado en octubre: un mes de más de antigüedad, y un período
 * de menos marcado como anterior a su ingreso.
 *
 * Mismo criterio que `empleados.controller.js` usa para la desvinculación.
 */
function aMediodiaLocal(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Medianoche UTC exacta = valor sin hora: se reinterpreta como día local.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0);
  }
  return d;
}

/**
 * Meses del ciclo que la persona estuvo en la empresa, de 0 a 12.
 *
 * Sin fecha de ingreso se asume el ciclo completo: es lo que pasaba antes y no
 * conviene que un dato faltante le baje la meta a nadie por accidente.
 */
export function mesesEnCiclo(fechaIngreso, anioFiscal) {
  if (!fechaIngreso) return 12;

  const ingreso = aMediodiaLocal(fechaIngreso);
  if (!ingreso) return 12;

  const inicio = inicioCiclo(anioFiscal);
  const fin = finCiclo(anioFiscal);

  if (ingreso <= inicio) return 12;   // ya estaba cuando arrancó el ciclo
  if (ingreso > fin) return 0;        // entró después de que terminó

  // Meses completos desde el ingreso hasta el cierre del ciclo.
  let meses = (fin.getFullYear() - ingreso.getFullYear()) * 12 + (fin.getMonth() - ingreso.getMonth());
  if (fin.getDate() < ingreso.getDate()) meses--;
  return Math.max(0, Math.min(12, meses + 1));
}

/** Días de licencia registrados dentro del ciclo. */
export function diasLicenciaEnCiclo(incidencias = [], anioFiscal) {
  const inicio = inicioCiclo(anioFiscal);
  const fin = finCiclo(anioFiscal);
  let dias = 0;

  for (const i of incidencias) {
    if (i?.tipo !== "LICENCIA" || !i.fechaHasta) continue;
    // Se recorta al ciclo: una licencia a caballo de dos años solo descuenta
    // los días que caen adentro.
    // Se cuentan días de CALENDARIO, no milisegundos: con las fechas llevadas
    // al mediodía, restar y dividir dejaba medio día suelto que redondeaba de más.
    const aDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const desde = aDia(new Date(Math.max(aMediodiaLocal(i.fecha) ?? inicio, inicio)));
    const hasta = aDia(new Date(Math.min(aMediodiaLocal(i.fechaHasta) ?? fin, fin)));
    if (hasta < desde) continue;
    dias += Math.round((hasta - desde) / 864e5) + 1;
  }
  return dias;
}

/**
 * El tiempo con el que se mide a esta persona en este ciclo.
 *
 * @returns {{meses:number, mesesPorIngreso:number, diasLicencia:number,
 *            parcial:boolean, prorratea:boolean, motivo:string|null}}
 */
export function tiempoEfectivo({ fechaIngreso, incidencias = [], anioFiscal }) {
  const mesesPorIngreso = mesesEnCiclo(fechaIngreso, anioFiscal);
  const diasLicencia = diasLicenciaEnCiclo(incidencias, anioFiscal);

  // La licencia descuenta solo a partir del tope tolerado, igual que el bono.
  const mesesLicencia = diasLicencia > DIAS_LICENCIA_TOLERADOS ? diasLicencia / 30.4 : 0;
  const meses = Math.max(0, Math.round((mesesPorIngreso - mesesLicencia) * 10) / 10);

  const motivos = [];
  if (mesesPorIngreso < 12) motivos.push(`ingresó durante el ciclo (${mesesPorIngreso} de 12 meses)`);
  if (mesesLicencia > 0) motivos.push(`${diasLicencia} días de licencia`);

  return {
    meses,
    mesesPorIngreso,
    diasLicencia,
    // `incompleto` es un HECHO: estuvo, pero no el ciclo entero. Vale para
    // cualquier año y solo sirve para contarlo.
    //
    // Con 0 meses no es un ciclo incompleto: esa persona no pertenece a este
    // año fiscal. Mostrarle "ciclo parcial" de un año en el que no trabajó
    // sería confundir "no corresponde" con "estuvo poco".
    incompleto: meses > 0 && meses < 12,
    // `parcial` es un JUICIO: estuvo, pero menos del mínimo, y su nota no se
    // compara con la de quien hizo el año completo.
    parcial: meses > 0 && meses < MESES_MINIMOS,
    // `prorratea` es una ACCIÓN: hay que ajustarle las metas. Esto sí está
    // acotado por año, porque cambia números.
    prorratea: meses < 12,
    motivo: motivos.length ? motivos.join(" y ") : null,
    periodosAplicables: periodosAplicables(mesesPorIngreso),
  };
}

/** Trimestres del ciclo, por el mes en que arrancan. */
const TRIMESTRES = [
  { periodo: "Q1", desde: 1 },   // sep-nov
  { periodo: "Q2", desde: 4 },   // dic-feb
  { periodo: "Q3", desde: 7 },   // mar-may
  { periodo: "FINAL", desde: 10 }, // jun-ago
];

/**
 * Los períodos de feedback que le correspondían a esta persona.
 *
 * Quien ingresó en marzo (mes 7 del ciclo) no podía tener un feedback de Q1:
 * no estaba. Contarlo como "sin enviar" acusa al jefe de no haber hecho algo
 * que no correspondía.
 *
 * Se cuenta un trimestre como suyo si estuvo presente en alguna parte de él.
 */
/**
 * Mes del ciclo en que TERMINA un período (1 = septiembre, 12 = agosto).
 *
 * Sirve para saber si un período quedó entero antes de que la persona entrara.
 * Devuelve null si el formato no se reconoce: ante la duda no se acusa a nadie.
 */
export function mesFinDePeriodo(periodo) {
  if (!periodo) return null;
  const s = String(periodo);
  if (s === "Q1") return 3;
  if (s === "Q2") return 6;
  if (s === "Q3") return 9;
  if (s === "FINAL") return 12;

  const suf = s.length > 4 && !isNaN(s.slice(0, 4)) ? s.slice(4) : s;
  if (suf.startsWith("M")) {
    const m = parseInt(suf.slice(1));
    if (!Number.isFinite(m)) return null;
    return m >= 9 ? m - 8 : m + 4;
  }
  if (suf.startsWith("Q")) return parseInt(suf.slice(1)) * 3 || null;
  if (suf.startsWith("S")) return parseInt(suf.slice(1)) * 6 || null;
  if (suf.startsWith("A")) return 12;
  return null;
}

/**
 * ¿Este período terminó antes de que la persona ingresara?
 *
 * Cargarle un resultado ahí no es un error de criterio, es un imposible: no
 * estaba. Hoy hay 56 evaluaciones así, y una de ellas llegó a convertirse en
 * un feedback cerrado con nota comunicada.
 *
 * @param {string} periodo        "2025M09", "2025Q1", "Q1", "FINAL"…
 * @param {number} mesesPorIngreso meses del ciclo que le tocaron por su ingreso
 */
export function esPeriodoAnteriorAlIngreso(periodo, mesesPorIngreso) {
  if (!Number.isFinite(mesesPorIngreso) || mesesPorIngreso >= 12) return false;
  const fin = mesFinDePeriodo(periodo);
  if (fin === null) return false;                 // formato desconocido: no se acusa
  const mesIngreso = mesesPorIngreso <= 0 ? 13 : 13 - mesesPorIngreso;
  return fin < mesIngreso;
}

export function periodosAplicables(mesesPorIngreso) {
  if (!Number.isFinite(mesesPorIngreso) || mesesPorIngreso >= 12) {
    return TRIMESTRES.map((t) => t.periodo);
  }
  if (mesesPorIngreso <= 0) return [];

  // Mes del ciclo en que ingresó: si trabajó 6 de 12, entró en el mes 7.
  const mesIngreso = 13 - mesesPorIngreso;
  return TRIMESTRES.filter((t) => t.desde + 2 >= mesIngreso).map((t) => t.periodo);
}

/**
 * Ajusta una meta al tiempo que la persona estuvo.
 *
 * Solo toca las dos familias que lo necesitan:
 *   · umbral de períodos: pedir 12 meses a quien trabajó 7 es imposible por
 *     definición, no un desempeño bajo.
 *   · acumulativa: un total anual sobre medio año arranca perdiendo.
 * Las de promedio no se tocan: ya promedian lo cargado y funcionan bien.
 *
 * Devuelve una COPIA. La original no se modifica, y el ajuste queda declarado
 * en `prorrateo` para que la pantalla pueda decir por qué la meta dice 7 y no 12.
 */
export function prorratearMeta(meta, meses) {
  if (!meta || !Number.isFinite(meses) || meses >= 12 || meses <= 0) return meta;

  const factor = meses / 12;
  const acumulativa = meta.acumulativa || meta.modoAcumulacion === "acumulativo";

  if (meta.reglaCierre === "umbral_periodos" && Number(meta.umbralPeriodos) > 0) {
    const original = Number(meta.umbralPeriodos);
    const ajustado = Math.max(1, Math.round(original * factor));
    if (ajustado === original) return meta;
    return {
      ...meta,
      umbralPeriodos: ajustado,
      prorrateo: { campo: "umbralPeriodos", original, ajustado, meses },
    };
  }

  if (acumulativa && Number.isFinite(Number(meta.esperado)) && Number(meta.esperado) !== 0) {
    const original = Number(meta.esperado);
    const ajustado = Math.round(original * factor * 100) / 100;
    if (ajustado === original) return meta;
    return {
      ...meta,
      esperado: ajustado,
      prorrateo: { campo: "esperado", original, ajustado, meses },
    };
  }

  return meta;
}

/**
 * ¿Corresponde prorratear en este año fiscal?
 *
 * Rige desde el AF2026. En el AF2025 las notas ya se comunicaron y los
 * feedbacks guardan su número: ajustar las metas ahora haría que el sistema
 * calculara distinto de lo que se le dijo a cada persona.
 */
export function aplicaProrrateo(anioFiscal) {
  return Number(anioFiscal) >= AF_PRORRATEO;
}

/** Ajusta todas las metas de un objetivo. Devuelve el objetivo sin tocar si no hay nada que hacer. */
export function prorratearObjetivo(objetivo, meses) {
  if (!objetivo?.metas?.length || meses >= 12) return objetivo;
  const metas = objetivo.metas.map((m) => prorratearMeta(m, meses));
  const hubo = metas.some((m, i) => m !== objetivo.metas[i]);
  return hubo ? { ...objetivo, metas, prorrateado: true } : objetivo;
}

export { anioFiscalCerrado };
