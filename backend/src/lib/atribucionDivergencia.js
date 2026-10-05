// backend/src/lib/atribucionDivergencia.js
//
// ============================================================================
//  ¿POR QUÉ LA NOTA GUARDADA NO ES LA QUE DA EL MOTOR HOY?
// ============================================================================
//
//  Un feedback cerrado guarda la nota que se le comunicó a la persona. Si hoy
//  se recalcula, puede dar otra cosa. La pregunta no es cuál está bien —la
//  comunicada es la que vale— sino QUÉ pasó en el medio.
//
//  CÓMO RESPONDE
//  Probando hipótesis contra hechos verificables, no deduciendo de la
//  configuración. La diferencia entre las dos cosas importa: mirar una meta y
//  decir "tiene umbral, debe ser por el umbral" es una corazonada que suena a
//  diagnóstico. Acá cada causa se afirma solo si hay un hecho que la sostiene,
//  casi siempre una fecha:
//
//    · El _id de Mongo lleva la marca real de inserción. Si un objetivo que
//      hoy computa se creó después de que el feedback se cerró, no pudo estar
//      en esa nota. Eso no se discute: el objetivo no existía.
//    · La auditoría guarda el documento previo a cada cambio, con fecha. Si
//      los pesos de la persona se tocaron después del cierre, está escrito.
//    · El feedback guarda `obj` y `comp` por separado, así que antes de
//      explicar nada se puede decir de qué lado está la diferencia.
//
//  Y cuando ninguna hipótesis la explica, lo dice. Una pantalla que siempre
//  encuentra un culpable deja de servir para distinguir los casos.
//
//  DE DÓNDE SALE
//  De revisar los 286 feedbacks del AF2025, donde 197 divergen. Cuatro
//  personas del mismo sector tenían exactamente −32,1 de diferencia: un delta
//  idéntico no es casualidad de cada caso, es un hecho compartido. Lo era: un
//  objetivo clonado después del cierre, overrides restaurados en septiembre, y
//  sumas de peso que quedaron en 110%.
// ============================================================================

import mongoose from "mongoose";

/** Diferencia, en puntos de nota, a partir de la cual algo se considera divergente. */
export const TOLERANCIA = 1;

const redondear = (n) => Math.round(Number(n) * 10) / 10;
const esNum = (n) => n !== null && n !== undefined && Number.isFinite(Number(n));

/** Marca de inserción real de un documento, que el cliente no puede falsificar. */
function creadoEl(doc) {
  if (!doc?._id) return null;
  try {
    return new mongoose.Types.ObjectId(String(doc._id)).getTimestamp();
  } catch {
    return doc.createdAt ? new Date(doc.createdAt) : null;
  }
}

const listaObjetivos = (dash) => dash?.objetivos?.items ?? dash?.objetivos ?? [];

/* ------------------------------------------------------------------ *
 * Causas
 * ------------------------------------------------------------------ */

/**
 * De qué lado está la diferencia.
 *
 * Es lo primero que hay que saber y lo único que no necesita ninguna
 * hipótesis: el feedback guarda las dos mitades por separado.
 */
function ladoDeLaDiferencia(guardado, actual) {
  const dObj = esNum(guardado?.obj) && esNum(actual?.obj) ? Number(actual.obj) - Number(guardado.obj) : null;
  const dComp = esNum(guardado?.comp) && esNum(actual?.comp) ? Number(actual.comp) - Number(guardado.comp) : null;

  const causas = [];
  if (dObj !== null && Math.abs(dObj) > 0.5) {
    causas.push({
      codigo: "DIFERENCIA_EN_OBJETIVOS",
      titulo: "La diferencia está en los objetivos",
      detalle: `Los objetivos aportaban ${redondear(guardado.obj)} puntos cuando se cerró y hoy aportan ${redondear(actual.obj)}.`,
      efecto: redondear(dObj),
      evidencia: { guardado: redondear(guardado.obj), actual: redondear(actual.obj) },
    });
  }
  if (dComp !== null && Math.abs(dComp) > 0.5) {
    causas.push({
      codigo: "DIFERENCIA_EN_COMPETENCIAS",
      titulo: "La diferencia está en las competencias",
      detalle: `Las competencias aportaban ${redondear(guardado.comp)} puntos cuando se cerró y hoy aportan ${redondear(actual.comp)}.`,
      efecto: redondear(dComp),
      evidencia: { guardado: redondear(guardado.comp), actual: redondear(actual.comp) },
    });
  }
  return causas;
}

/**
 * Objetivos que hoy computan y no existían cuando se cerró el feedback.
 *
 * La causa más limpia de todas: si el objetivo se creó después, la nota
 * comunicada no pudo haberlo incluido. Es la firma de una clonación tardía,
 * que además entra de golpe a todo un sector —de ahí los deltas idénticos.
 */
function objetivosPosteriores(objetivos, cerradoEl) {
  if (!cerradoEl) return [];
  const posteriores = objetivos
    .map((o) => ({ obj: o, creado: creadoEl(o) }))
    .filter((x) => x.creado && x.creado > cerradoEl);

  if (!posteriores.length) return [];

  return [
    {
      codigo: "OBJETIVO_AGREGADO_DESPUES_DEL_CIERRE",
      titulo: `${posteriores.length} objetivo(s) se agregaron después de cerrar`,
      detalle:
        `Hoy computan objetivos que no existían el ${cerradoEl.toLocaleDateString("es-AR")}, ` +
        `cuando se cerró este feedback. La nota comunicada no pudo incluirlos.`,
      efecto: null, // se cuantifica aparte, recalculando sin ellos
      evidencia: posteriores.map((x) => ({
        nombre: x.obj.nombre,
        peso: x.obj.peso ?? null,
        creadoEl: x.creado.toISOString().slice(0, 10),
      })),
    },
  ];
}

/**
 * El mismo objetivo contado dos veces.
 *
 * Secuela de las clonaciones: el original —que tiene los resultados— y el
 * clon, que nunca se evaluó y arrastra la nota hacia abajo.
 */
function objetivosDuplicados(objetivos) {
  const porNombre = new Map();
  for (const o of objetivos) {
    const k = String(o.nombre || "").trim().toLowerCase();
    if (!k) continue;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(o);
  }
  const repetidos = [...porNombre.values()].filter((v) => v.length > 1);
  if (!repetidos.length) return [];

  return [
    {
      codigo: "OBJETIVO_DUPLICADO",
      titulo: `${repetidos.length} objetivo(s) aparecen más de una vez`,
      detalle:
        "El mismo objetivo computa dos veces. Suele ser el original —con sus resultados cargados— " +
        "más un clon vacío que baja el promedio sin que nadie lo note.",
      efecto: null,
      evidencia: repetidos.map((grupo) => ({
        nombre: grupo[0].nombre,
        veces: grupo.length,
        copias: grupo.map((o) => ({
          peso: o.peso ?? null,
          progreso: esNum(o.progreso) ? redondear(o.progreso) : null,
          creadoEl: creadoEl(o)?.toISOString().slice(0, 10) ?? null,
        })),
      })),
    },
  ];
}

/** La suma de pesos no da 100: el denominador del promedio no es el que se cree. */
function sumaDePesos(objetivos) {
  const suma = objetivos.reduce((a, o) => a + Number(o.peso || 0), 0);
  if (!objetivos.length || Math.abs(suma - 100) <= 0.5) return [];

  return [
    {
      codigo: "PESOS_NO_SUMAN_100",
      titulo: `Los pesos suman ${redondear(suma)}%`,
      detalle:
        suma > 100
          ? `Hay ${redondear(suma - 100)} puntos de peso de más. El motor divide por el total, así que cada objetivo pesa menos de lo que dice su número.`
          : `Faltan ${redondear(100 - suma)} puntos de peso. El motor divide por el total, así que cada objetivo pesa más de lo que dice su número.`,
      efecto: null,
      evidencia: { suma: redondear(suma), objetivos: objetivos.length },
    },
  ];
}

/**
 * Resultados cargados o editados después del cierre.
 *
 * Distinto de un objetivo nuevo: acá el objetivo ya estaba, pero sus datos
 * cambiaron. Cerrar un trimestre con la carga incompleta y completarla
 * después es lo más común.
 */
function resultadosPosteriores(evaluaciones, cerradoEl) {
  if (!cerradoEl || !evaluaciones?.length) return [];

  const nuevos = [];
  const editados = [];
  for (const ev of evaluaciones) {
    const creado = creadoEl(ev);
    if (creado && creado > cerradoEl) nuevos.push(ev);
    else if (ev.updatedAt && new Date(ev.updatedAt) > cerradoEl) editados.push(ev);
  }
  if (!nuevos.length && !editados.length) return [];

  const partes = [];
  if (nuevos.length) partes.push(`${nuevos.length} cargado(s)`);
  if (editados.length) partes.push(`${editados.length} modificado(s)`);

  return [
    {
      codigo: "RESULTADO_CARGADO_DESPUES_DEL_CIERRE",
      titulo: `Resultados tocados después de cerrar: ${partes.join(" y ")}`,
      detalle:
        `El feedback se cerró el ${cerradoEl.toLocaleDateString("es-AR")} y después se siguieron ` +
        `cargando o corrigiendo resultados de este período. El motor los usa hoy; la nota comunicada no.`,
      efecto: null,
      evidencia: [...nuevos, ...editados].slice(0, 12).map((ev) => ({
        periodo: ev.periodo,
        cuando: (creadoEl(ev) > cerradoEl ? creadoEl(ev) : new Date(ev.updatedAt)).toISOString().slice(0, 10),
        tipo: creadoEl(ev) > cerradoEl ? "cargado" : "modificado",
      })),
    },
  ];
}

/**
 * Cambios registrados en la auditoría posteriores al cierre.
 *
 * La auditoría guarda el documento previo, así que acá no se infiere nada:
 * alguien tocó esto, este día, y quedó escrito.
 */
function cambiosAuditados(auditoria, cerradoEl) {
  if (!cerradoEl || !auditoria?.length) return [];

  const posteriores = auditoria.filter((a) => new Date(a.createdAt) > cerradoEl);
  if (!posteriores.length) return [];

  const porEntidad = new Map();
  for (const a of posteriores) {
    const k = a.entidad || "?";
    if (!porEntidad.has(k)) porEntidad.set(k, []);
    porEntidad.get(k).push(a);
  }

  return [...porEntidad.entries()].map(([entidad, registros]) => ({
    codigo: entidad === "override" ? "PESOS_CAMBIADOS_DESPUES_DEL_CIERRE" : "CONFIGURACION_CAMBIADA_DESPUES_DEL_CIERRE",
    titulo:
      entidad === "override"
        ? `Los pesos de esta persona se tocaron ${registros.length} vez(ces) después del cierre`
        : `La configuración de los objetivos cambió ${registros.length} vez(ces) después del cierre`,
    detalle:
      `Queda registrado en la auditoría. La nota de hoy se calcula con la configuración actual; ` +
      `la comunicada, con la que había ese día.`,
    efecto: null,
    evidencia: registros.slice(0, 10).map((a) => ({
      cuando: new Date(a.createdAt).toISOString().slice(0, 10),
      accion: a.accion,
      quien: a.email || "?",
      resumen: a.resumen || null,
    })),
  }));
}

/**
 * La nota guardada es imposible en la escala.
 *
 * Objetivos aportan hasta 70 y competencias hasta 30: 100 es el techo. Hay
 * feedbacks CERRADOS con 112 y 116,8, lo que prueba por sí solo que el número
 * no pasó por ninguna validación — lo calculó el navegador y se guardó tal
 * cual. Cuando el guardado está fuera de escala no tiene sentido buscar qué
 * cambió después: el punto de partida ya estaba mal.
 */
function notaImposible(guardado) {
  const g = Number(guardado?.global);
  if (!esNum(g) || (g >= 0 && g <= 100.5)) return [];

  return [
    {
      codigo: "NOTA_GUARDADA_IMPOSIBLE",
      titulo: `La nota guardada (${redondear(g)}) está fuera de escala`,
      detalle:
        "La escala llega a 100: objetivos aportan hasta 70 y competencias hasta 30. Esta nota se " +
        "calculó en el navegador y se guardó sin que nadie la revisara. No es que el motor de hoy " +
        "dé distinto: el número comunicado nunca fue válido.",
      efecto: null,
      evidencia: { global: redondear(g), maximo: 100 },
    },
  ];
}

/**
 * Datos que el motor no computa: metas huérfanas y períodos fuera del
 * calendario. Los detecta el validador de evaluaciones; acá solo se traen
 * los que afectan a esta persona y este período.
 */
function datosNoComputados(hallazgos) {
  const relevantes = (hallazgos || []).filter((h) =>
    ["META_HUERFANA", "PERIODO_FUERA_DE_CALENDARIO", "PERIODO_PREVIO_AL_INGRESO"].includes(h.codigo)
  );
  if (!relevantes.length) return [];

  const porCodigo = new Map();
  for (const h of relevantes) {
    if (!porCodigo.has(h.codigo)) porCodigo.set(h.codigo, []);
    porCodigo.get(h.codigo).push(h);
  }

  const TITULO = {
    META_HUERFANA: (n) => `${n} resultado(s) apuntan a metas que ya no existen`,
    PERIODO_FUERA_DE_CALENDARIO: (n) => `${n} resultado(s) quedaron fuera del calendario del objetivo`,
    PERIODO_PREVIO_AL_INGRESO: (n) => `${n} resultado(s) son de antes del ingreso de la persona`,
  };

  return [...porCodigo.entries()].map(([codigo, hs]) => ({
    codigo: `NO_COMPUTA_${codigo}`,
    titulo: (TITULO[codigo] || ((n) => `${n} resultado(s) que el motor no suma`))(hs.length),
    detalle: hs[0].efecto || hs[0].mensaje,
    efecto: null,
    evidencia: hs.slice(0, 8).map((h) => ({ periodo: h.periodo, meta: h.meta, mensaje: h.mensaje })),
  }));
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

/**
 * Explica la diferencia entre la nota guardada y la que da el motor hoy.
 *
 * @param {Object} params
 * @param {Object} params.feedback      el feedback cerrado (con scores y closedAt)
 * @param {Object} params.scoresActuales  lo que da el motor hoy {obj, comp, global}
 * @param {Object} params.dash          el payload del dashboard de esa persona
 * @param {Array}  [params.evaluaciones]  evaluaciones del período
 * @param {Array}  [params.auditoria]     registros de auditoría de esa persona
 * @param {Array}  [params.hallazgos]     salida del validador de evaluaciones
 * @param {Object} [params.reproduccion]  notas recalculadas bajo cada hipótesis
 * @param {Date}   [params.auditoriaDesde]  fecha del primer registro de auditoría
 *
 * @returns {{divergencia, lado, causas, veredicto}}
 */
export function explicarDivergencia({
  feedback,
  scoresActuales,
  dash,
  evaluaciones = [],
  auditoria = [],
  hallazgos = [],
  reproduccion = null,
  auditoriaDesde = null,
}) {
  const guardado = feedback?.scores || {};
  const divergencia =
    esNum(guardado.global) && esNum(scoresActuales?.global)
      ? redondear(Number(scoresActuales.global) - Number(guardado.global))
      : null;

  const cerradoEl = feedback?.closedAt ? new Date(feedback.closedAt) : null;
  const objetivos = listaObjetivos(dash);

  const causas = [
    ...notaImposible(guardado),
    ...ladoDeLaDiferencia(guardado, scoresActuales),
    ...objetivosPosteriores(objetivos, cerradoEl),
    ...objetivosDuplicados(objetivos),
    ...sumaDePesos(objetivos),
    ...resultadosPosteriores(evaluaciones, cerradoEl),
    ...cambiosAuditados(auditoria, cerradoEl),
    ...datosNoComputados(hallazgos),
  ];

  /* --- Reproducción: ¿alguna hipótesis da el número guardado? --- */
  //
  // Es la única forma de pasar de "esto cambió" a "esto lo explica". Si
  // recalcular sin los objetivos posteriores devuelve la nota comunicada,
  // la causa está probada, no sugerida.
  let veredicto;
  const reproduce = (valor) =>
    esNum(valor) && esNum(guardado.global) && Math.abs(Number(valor) - Number(guardado.global)) <= TOLERANCIA;

  if (divergencia === null) {
    veredicto = {
      nivel: "sin_datos",
      texto: "No hay nota guardada para comparar.",
    };
  } else if (Math.abs(divergencia) <= TOLERANCIA) {
    veredicto = {
      nivel: "coincide",
      texto: "La nota guardada y la que da el motor hoy coinciden.",
    };
  } else if (causas.some((c) => c.codigo === "NOTA_GUARDADA_IMPOSIBLE")) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: la nota guardada está fuera de escala, así que no hay nada que reproducir. " +
        "Se calculó con el motor viejo del navegador, que no validaba el rango.",
      reproducidaPor: "notaImposible",
    };
  } else if (reproduce(reproduccion?.comoAlCerrarCompleto)) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: reconstruida con la configuración Y los datos que había el día del cierre, la " +
        `nota da ${redondear(guardado.global)}, exactamente la comunicada. Cambiaron las dos cosas: ` +
        "lo que se cargó después y las reglas con las que se mide.",
      reproducidaPor: "comoAlCerrarCompleto",
    };
  } else if (reproduce(reproduccion?.conConfigDelCierre)) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: los resultados son los mismos; lo que cambió es la configuración de los " +
        `objetivos. Con las metas que tenían el día del cierre, el motor devuelve ${redondear(guardado.global)}.`,
      reproducidaPor: "conConfigDelCierre",
    };
  } else if (reproduce(reproduccion?.comoAlCerrar)) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: reconstruida con los datos que existían el día del cierre —sin lo que se cargó " +
        `después— la nota da ${redondear(guardado.global)}, exactamente la comunicada. La diferencia ` +
        "es todo lo que entró después, no un problema de cálculo.",
      reproducidaPor: "comoAlCerrar",
    };
  } else if (reproduce(reproduccion?.sinPosteriores)) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: sacando los objetivos que se agregaron después del cierre, el motor devuelve " +
        `exactamente la nota comunicada (${redondear(guardado.global)}). La diferencia es todo lo que entró después.`,
      reproducidaPor: "sinPosteriores",
    };
  } else if (reproduce(reproduccion?.conSeguimiento)) {
    veredicto = {
      nivel: "explicada",
      texto:
        "Explicada: la nota guardada es la de seguimiento, no la de cierre. Al cerrar, la regla " +
        "estricta de las metas cambia el número; el feedback se guardó con el valor de seguimiento.",
      reproducidaPor: "conSeguimiento",
    };
  } else if (cerradoEl && auditoriaDesde && cerradoEl < new Date(auditoriaDesde)) {
    // El límite honesto del análisis.
    //
    // El registro de cambios empezó a existir el 08/09/2026, y 162 de los 274
    // feedbacks del AF2025 se cerraron antes. Para esos no hay forma de saber
    // cómo estaba configurado el objetivo ese día: lo que cambió entre el
    // cierre y el primer registro no lo guardó nadie.
    //
    // Decirlo es más útil que elegir al sospechoso más cercano. Si la pantalla
    // siempre encontrara un culpable dejaría de servir para distinguir los
    // casos en los que de verdad lo sabe.
    veredicto = {
      nivel: "sin_rastro",
      texto:
        `Este feedback se cerró el ${cerradoEl.toLocaleDateString("es-AR")}, antes de que existiera ` +
        `el registro de cambios (${new Date(auditoriaDesde).toLocaleDateString("es-AR")}). Se puede ver ` +
        "qué difiere hoy, pero no reconstruir cómo estaba ese día. Las causas de abajo son lo que " +
        "cambió desde que hay registro, y pueden no ser todo.",
    };
  } else if (causas.length > 1) {
    const principal = [...causas].sort(
      (a, b) => Math.abs(b.efecto ?? 0) - Math.abs(a.efecto ?? 0)
    )[0];
    veredicto = {
      nivel: "parcial",
      texto:
        `${causas.length} cambios después del cierre, ninguno reproduce por sí solo la nota ` +
        `comunicada: se combinan. El de mayor peso es "${principal.titulo}".`,
    };
  } else {
    veredicto = {
      nivel: "sin_explicacion",
      texto:
        "No se encontró ningún cambio posterior al cierre que explique la diferencia.",
    };
  }

  return {
    divergencia,
    guardado: esNum(guardado.global) ? redondear(guardado.global) : null,
    actual: esNum(scoresActuales?.global) ? redondear(scoresActuales.global) : null,
    cerradoEl: cerradoEl ? cerradoEl.toISOString() : null,
    causas,
    veredicto,
  };
}
