/**
 * Fuente única de verdad del AÑO FISCAL.
 *
 *   AF `year`  =  01/09/`year`  →  31/08/`year + 1`
 *
 * El número que se guarda en la base (Plantilla.year, BonoAnual.anio,
 * ObjetivoISO.year, …) es SIEMPRE el año de INICIO del ciclo. Estas funciones
 * solo traducen ese número a algo legible: no cambian la semántica ni el valor.
 *
 * Espejo de backend/src/models/Plantilla.model.js (getFiscalStart/getFiscalEnd).
 */

/** Mes de inicio del año fiscal, índice 0-11 (8 = septiembre). */
export const FISCAL_START_MONTH = 8;

/**
 * Año fiscal al que pertenece una fecha.
 * De septiembre a diciembre es el año calendario; de enero a agosto, el anterior.
 */
export const getCurrentFiscalYear = (date = new Date()) => {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();
  return month >= FISCAL_START_MONTH ? year : year - 1;
};

/** Primer día del año fiscal: 1 de septiembre de `year`. */
export const fiscalYearStart = (year) => new Date(year, FISCAL_START_MONTH, 1);

/** Último instante del año fiscal: 31 de agosto de `year + 1`. */
export const fiscalYearEnd = (year) =>
  new Date(year + 1, FISCAL_START_MONTH - 1, 31, 23, 59, 59, 999);

/**
 * Etiqueta corta para selectores y headers: `AF 2026/27`.
 * Es la forma canónica de mostrarle un año fiscal al usuario.
 */
export const fiscalYearLabel = (year) =>
  `AF ${year}/${String(year + 1).slice(-2)}`;

/** Igual que `fiscalYearLabel` pero sin el prefijo: `2026/27`. */
export const fiscalYearShort = (year) => `${year}/${String(year + 1).slice(-2)}`;

/** Rango explícito para tooltips y subtítulos: `1 sep 2026 – 31 ago 2027`. */
export const fiscalYearRange = (year) =>
  `1 sep ${year} – 31 ago ${year + 1}`;

/**
 * Trimestre fiscal (1-4) de una fecha.
 * Q1 sep-nov · Q2 dic-feb · Q3 mar-may · Q4 jun-ago
 */
export const fiscalQuarterOf = (date = new Date()) =>
  Math.floor(((date.getMonth() + 4) % 12) / 3) + 1;

/** Etiqueta de trimestre + año fiscal: `Q1 AF 2026/27`. */
export const fiscalQuarterLabel = (date = new Date()) =>
  `Q${fiscalQuarterOf(date)} ${fiscalYearLabel(getCurrentFiscalYear(date))}`;

/* ─────────────────────────────────────────────────────────────────────────
   PERÍODOS DENTRO DEL AÑO FISCAL

   Los hitos guardan `periodo` (2026M09, 2026Q1, 2026S1, 2026FINAL…) y una
   `fecha` que es el INICIO del período, no su vencimiento. Estos helpers
   traducen el `periodo` — que es el dato inequívoco — a las tres fechas que
   importan, para que nadie más tenga que reimplementar el calendario fiscal.

   Trimestres: Q1 sep-nov · Q2 dic-feb · Q3 mar-may · Q4 jun-ago
   Semestres:  S1 sep-feb · S2 mar-ago
   Vencimiento: día 10 del mes siguiente al cierre del período.
   ───────────────────────────────────────────────────────────────────────── */

/** Día 10 del mes siguiente al cierre: plazo para cargar la evaluación. */
const DIA_VENCIMIENTO = 10;

const finDeMes = (y, mIdx) => new Date(y, mIdx + 1, 0, 23, 59, 59, 999);
const claveMes = (d) =>
  `${d.getFullYear()}M${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Traduce un `periodo` de hito a sus fechas fiscales.
 *
 * @param {string} periodo      "2026M09" | "2026Q1" | "2026S1" | "2026A1" |
 *                              "2026FINAL", o las formas cortas "Q1" / "FINAL".
 * @param {number} [anioFiscal] Año fiscal de referencia para las formas cortas.
 * @returns {{tipo, anioFiscal, inicio, fin, vencimiento, columna}|null}
 *   `inicio`/`fin` acotan lo que el período mide; `vencimiento` es el plazo
 *   para evaluarlo; `columna` es la clave de mes donde el hito debe dibujarse.
 */
export function parseFiscalPeriod(periodo, anioFiscal) {
  if (!periodo) return null;
  const p = String(periodo).trim().toUpperCase();

  const conAnio = p.match(/^(\d{4})(M\d{1,2}|Q[1-4]|S[1-2]|A\d+|FINAL)$/);
  const corto = p.match(/^(M\d{1,2}|Q[1-4]|S[1-2]|A\d+|FINAL)$/);
  if (!conAnio && !corto) return null;

  const cuerpo = conAnio ? conAnio[2] : corto[1];
  // En "2026M09" el año es el CALENDARIO del mes; en el resto, el año FISCAL.
  const anioEtiqueta = conAnio ? Number(conAnio[1]) : Number(anioFiscal);
  if (!Number.isFinite(anioEtiqueta)) return null;

  // ── Mensual: el período es el mes propio ──────────────────────────────
  if (cuerpo.startsWith("M")) {
    const mes = Number(cuerpo.slice(1)); // 1-12
    if (!(mes >= 1 && mes <= 12)) return null;
    const mIdx = mes - 1;
    const inicio = new Date(anioEtiqueta, mIdx, 1);
    return {
      tipo: "M",
      anioFiscal: getCurrentFiscalYear(inicio),
      inicio,
      fin: finDeMes(anioEtiqueta, mIdx),
      vencimiento: new Date(anioEtiqueta, mIdx + 1, DIA_VENCIMIENTO, 23, 59, 59, 999),
      // La mensual se dibuja en SU mes: la columna dice qué mide, no cuándo vence.
      columna: `${anioEtiqueta}M${String(mes).padStart(2, "0")}`,
    };
  }

  // ── Trimestral / semestral / anual: arrancan desde el inicio fiscal ────
  const fy = anioEtiqueta;
  let offset; // meses desde septiembre
  let largo;  // duración en meses

  if (cuerpo.startsWith("Q")) {
    offset = (Number(cuerpo.slice(1)) - 1) * 3;
    largo = 3;
  } else if (cuerpo.startsWith("S")) {
    offset = (Number(cuerpo.slice(1)) - 1) * 6;
    largo = 6;
  } else {
    offset = 0;
    largo = 12; // anual y FINAL cubren el año fiscal completo
  }

  const mIdxInicio = FISCAL_START_MONTH + offset; // puede pasar de 11: Date normaliza
  const inicio = new Date(fy, mIdxInicio, 1);
  const fin = finDeMes(fy, mIdxInicio + largo - 1);
  const vencimiento = new Date(fy, mIdxInicio + largo, DIA_VENCIMIENTO, 23, 59, 59, 999);

  return {
    tipo: cuerpo.startsWith("Q") ? "Q" : cuerpo.startsWith("S") ? "S" : "A",
    anioFiscal: fy,
    inicio,
    fin,
    vencimiento,
    // Estas se dibujan en el mes en que hay que evaluarlas, no en el que abren.
    columna: claveMes(vencimiento),
  };
}

/**
 * Estado de un hito según el calendario, sin mirar su carga.
 * @returns {"futuro"|"por_vencer"|"vencido"}
 */
export function fiscalPeriodStatus(rango, ahora = new Date()) {
  if (!rango) return "futuro";
  if (ahora < rango.inicio) return "futuro";
  if (ahora > rango.vencimiento) return "vencido";
  return "por_vencer"; // abierto: se está midiendo o está en plazo de carga
}
