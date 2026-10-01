// backend/src/reportes/pdf.js
//
// PDF del reporte de desempeño. Tres diseños distintos según el nivel:
//
//   NÓMINA    panorama: macro de toda la nómina, ranking por empleado y
//             comparativa entre áreas. No baja al detalle de cada objetivo,
//             porque con 79 personas sería ilegible.
//   ÁREA      macro del área + tabla de su gente + la ficha de cada uno.
//   EMPLEADO  ficha completa: macro por período, cada objetivo con sus metas
//             período a período, cada competencia, y los comentarios.
//
// En los tres niveles se muestran SIEMPRE objetivos y competencias por
// separado además del global: ver solo el global no deja saber de qué lado
// viene el número.
//
// CODIFICACIÓN: pdfkit usa las fuentes estándar del PDF (Helvetica), que
// codifican en WinAnsi. Cualquier carácter fuera de ese juego —la "Σ", flechas,
// símbolos de advertencia— sale como basura ilegible. Todo texto pasa por
// txt(), que los reemplaza por equivalentes ASCII.

import PDFDocument from "pdfkit";
import { PERIODOS_FEEDBACK } from "./dataset.js";

const AZUL = "#1e3a8a";
const AZUL_CLARO = "#e0e7ff";
const GRIS = "#64748b";
const GRIS_SUAVE = "#f1f5f9";
const BORDE = "#cbd5e1";
const ROJO = "#b91c1c";
const VERDE = "#047857";
const TINTA = "#0f172a";

const MARGEN = 34;

/* ── Saneado de texto para las fuentes estándar del PDF ── */
const REEMPLAZOS = [
  [/[ΣΣ]/g, "Suma "], [/[⚠️⚠]/g, "(!)"], [/[✓✔]/g, "OK"], [/[✗✘]/g, "X"],
  [/[–—]/g, "-"], [/[·•]/g, "-"], [/[“”]/g, '"'], [/[‘’]/g, "'"],
  [/…/g, "..."], [/[→⇒]/g, "->"], [/≠/g, "!="], [/≥/g, ">="], [/≤/g, "<="],
];
function txt(v) {
  let s = String(v ?? "").replace(/\r\n?/g, "\n");
  for (const [re, rep] of REEMPLAZOS) s = s.replace(re, rep);
  // Red de seguridad: fuera lo que no entre en WinAnsi (latin-1 + comunes).
  // El salto de línea se conserva: los comentarios del feedback vienen con
  // varios renglones y sin esto las frases quedaban pegadas entre sí.
  return s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

/** Igual que txt(), pero en una sola línea: para celdas de tabla. */
const txt1 = (v) => txt(v).replace(/\n+/g, "  ");

/**
 * Recorta un texto para que entre en `ancho` puntos, midiéndolo con la fuente
 * activa. Recortar por cantidad de caracteres no alcanzaba: "% de desvío
 * detectado en cada auditoría" tiene los mismos caracteres que un texto mucho
 * más angosto, y terminaba desbordando sobre la fila de abajo.
 */
function ajustar(doc, texto, anchoDisp) {
  const s = txt1(texto);
  if (anchoDisp <= 0) return "";
  if (doc.widthOfString(s) <= anchoDisp) return s;
  const puntos = doc.widthOfString("...");
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(s.slice(0, mid)) + puntos <= anchoDisp) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? s.slice(0, lo).trimEnd() + "..." : "";
}

const n1 = (v) => (v === null || v === undefined ? "-" : Number(v).toFixed(1));
const pct = (v) => (v === null || v === undefined ? "-" : `${Number(v).toFixed(1)}%`);
const fch = (d) => (d ? new Date(d).toLocaleDateString("es-AR") : "-");
const corta = (s, n) => {
  const t = txt1(s);
  return t.length > n ? t.slice(0, n - 1) + "..." : t;
};
/** Los períodos vienen como "2025Q1" / "2025M09"; en la tabla sobra el año. */
const periodoCorto = (p) => txt(p).replace(/^\d{4}/, "");

function nuevoDoc() {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGEN, bufferPages: true });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const listo = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  return { doc, listo };
}

const ancho = (doc) => doc.page.width - MARGEN * 2;
const pieY = (doc) => doc.page.height - MARGEN - 14;

/* ───────────────────────── Grilla de columnas ─────────────────────────
 *
 * TODAS las tablas de la ficha de una persona comparten estas medidas. Antes
 * cada una calculaba las suyas: el bloque de resultados por período dejaba
 * 334 pt para la etiqueta, el resumen de objetivos 484 y el detalle mensual
 * 165. Con tres anchos distintos, nada alineaba verticalmente y los valores
 * quedaban desparramados por la hoja.
 *
 * Ahora la zona de valores arranca SIEMPRE en el mismo x. Se lee la hoja de
 * arriba abajo y las columnas se corresponden.
 *
 *   |<-- ETIQUETA -->|<-- DETALLE -->|<- CFG ->|<------ VALORES ------>|
 */
const GRID = {
  etiqueta: 232,   // nombre del objetivo / de la competencia / de la medida
  detalle: 150,    // nombre de la meta (vacío donde no aplica)
  config: 62,      // esperado + operador (vacío donde no aplica)
};
GRID.izquierda = GRID.etiqueta + GRID.detalle + GRID.config;

/** Ancho de cada casillero de la zona de valores, para `n` columnas. */
const anchoValor = (doc, n) => (n > 0 ? (ancho(doc) - GRID.izquierda) / n : 0);

/* ───────────────────────── Escala para entrar en una hoja ─────────────────
 *
 * La ficha de una persona tiene que ocupar UNA página: si se parte, el lector
 * pierde de vista la nota mientras mira el detalle, que es justo la comparación
 * que necesita hacer.
 *
 * Como la cantidad de objetivos, metas y competencias cambia por persona, no
 * alcanza con un tamaño fijo. Se estima cuánto va a ocupar la ficha y, si no
 * entra, se achica la tipografía de forma pareja hasta que entre. Con poca
 * gente cargada queda en tamaño normal; con muchos objetivos se comprime.
 */
let ESCALA = 1;
const ESCALA_MINIMA = 0.62;

/** Aplica la escala vigente a un tamaño de fuente. */
const fs = (n) => Math.max(4.6, n * ESCALA);

/**
 * Alto que va a ocupar la ficha a escala 1, en puntos.
 *
 * Las alturas salen de `tabla()`: una fila mide `fuente + 6` (o `+ 4` si es
 * compacta). Los subtítulos y las notas se cuentan aparte porque no son tabla.
 * Al final se agrega un 8% de holgura: quedarse corto significa partir la hoja,
 * que es justo lo que se quiere evitar; pasarse solo achica un poco de más.
 */
function altoDeFicha(e) {
  const FILA_NORMAL = 8 + 6;     // tablas con fuente 8 (macro, resumen de objetivos)
  const FILA_COMPACTA = 7.5 + 4; // tablas de valores y competencias
  const SUBTITULO = 15;
  const NOTA = 13;

  let alto = 0;
  let subtitulos = 0;
  let notas = 0;

  // Bloque macro: objetivos, competencias, global, estado, evaluador + cabecera
  alto += 6 * FILA_NORMAL;
  subtitulos += 1;
  notas += 1; // "avance cargado hasta hoy"

  // Resumen de objetivos + cabecera
  alto += (e.objetivos.length + 1) * FILA_NORMAL;
  subtitulos += 1;

  // Una tabla de valores por frecuencia con datos
  const grupos = e.periodosObjetivos?.grupos || {};
  for (const [, periodos] of Object.entries(grupos)) {
    if (!periodos.length) continue;
    let metas = 0;
    for (const o of e.objetivos) {
      metas += (o.metas || []).filter((m) =>
        m.resultados.some((r) => periodos.includes(r.periodo))).length;
    }
    if (metas > 0) {
      alto += (metas + 1) * FILA_COMPACTA;
      subtitulos += 1;
    }
  }
  notas += 1; // "verde = cumple..."

  // Competencias + cabecera
  alto += (e.competencias.length + 1) * FILA_COMPACTA;
  subtitulos += 1;

  alto += subtitulos * SUBTITULO + notas * NOTA;
  return alto * 1.08;
}

/**
 * Escala con la que la ficha de `e` entra en lo que queda de página.
 * 1 = tamaño normal; menos, comprimida.
 *
 * Se mide desde `doc.y`, no desde el borde: cuando la ficha va sola en el
 * documento arrancá más abajo, porque arriba está el título del reporte.
 */
function escalaParaUnaHoja(doc, e, { conTitulo = true } = {}) {
  // Se llama ANTES de dibujar el encabezado de la persona, así que su alto se
  // descuenta a mano: 38 pt la banda con nombre y puesto, 14 pt la línea suelta.
  const encabezado = conTitulo ? 38 : 14;
  // Se reservan 24 pt al pie para el aviso de dónde están los comentarios.
  // Sin esa reserva el contenido llegaba hasta el borde y era el propio aviso
  // el que empujaba una segunda hoja.
  const disponible = pieY(doc) - doc.y - encabezado - 24;
  const alto1 = altoDeFicha(e);
  if (alto1 <= disponible) return 1;
  return Math.max(ESCALA_MINIMA, disponible / alto1);
}

function espacio(doc, alto) {
  if (doc.y + alto > pieY(doc)) doc.addPage();
}

/* ───────────────────────── Tipografía ───────────────────────── */

function tituloDoc(doc, titulo, sub) {
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(17).text(txt(titulo), { width: ancho(doc) });
  if (sub) {
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5).text(txt(sub), { width: ancho(doc) });
  }
  doc.moveTo(MARGEN, doc.y + 4).lineTo(doc.page.width - MARGEN, doc.y + 4)
    .lineWidth(1.2).strokeColor(AZUL).stroke();
  doc.y += 10;
}

/** Título de una persona o área dentro del documento. */
function tituloSeccion(doc, titulo, sub) {
  espacio(doc, 54);
  const y = doc.y;
  doc.rect(MARGEN, y, ancho(doc), sub ? 30 : 21).fill(AZUL_CLARO);
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(12).text(txt(titulo), MARGEN + 8, y + 5, {
    width: ancho(doc) - 16, lineBreak: false, ellipsis: true,
  });
  if (sub) {
    doc.fillColor(GRIS).font("Helvetica").fontSize(8).text(txt(sub), MARGEN + 8, y + 19, {
      width: ancho(doc) - 16, lineBreak: false, ellipsis: true,
    });
  }
  doc.y = y + (sub ? 30 : 21) + 8;
}

function subtitulo(doc, texto) {
  espacio(doc, 30 * ESCALA);
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(fs(9)).text(txt(texto), MARGEN, doc.y);
  doc.y += 3 * ESCALA;
}

function nota(doc, texto) {
  espacio(doc, 18 * ESCALA);
  doc.fillColor(GRIS).font("Helvetica-Oblique").fontSize(fs(7.5))
    .text(txt1(texto), MARGEN, doc.y, { width: ancho(doc) });
  doc.y += 3 * ESCALA;
}

/* ───────────────────────── Tabla ───────────────────────── */

/**
 * @param {Array<{t:string,w:number,a?:'l'|'r'|'c'}>} cols
 * @param {Array<Array<string|{v:any,color?:string,bold?:boolean,fondo?:string}>>} filas
 */
function tabla(doc, cols, filas, { fuente: fuenteBase = 7.5, compacta = false } = {}) {
  const fuente = fs(fuenteBase);
  const alto = fuente + (compacta ? 4 : 6) * ESCALA;
  const x0 = MARGEN;
  const total = cols.reduce((a, c) => a + c.w, 0);

  const cabecera = () => {
    espacio(doc, alto * 2);
    const y = doc.y;
    doc.rect(x0, y, total, alto).fill(AZUL);
    let x = x0;
    doc.font("Helvetica-Bold").fontSize(fuente).fillColor("#ffffff");
    for (const c of cols) {
      doc.text(ajustar(doc, c.t, c.w - 6), x + 3, y + (alto - fuente) / 2, {
        width: c.w - 6, align: c.a === "r" ? "right" : c.a === "c" ? "center" : "left",
        lineBreak: false,
      });
      x += c.w;
    }
    doc.y = y + alto;
  };

  cabecera();

  filas.forEach((fila, i) => {
    if (doc.y + alto > pieY(doc)) { doc.addPage(); cabecera(); }
    const y = doc.y;
    const fondoFila = fila.find((c) => typeof c === "object" && c?.fondo)?.fondo;
    if (fondoFila) doc.rect(x0, y, total, alto).fill(fondoFila);
    else if (i % 2 === 1) doc.rect(x0, y, total, alto).fill("#f8fafc");

    let x = x0;
    fila.forEach((celda, j) => {
      const c = cols[j];
      if (!c) return;
      const o = typeof celda === "object" && celda !== null ? celda : { v: celda };
      doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fuente).fillColor(o.color || TINTA);
      doc.text(ajustar(doc, o.v, c.w - 6), x + 3, y + (alto - fuente) / 2, {
        width: c.w - 6, align: c.a === "r" ? "right" : c.a === "c" ? "center" : "left",
        lineBreak: false,
      });
      x += c.w;
    });
    doc.y = y + alto;
  });

  doc.fillColor(TINTA);
  doc.y += 6;
}

/* ─────────────── Bloque macro: obj / comp / global ─────────────── */

/**
 * La medida macro. Es el bloque que se repite en los tres niveles: para un
 * empleado son sus notas; para un área o la nómina, el promedio de su gente.
 */
function bloqueMacro(doc, promedios, { avanceObj = null, avanceComp = null, estados = null, evaluadores = null } = {}) {
  // La etiqueta ocupa las tres columnas izquierdas de la grilla y los cuatro
  // períodos caen dentro de la zona de valores. Así el Q1 de este bloque queda
  // sobre el Q1 de la tabla de competencias, y el FINAL sobre el FINAL.
  const wPeriodo = anchoValor(doc, PERIODOS_FEEDBACK.length);

  const fila = (etiqueta, clave, destacada) =>
    [
      { v: etiqueta, bold: destacada },
      ...PERIODOS_FEEDBACK.map((p) => ({
        v: n1(promedios?.[p]?.[clave]),
        a: "c",
        bold: destacada,
        color: destacada ? AZUL : TINTA,
      })),
    ];

  tabla(doc,
    [
      { t: "Medida", w: GRID.izquierda },
      ...PERIODOS_FEEDBACK.map((p) => ({ t: p, w: wPeriodo, a: "c" })),
    ],
    [
      fila("Objetivos (aporta hasta 70)", "obj", false),
      fila("Competencias (aporta hasta 30)", "comp", false),
      fila("GLOBAL", "global", true),
      ...(estados ? [[
        { v: "Estado del feedback", color: GRIS },
        ...PERIODOS_FEEDBACK.map((p) => ({ v: estados[p] || "-", a: "c", color: GRIS })),
      ]] : []),
      // Quién hizo la evaluación de ese período. Sale de creadoPor del feedback.
      ...(evaluadores ? [[
        { v: "Evaluado por", color: GRIS },
        ...PERIODOS_FEEDBACK.map((p) => ({ v: corta(evaluadores[p] || "-", 22), a: "c", color: GRIS })),
      ]] : []),
    ],
    { fuente: 8 }
  );

  if (avanceObj !== null || avanceComp !== null) {
    nota(doc,
      `Avance cargado hasta hoy (no es la nota del feedback): objetivos ${pct(avanceObj)} - competencias ${pct(avanceComp)}.`);
  }
}

/* ─────────────── Detalle de objetivos de un empleado ─────────────── */

function detalleObjetivos(doc, e) {
  const aviso = e.sumaPesoObjetivos !== 100 && e.objetivos.length
    ? `  (!) los pesos suman ${e.sumaPesoObjetivos}%, no 100%`
    : "";
  subtitulo(doc, `Objetivos - ${e.objetivos.length} asignados, suma de pesos ${e.sumaPesoObjetivos}%${aviso}`);

  if (!e.objetivos.length) {
    nota(doc, "Sin objetivos asignados en este año fiscal.");
    return;
  }

  // Resumen: un renglón por objetivo, con su avance. Es el "resultado de cada
  // objetivo en particular" a nivel macro.
  //
  // El nombre ocupa las dos primeras columnas de la grilla y los cuatro
  // números caen en la zona de valores, alineados con los períodos de arriba.
  const wNum = anchoValor(doc, 4);
  tabla(doc,
    [
      { t: "Objetivo", w: GRID.etiqueta + GRID.detalle },
      { t: "Regla de cierre", w: GRID.config },
      { t: "Peso", w: wNum, a: "c" },
      { t: "Avance", w: wNum, a: "c" },
      { t: "Aporta", w: wNum, a: "c" },
      { t: "Metas", w: wNum, a: "c" },
    ],
    e.objetivos.map((o) => [
      { v: o.nombre, bold: true },
      { v: o.reglaCierre || "promedio", color: GRIS },
      { v: `${o.peso}%`, a: "c" },
      { v: pct(o.progreso), a: "c", bold: true, color: o.progreso >= 100 ? VERDE : o.progreso < 60 ? ROJO : TINTA },
      { v: o.progreso == null ? "-" : n1((o.progreso * o.peso) / 100), a: "c", color: GRIS },
      { v: String((o.metas || []).length), a: "c", color: GRIS },
    ]),
    { fuente: 8 }
  );

  // Detalle: cada meta con su valor período a período, UNA TABLA POR
  // FRECUENCIA. Mezclar meses y trimestres en la misma tabla dejaba casi todo
  // en guiones, porque cada objetivo vive en una sola frecuencia.
  const grupos = e.periodosObjetivos?.grupos || {};
  const hayAlgo = Object.values(grupos).some((g) => g.length);
  if (!hayAlgo) return;

  for (const [frecuencia, periodos] of ordenarGrupos(grupos)) {
    // Solo las metas que efectivamente tienen hitos en esta frecuencia.
    const filas = [];
    for (const o of e.objetivos) {
      const metasAqui = (o.metas || []).filter((m) =>
        m.resultados.some((r) => periodos.includes(r.periodo)));
      if (!metasAqui.length) continue;
      metasAqui.forEach((m, i) => {
        const valores = new Map(m.resultados.map((r) => [r.periodo, r]));
        filas.push([
          i === 0 ? { v: o.nombre, bold: true } : "",
          m.nombre,
          { v: `${m.operador || ""} ${m.esperado ?? ""}`.trim() || "-", a: "r", color: GRIS },
          ...periodos.map((p) => {
            const r = valores.get(p);
            if (!r || r.resultado === null || r.resultado === undefined) {
              return { v: "-", a: "r", color: BORDE };
            }
            return {
              v: String(r.resultado), a: "r",
              color: r.cumple === false ? ROJO : r.cumple === true ? VERDE : TINTA,
            };
          }),
        ]);
      });
    }
    if (!filas.length) continue;

    subtitulo(doc, `Valores cargados - seguimiento ${ETIQUETA_FRECUENCIA[frecuencia] || frecuencia}`);
    tabla(doc,
      [
        { t: "Objetivo", w: GRID.etiqueta },
        { t: "Meta", w: GRID.detalle },
        { t: "Esperado", w: GRID.config, a: "c" },
        ...periodos.map((p) => ({ t: periodoCorto(p), w: anchoValor(doc, periodos.length), a: "c" })),
      ],
      filas,
      { fuente: 7, compacta: true }
    );
  }
  nota(doc, "Verde = cumple, rojo = no cumple, guion = sin cargar.");
}

const ETIQUETA_FRECUENCIA = {
  mensual: "mensual", trimestral: "trimestral", semestral: "semestral", anual: "anual",
};
const ORDEN_FRECUENCIA = ["mensual", "trimestral", "semestral", "anual"];
const ordenarGrupos = (grupos) =>
  ORDEN_FRECUENCIA
    .filter((f) => grupos[f]?.length)
    .map((f) => [f, grupos[f]]);

/* ─────────────── Detalle de competencias ─────────────── */

function detalleCompetencias(doc, e) {
  const aviso = e.sumaPesoCompetencias !== 100 && e.competencias.length
    ? `  (!) los pesos suman ${e.sumaPesoCompetencias}%, no 100%`
    : "";
  subtitulo(doc, `Competencias - ${e.competencias.length} asignadas, suma de pesos ${e.sumaPesoCompetencias}%${aviso}`);

  if (!e.competencias.length) {
    nota(doc, "Sin competencias asignadas en este año fiscal.");
    return;
  }

  const periodos = e.periodosCompetencias?.todos || [];
  // Misma grilla: nombre + peso a la izquierda, los períodos en la zona de
  // valores. El promedio va como una columna más de esa zona.
  const wPer = anchoValor(doc, periodos.length + 1);

  tabla(doc,
    [
      { t: "Competencia", w: GRID.etiqueta + GRID.detalle },
      { t: "Peso", w: GRID.config, a: "c" },
      ...periodos.map((p) => ({ t: periodoCorto(p), w: wPer, a: "c" })),
      { t: "Promedio", w: wPer, a: "c" },
    ],
    e.competencias.map((c) => {
      const valores = new Map(c.resultados.map((r) => [r.periodo, r.puntuacion]));
      return [
        c.nombre,
        { v: `${c.peso}%`, a: "c" },
        ...periodos.map((p) => {
          const v = valores.get(p);
          return v === null || v === undefined ? { v: "-", a: "c", color: BORDE } : { v: String(v), a: "c" };
        }),
        { v: pct(c.puntuacion), a: "c", bold: true, color: c.puntuacion >= 80 ? VERDE : c.puntuacion < 60 ? ROJO : TINTA },
      ];
    }),
    { fuente: 7.5, compacta: true }
  );
}

/* ─────────────── Comentarios ─────────────── */

/**
 * Recorta un texto para que su altura entre en `alto` puntos.
 *
 * Hace falta porque un comentario es texto libre y `doc.text()` con `width`
 * envuelve hasta donde haga falta, agregando páginas por su cuenta. Medir
 * antes de escribir es la única forma de respetar un presupuesto de alto.
 */
function recortarAAlto(doc, texto, anchoDisp, alto) {
  const s = txt(texto);
  const medir = (t) => doc.heightOfString(t, { width: anchoDisp });
  if (medir(s) <= alto) return s;

  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (medir(s.slice(0, mid) + "...") <= alto) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? s.slice(0, lo).trimEnd() + "..." : "";
}

function detalleComentarios(doc, e, { limite = null } = {}) {
  const conTexto = PERIODOS_FEEDBACK
    .map((p) => [p, e.feedback[p]])
    .filter(([, f]) => f && (f.comentario || f.comentarioEmpleado || f.comentarioRRHH || f.motivoDesacuerdo));
  if (!conTexto.length) return;

  const tope = limite === null ? null : doc.y + limite;
  subtitulo(doc, "Comentarios del feedback");

  const w = ancho(doc) - 16;
  let cortado = false;

  /** Escribe un comentario respetando el presupuesto; devuelve false si ya no entra. */
  const escribir = (rot, texto, color) => {
    if (!texto) return true;
    doc.font("Helvetica").fontSize(fs(7.5));

    if (tope === null) {
      espacio(doc, 16);
    } else {
      // Se descuenta un renglón: el texto se escribe a continuación de la
      // etiqueta ("Jefe: "), así que arranca corrido y puede necesitar una
      // línea más de la que mide por sí solo.
      const disponible = tope - doc.y - 11;
      if (disponible < 12) { cortado = true; return false; }
      texto = recortarAAlto(doc, texto, w, disponible);
      if (!texto) { cortado = true; return false; }
    }

    doc.font("Helvetica-Bold").fontSize(fs(7.5)).fillColor(color || GRIS)
      .text(`${rot}: `, MARGEN + 8, doc.y, { continued: true });
    doc.font("Helvetica").fillColor(TINTA).text(txt(texto), { width: w });
    return true;
  };

  for (const [p, f] of conTexto) {
    if (tope !== null && doc.y > tope - 22) { cortado = true; break; }
    if (tope === null) espacio(doc, 34);

    doc.font("Helvetica-Bold").fontSize(fs(8)).fillColor(AZUL).text(txt(p), MARGEN, doc.y);

    let sigue = true;
    for (const [rot, t] of [["Jefe", f.comentario], ["Empleado", f.comentarioEmpleado], ["RRHH", f.comentarioRRHH]]) {
      sigue = escribir(rot, t, GRIS);
      if (!sigue) break;
    }
    if (sigue && f.motivoDesacuerdo) sigue = escribir("Desacuerdo", f.motivoDesacuerdo, ROJO);
    if (!sigue) break;

    doc.y += 4 * ESCALA;
  }

  if (cortado) {
    doc.font("Helvetica-Oblique").fontSize(fs(7)).fillColor(GRIS)
      .text(txt("(...) Los comentarios completos están en la exportación a Excel."), MARGEN, doc.y, {
        width: ancho(doc), lineBreak: false, ellipsis: true,
      });
  }
  doc.fillColor(TINTA);
}

/* ─────────────── Nivel EMPLEADO ─────────────── */

/**
 * Ficha de una persona. Con `unaHoja` se comprime para entrar en una página:
 * partir la ficha obliga a dar vuelta la hoja para comparar la nota con el
 * detalle que la explica, que es justamente lo que uno mira.
 */
function fichaEmpleado(doc, e, { salto = false, conComentarios = true, conTitulo = true, unaHoja = false } = {}) {
  if (salto) doc.addPage();
  ESCALA = unaHoja ? escalaParaUnaHoja(doc, e, { conTitulo }) : 1;

  const refTexto = e.referentes?.length
    ? `Referente ${e.referenteOrigen}: ${e.referentes.join(" / ")}`
    : "Sin referente asignado";
  const sub = [e.puesto, e.area, e.sector, refTexto].filter(Boolean).join("  -  ");
  if (conTitulo) {
    tituloSeccion(doc, e.nombreCompleto, sub);
  } else {
    // El título del documento ya nombra a esta persona; repetirlo acá sobra.
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5).text(txt1(sub), MARGEN, doc.y, {
      width: ancho(doc), lineBreak: false, ellipsis: true,
    });
    doc.y += 14;
  }

  const estados = {};
  const evaluadores = {};
  const promedios = {};
  for (const p of PERIODOS_FEEDBACK) {
    const f = e.feedback[p];
    promedios[p] = { obj: f?.obj ?? null, comp: f?.comp ?? null, global: f?.global ?? null };
    estados[p] = f?.estadoLabel || "sin feedback";
    evaluadores[p] = f?.evaluador || "-";
  }

  subtitulo(doc, "Resultado por período (nota del feedback)");
  bloqueMacro(doc, promedios, {
    estados,
    evaluadores,
    avanceObj: promediar(e.objetivos.map((o) => o.progreso)),
    avanceComp: promediar(e.competencias.map((c) => c.puntuacion)),
  });

  detalleObjetivos(doc, e);
  detalleCompetencias(doc, e);

  // Los comentarios son texto libre y no se pueden comprimir sin volverlos
  // ilegibles. Si no entran en lo que queda de hoja, se dice dónde están en vez
  // de romper la promesa de una página por persona.
  if (conComentarios) {
    if (unaHoja) {
      // Se reservan 6 pt para que el último renglón no roce el pie.
      const quedan = pieY(doc) - doc.y - 6;
      if (quedan > 80) detalleComentarios(doc, e, { limite: quedan });
      // El aviso también ocupa: si no entra, se calla. Avisar dónde están los
      // comentarios no vale una segunda hoja.
      else if (tieneComentarios(e) && quedan > 20) {
        nota(doc, "Los comentarios del feedback están en la exportación a Excel.");
      }
    } else {
      detalleComentarios(doc, e);
    }
  }

  ESCALA = 1;
}

const tieneComentarios = (e) => PERIODOS_FEEDBACK.some((p) => {
  const f = e.feedback[p];
  return f && (f.comentario || f.comentarioEmpleado || f.comentarioRRHH || f.motivoDesacuerdo);
});

const promediar = (v) => {
  const l = v.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10 : null;
};

/* ─────────────── Tabla resumen de personas ─────────────── */

function tablaPersonas(doc, empleados, { conArea = false } = {}) {
  const w = ancho(doc);
  const wNombre = conArea ? 130 : 160;
  const wArea = conArea ? 105 : 0;
  const wPesos = 42;
  const wPeriodo = (w - wNombre - wArea - wPesos) / PERIODOS_FEEDBACK.length;
  const tercio = wPeriodo / 3;

  const cols = [
    { t: "Empleado", w: wNombre },
    ...(conArea ? [{ t: "Area", w: wArea }] : []),
    { t: "Pesos", w: wPesos, a: "r" },
  ];
  for (const p of PERIODOS_FEEDBACK) {
    cols.push({ t: `${p} obj`, w: tercio, a: "r" });
    cols.push({ t: `${p} comp`, w: tercio, a: "r" });
    cols.push({ t: `${p} glob`, w: tercio, a: "r" });
  }

  const filas = empleados.map((e) => {
    const fila = [
      { v: corta(e.nombreCompleto, conArea ? 30 : 38), bold: true },
      ...(conArea ? [{ v: corta(e.area, 24), color: GRIS }] : []),
      {
        v: e.objetivos.length ? `${e.sumaPesoObjetivos}%` : "-",
        a: "r",
        color: e.objetivos.length && e.sumaPesoObjetivos !== 100 ? ROJO : GRIS,
        bold: e.objetivos.length && e.sumaPesoObjetivos !== 100,
      },
    ];
    for (const p of PERIODOS_FEEDBACK) {
      const f = e.feedback[p];
      fila.push({ v: n1(f?.obj), a: "r", color: f ? TINTA : BORDE });
      fila.push({ v: n1(f?.comp), a: "r", color: f ? TINTA : BORDE });
      fila.push({ v: n1(f?.global), a: "r", bold: true, color: f ? (p === "FINAL" ? AZUL : TINTA) : BORDE });
    }
    return fila;
  });

  tabla(doc, cols, filas, { fuente: 6.8, compacta: true });
}

/* ─────────────── Nivel ÁREA ─────────────── */

function seccionArea(doc, area, { salto = false, conFichas = true, conTitulo = true } = {}) {
  if (salto) doc.addPage();

  const sub = `${area.empleados.length} empleados - ${area.conNota} con nota registrada` +
    (area.pesosFueraDe100 ? ` - ${area.pesosFueraDe100} con pesos distintos de 100%` : "");
  if (conTitulo) {
    tituloSeccion(doc, area.nombre, sub);
  } else {
    // El título del documento ya nombra al área.
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5).text(txt1(sub), MARGEN, doc.y, {
      width: ancho(doc), lineBreak: false, ellipsis: true,
    });
    doc.y += 14;
  }

  subtitulo(doc, "Medida macro del área (promedio de su gente)");
  bloqueMacro(doc, area.promedios, {
    avanceObj: area.avanceObjetivos,
    avanceComp: area.avanceCompetencias,
  });

  subtitulo(doc, "Resultado por empleado");
  tablaPersonas(doc, area.empleados);

  if (!conFichas) return;
  for (const e of area.empleados) {
    fichaEmpleado(doc, e, { salto: true, conComentarios: false, unaHoja: true });
  }
}

/* ─────────────── Nivel NÓMINA ─────────────── */

function reporteNomina(doc, data) {
  subtitulo(doc, "Medida macro de toda la nómina");
  bloqueMacro(doc, data.totales.promedios, {
    avanceObj: data.totales.avanceObjetivos,
    avanceComp: data.totales.avanceCompetencias,
  });
  nota(doc,
    `${data.totales.conNota} de ${data.empleados.length} empleados tienen al menos una nota registrada. ` +
    `${data.totales.pesosFueraDe100} tienen los pesos de objetivos fuera del 100%.`);

  if (data.areas.length > 1) {
    subtitulo(doc, "Comparativa entre áreas");
    const w = ancho(doc);
    const wNombre = 190;
    const wEmp = 52;
    const wPeriodo = (w - wNombre - wEmp) / PERIODOS_FEEDBACK.length;
    const tercio = wPeriodo / 3;
    const cols = [{ t: "Area", w: wNombre }, { t: "Emp.", w: wEmp, a: "r" }];
    for (const p of PERIODOS_FEEDBACK) {
      cols.push({ t: `${p} obj`, w: tercio, a: "r" });
      cols.push({ t: `${p} comp`, w: tercio, a: "r" });
      cols.push({ t: `${p} glob`, w: tercio, a: "r" });
    }
    tabla(doc, cols,
      data.areas.map((a) => {
        const fila = [{ v: corta(a.nombre, 46), bold: true }, { v: String(a.empleados.length), a: "r", color: GRIS }];
        for (const p of PERIODOS_FEEDBACK) {
          fila.push({ v: n1(a.promedios[p]?.obj), a: "r" });
          fila.push({ v: n1(a.promedios[p]?.comp), a: "r" });
          fila.push({ v: n1(a.promedios[p]?.global), a: "r", bold: true, color: AZUL });
        }
        return fila;
      }),
      { fuente: 7, compacta: true }
    );
  }

  doc.addPage();
  subtitulo(doc, "Resultado por empleado");
  nota(doc, "obj / comp = los dos componentes; glob = la nota global del período. Pesos en rojo: no suman 100%.");
  tablaPersonas(doc, data.empleados, { conArea: true });
}

/* ─────────────── Pie ─────────────── */

function pie(doc, data) {
  const rango = doc.bufferedPageRange();

  // El pie se dibuja DEBAJO del margen inferior, que es donde va un pie. Pero
  // para PDFKit escribir ahí es desbordar la caja de texto, así que agregaba
  // una página por cada una que tocaba: una ficha de una sola hoja terminaba
  // con tres. Se apaga el margen mientras se dibuja y se repone después.
  const margenOriginal = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGEN + 6;
    doc.font("Helvetica").fontSize(6.5).fillColor(GRIS);
    doc.text(txt(`${data.anioLabel} - generado el ${new Date(data.generadoEl).toLocaleString("es-AR")}`),
      MARGEN, y, { width: ancho(doc) / 2, lineBreak: false });
    doc.text(txt(`Pagina ${i - rango.start + 1} de ${rango.count}`),
      MARGEN + ancho(doc) / 2, y, { width: ancho(doc) / 2, align: "right", lineBreak: false });
    doc.page.margins.bottom = margenOriginal;
  }
}

/* ─────────────── Entrada ─────────────── */

export async function generarPDF(data) {
  const { doc, listo } = nuevoDoc();

  const subtituloDoc = data.alcance === "empleado" && data.empleados.length === 1
    ? "Ficha individual - las notas por período salen del feedback guardado, no se recalculan."
    : `${data.empleados.length} empleado(s) - las notas por período salen del feedback guardado, no se recalculan.`;

  tituloDoc(doc, data.titulo, subtituloDoc);

  if (!data.empleados.length) {
    doc.font("Helvetica").fontSize(10).fillColor(GRIS)
      .text(txt("No hay datos para el alcance seleccionado."));
    doc.end();
    return listo;
  }

  if (data.alcance === "nomina") {
    reporteNomina(doc, data);
  } else if (data.alcance === "empleado") {
    const unaSola = data.empleados.length === 1;
    data.empleados.forEach((e, i) =>
      fichaEmpleado(doc, e, { salto: i > 0, conTitulo: !unaSola, unaHoja: true }));
  } else {
    const unaSola = data.areas.length === 1;
    data.areas.forEach((a, i) =>
      seccionArea(doc, a, { salto: i > 0, conTitulo: !unaSola }));
  }

  pie(doc, data);
  doc.end();
  return listo;
}
