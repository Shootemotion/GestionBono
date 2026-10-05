// backend/src/lib/notaOficial.js
//
// ============================================================================
//  ¿CUÁL ES LA NOTA DE ESTA PERSONA?
// ============================================================================
//
//  Una sola función responde esto, y todo lo demás la llama: el bono, el
//  dashboard, los PDF, Mi Desempeño, los resultados.
//
//  POR QUÉ EXISTE
//  Porque la pregunta se respondía en cuatro lugares distintos y los cuatro
//  daban cosas distintas para la misma persona y el mismo año:
//
//    · El backend (scoringEngine) tomaba el último feedback CERRADO por orden
//      de período. Si el FINAL no estaba cerrado, usaba el de un trimestre.
//    · Mi Desempeño recalculaba en vivo para el AF2025 y usaba la guardada
//      desde el AF2026.
//    · Cierre de Evaluaciones recalculaba en vivo siempre.
//    · El bono leía `scoreFinal`, que salía del primero.
//
//  Resultado: 11 personas veían un número en su pantalla y habrían cobrado
//  sobre otro. Para 2 de ellas la diferencia pasaba los 20 puntos.
//
//  LA REGLA, ACORDADA CON RRHH
//  La nota es la del feedback que el jefe evaluó, vio y le comunicó a la
//  persona. No se recalcula. Cuando está confirmada queda congelada en
//  `oficial.nota` y ni siquiera depende de que `scores` siga igual.
//
//  Lo que esta función NO hace es elegir en silencio cuando no hay cierre
//  anual. Devuelve el caso con su motivo para que la pantalla lo muestre: hay
//  6 personas sin FINAL cerrado cuyo bono sale de un trimestre de mitad de
//  año, y eso tiene que verse, no resolverse por descarte.
// ============================================================================

/** Orden del ciclo. El cierre anual es FINAL; los demás son parciales. */
const ORDEN = ["Q1", "Q2", "Q3", "FINAL"];

/** Techo de la escala, con medio punto de margen por el redondeo de cada parte. */
const MAX_GLOBAL = 100.5;

const esNota = (n) => n !== null && n !== undefined && Number.isFinite(Number(n));

/**
 * Estados posibles. El que no es `confirmada` ni `pendiente` necesita que
 * alguien decida algo: ninguno se resuelve solo.
 */
export const ESTADO = {
  CONFIRMADA: "confirmada",       // nota oficial fijada
  PENDIENTE: "pendiente",         // hay cierre anual válido, falta confirmarlo
  SIN_CIERRE_ANUAL: "sin_cierre_anual",   // no hay FINAL; lo que hay es parcial
  NOTA_INVALIDA: "nota_invalida", // la nota guardada está fuera de escala
  SIN_EVALUAR: "sin_evaluar",     // no hay ningún feedback cerrado
};

/**
 * Resuelve la nota de una persona para un año.
 *
 * @param {Array} feedbacks  los del empleado y año, con `scores`, `estado`, `oficial`
 * @returns {{estado, nota, periodo, feedbackId, motivo, confirmable, feedback}}
 */
export function resolverNotaOficial(feedbacks = []) {
  const cerrados = feedbacks.filter(
    (f) => f?.estado === "CLOSED" && esNota(f?.scores?.global)
  );

  // 1. Ya confirmada: se devuelve el valor congelado, no el vivo.
  const confirmada = feedbacks.find((f) => f?.oficial?.confirmada);
  if (confirmada) {
    const n = confirmada.oficial.nota || confirmada.scores;
    return {
      estado: ESTADO.CONFIRMADA,
      nota: { obj: n.obj, comp: n.comp, global: n.global },
      periodo: confirmada.periodo,
      feedbackId: String(confirmada._id),
      motivo: null,
      confirmable: false,
      feedback: confirmada,
    };
  }

  if (!cerrados.length) {
    return {
      estado: ESTADO.SIN_EVALUAR,
      nota: null,
      periodo: null,
      feedbackId: null,
      motivo: "No tiene ningún feedback cerrado en este año.",
      confirmable: false,
      feedback: null,
    };
  }

  const final = cerrados.find((f) => f.periodo === "FINAL");

  // 2. Hay cierre anual.
  if (final) {
    const g = Number(final.scores.global);
    if (g < 0 || g > MAX_GLOBAL) {
      return {
        estado: ESTADO.NOTA_INVALIDA,
        nota: { obj: final.scores.obj, comp: final.scores.comp, global: g },
        periodo: "FINAL",
        feedbackId: String(final._id),
        motivo:
          `La nota del cierre anual es ${g}, y la escala llega a 100. Se calculó en el ` +
          "navegador y se guardó sin validar. Hay que corregirla antes de confirmarla.",
        confirmable: false,
        feedback: final,
      };
    }
    return {
      estado: ESTADO.PENDIENTE,
      nota: { obj: final.scores.obj, comp: final.scores.comp, global: g },
      periodo: "FINAL",
      feedbackId: String(final._id),
      motivo: null,
      confirmable: true,
      feedback: final,
    };
  }

  // 3. No hay cierre anual: lo que hay es una nota de mitad de año.
  //
  // No se elige por descarte. Se devuelve con el motivo para que se vea en
  // pantalla: una nota de Q2 no es la nota del año, y pagar un bono sobre
  // ella es una decisión, no un detalle.
  const ultimo = [...cerrados].sort(
    (a, b) => ORDEN.indexOf(b.periodo) - ORDEN.indexOf(a.periodo)
  )[0];

  return {
    estado: ESTADO.SIN_CIERRE_ANUAL,
    nota: {
      obj: ultimo.scores.obj,
      comp: ultimo.scores.comp,
      global: Number(ultimo.scores.global),
    },
    periodo: ultimo.periodo,
    feedbackId: String(ultimo._id),
    motivo:
      `No tiene el feedback FINAL cerrado. Lo último cerrado es ${ultimo.periodo}, que es una ` +
      "nota parcial de mitad de año, no la del cierre anual.",
    confirmable: false,
    feedback: ultimo,
  };
}

/**
 * La nota a usar en cualquier salida (bono, PDF, resultados, pantallas).
 *
 * Devuelve `null` cuando no hay una nota utilizable, en vez de un 0: un 0 se
 * suma, se promedia y se paga; un null se nota.
 */
export function notaParaMostrar(feedbacks = []) {
  const r = resolverNotaOficial(feedbacks);
  if (r.estado === ESTADO.SIN_EVALUAR) return null;
  return r.nota;
}

/** Etiqueta corta para pantallas y reportes. */
export function etiquetaEstado(estado) {
  return {
    [ESTADO.CONFIRMADA]: "Confirmada",
    [ESTADO.PENDIENTE]: "Falta confirmar",
    [ESTADO.SIN_CIERRE_ANUAL]: "Sin cierre anual",
    [ESTADO.NOTA_INVALIDA]: "Nota fuera de escala",
    [ESTADO.SIN_EVALUAR]: "Sin evaluar",
  }[estado] || estado;
}

/**
 * La nota de UN feedback: la confirmada si la hay, si no la foto guardada.
 *
 * Es la función que tiene que llamar todo lo que muestre la nota de un
 * período —Mi Desempeño, el legajo, el bono, los reportes, las pantallas de
 * control—, en vez de leer `fb.scores` a mano.
 *
 * POR QUÉ
 * Cuando RRHH confirma una nota distinta de la foto —porque el jefe tenía
 * otro número en pantalla al enviarla— el valor elegido queda en
 * `oficial.nota` y `scores` conserva el original. Quien lea `scores` directo
 * muestra el número viejo: a Tania Simunovich se le confirmó 79,9 y su
 * pantalla seguía diciendo 63,6.
 *
 * `scores` no se pisa a propósito. Es el registro de lo que el navegador
 * calculó ese día, y perderlo haría imposible volver a revisar el caso.
 *
 * @returns {{obj, comp, global, confirmada, origen}|null}
 */
export function notaDelFeedback(fb) {
  if (!fb) return null;

  if (fb.oficial?.confirmada && fb.oficial.nota?.global !== null && fb.oficial.nota?.global !== undefined) {
    return {
      obj: fb.oficial.nota.obj,
      comp: fb.oficial.nota.comp,
      global: fb.oficial.nota.global,
      confirmada: true,
      origen: fb.oficial.origen || "comunicada",
    };
  }

  if (!esNota(fb.scores?.global)) return null;

  return {
    obj: fb.scores.obj,
    comp: fb.scores.comp,
    global: fb.scores.global,
    confirmada: false,
    origen: null,
  };
}
