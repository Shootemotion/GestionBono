// backend/src/lib/validacionObjetivos.js
//
// ============================================================================
//  VALIDADOR DE CONFIGURACIÓN DE OBJETIVOS
// ============================================================================
//
//  QUÉ ES
//  Las reglas de acá no son opiniones de estilo: cada una describe una
//  configuración que el motor (scoringCore.js) interpreta de una forma que no
//  es la que quiso el jefe al cargarla. Son, literalmente, las trampas del
//  motor escritas como reglas.
//
//  POR QUÉ EXISTE
//  `validarPlantilla` ya chequeaba lo formal —que el tipo sea válido, que el
//  peso sea un número—. Eso no alcanzó: los objetivos que rompieron notas eran
//  formalmente impecables. Lo que estaba mal era la combinación de campos.
//
//  Dos ejemplos reales, los dos vivos en el AF2026 al escribir esto:
//    · Umbral de 9 períodos en un objetivo trimestral, que tiene 4. Imposible
//      de alcanzar: el motor devuelve 0 pase lo que pase, todo el año.
//    · Meta porcentual con `esperado` vacío y operador ">=". El motor compara
//      contra 0, y cualquier valor cargado —incluso 0— da 100%.
//
//  ERROR vs ADVERTENCIA
//  ERROR: el motor devuelve un número que NO corresponde al desempeño real
//    (un 0 inalcanzable, un 100 regalado). Bloquea el guardado.
//  ADVERTENCIA: la configuración es válida y el motor hace algo defendible,
//    pero no es lo que la mayoría espera al leer el formulario. Se muestra y
//    se puede guardar igual.
//
//  Esa frontera no se eligió en abstracto: se midió contra las 244 plantillas
//  de objetivo en base. Lo que tiene decenas de casos legítimos cargados es
//  advertencia; si fuera error, nadie podría volver a editar esos objetivos.
//
//  DESDE CUÁNDO
//  Las reglas nuevas bloquean a partir del AF2026 (AF_VALIDACION_ESTRICTA),
//  misma convención que AF_REGLAS_CORREGIDAS en scoringCore y
//  AF_TECHO_UNIFICADO en el front: una regla nueva rige desde un año, y los
//  anteriores se dejan exactamente como se calcularon e informaron. Sobre
//  AF2025 todo sale como advertencia.
// ============================================================================

import { generarHitos } from "../utils/generarHitos.js";
import { etiquetaAnioFiscal } from "./fiscalYear.js";

/**
 * Primer año fiscal en el que las reglas de coherencia BLOQUEAN el guardado.
 * Antes de ese año se informan como advertencia y se deja guardar: esos
 * objetivos ya se usaron para calcular notas que se comunicaron.
 */
export const AF_VALIDACION_ESTRICTA = 2026;

const ERROR = "error";
const ADVERTENCIA = "advertencia";

/** Operadores con los que un esperado de 0 se cumple siempre. */
const OPERADORES_MAYOR = [">=", ">"];

const esBinaria = (meta) =>
  String(meta?.unidad || "").toLowerCase().includes("cumple");

const esAcumulativa = (meta) =>
  !!meta?.acumulativa || meta?.modoAcumulacion === "acumulativo";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Cuántos períodos tiene realmente este objetivo.
 *
 * Sale de `generarHitos`, que es el calendario que de verdad se usa para
 * cargar resultados. No de una tabla fija mensual=12: con `fechaCierreCustom`
 * un objetivo mensual puede tener 7 períodos, y el umbral hay que compararlo
 * contra los que existen, no contra los que debería tener un año completo.
 */
export function cantidadDePeriodos(plantilla) {
  try {
    return generarHitos(plantilla).length;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ *
 * Reglas sobre UNA meta
 * ------------------------------------------------------------------ */

/**
 * @returns {Array<{nivel, codigo, meta, campo, mensaje, efecto}>}
 */
function revisarMeta(meta, indice, plantilla, periodos) {
  const hallazgos = [];
  const etiqueta = String(meta?.nombre || `meta ${indice + 1}`).trim();
  const push = (nivel, codigo, campo, mensaje, efecto) =>
    hallazgos.push({ nivel, codigo, meta: etiqueta, metaIndice: indice, campo, mensaje, efecto });

  const binaria = esBinaria(meta);
  const acumulativa = esAcumulativa(meta);
  const regla = meta?.reglaCierre || "promedio";
  const operador = meta?.operador || ">=";
  const esperado = num(meta?.esperado ?? meta?.target);

  /* --- Umbral de períodos --- */
  if (regla === "umbral_periodos") {
    const umbral = num(meta?.umbralPeriodos);

    if (!umbral) {
      // scoringCore: `const required = metaDef.umbralPeriodos || evaluatedCount`.
      // Sin umbral, "lo pedido" pasa a ser "lo que haya cargado", que se mueve
      // solo a medida que se carga y no es una regla que nadie haya elegido.
      push(
        ERROR,
        "UMBRAL_SIN_VALOR",
        "umbralPeriodos",
        `La meta "${etiqueta}" cierra por umbral de períodos pero no dice cuántos hay que cumplir.`,
        "Sin ese número el motor exige todos los períodos que se hayan cargado, y la exigencia cambia sola cada vez que se carga un resultado."
      );
    } else if (periodos > 0 && umbral > periodos) {
      // Esto es un 0 garantizado: nunca va a haber `umbral` períodos cumplidos
      // si no existen `umbral` períodos.
      push(
        ERROR,
        "UMBRAL_IMPOSIBLE",
        "umbralPeriodos",
        `La meta "${etiqueta}" pide cumplir ${umbral} períodos, pero con frecuencia ${plantilla?.frecuencia} el objetivo tiene ${periodos}.`,
        `Es inalcanzable: la meta va a dar 0 todo el año, se cargue lo que se cargue. Poné un umbral de ${periodos} o menos, o cambiá la frecuencia.`
      );
    }

    if (meta?.reconoceEsfuerzo === false) {
      // Configuración legítima y deliberada —27 metas la usan—, pero es la que
      // produjo los ceros del cierre. Se avisa el efecto, no se bloquea.
      push(
        ADVERTENCIA,
        "UMBRAL_TODO_O_NADA",
        "reconoceEsfuerzo",
        `La meta "${etiqueta}" es todo o nada: si no llega a ${num(meta?.umbralPeriodos) || "los"} períodos, da 0.`,
        "Cumplir todos los períodos menos uno vale lo mismo que no cumplir ninguno. Durante el año el seguimiento muestra avance; el 0 aparece recién al cerrar."
      );
    }
  }

  /* --- Acumulativo --- */
  if (acumulativa && regla !== "promedio") {
    // scoringCore entra en la rama acumulativa ANTES de mirar reglaCierre.
    push(
      ADVERTENCIA,
      "ACUMULATIVO_IGNORA_REGLA",
      "reglaCierre",
      `La meta "${etiqueta}" es acumulativa, así que la regla de cierre "${regla}" no se aplica.`,
      "En acumulativo el motor suma todos los resultados del año y compara el total contra lo esperado. La regla de cierre queda sin efecto."
    );
  }

  /* --- Esperado --- */
  if (!binaria) {
    if (esperado === null) {
      if (OPERADORES_MAYOR.includes(operador)) {
        push(
          ERROR,
          "SIN_ESPERADO",
          "esperado",
          `La meta "${etiqueta}" no tiene valor esperado y compara con "${operador}".`,
          "El motor compara contra 0, así que cualquier valor cargado —incluso 0— da 100%. La meta se cumple sola."
        );
      } else {
        push(
          ERROR,
          "SIN_ESPERADO",
          "esperado",
          `La meta "${etiqueta}" no tiene valor esperado.`,
          "Sin un valor contra el cual comparar, el resultado cargado no se puede puntuar."
        );
      }
    } else if (esperado === 0 && OPERADORES_MAYOR.includes(operador)) {
      // Con "<=", "<" o "==" un esperado de 0 es perfectamente válido
      // ("sostener cero quejas"). Con ">=" o ">" se cumple siempre.
      push(
        ERROR,
        "ESPERADO_CERO_SE_CUMPLE_SOLO",
        "esperado",
        `La meta "${etiqueta}" espera 0 con el operador "${operador}".`,
        'Cualquier valor cumple, incluso 0: la meta da 100% siempre. Si lo que querés es "no superar 0", usá "<=" o "==".'
      );
    }
  }

  /* --- Binarias --- */
  if (binaria) {
    if (acumulativa && !esperado) {
      push(
        ERROR,
        "BINARIA_ACUMULATIVA_SIN_ESPERADO",
        "esperado",
        `La meta "${etiqueta}" cuenta cuántos períodos se cumplen, pero no dice cuántos hacen falta.`,
        "El motor compara la cuenta contra 0 y da 100% aunque no se cumpla ningún período."
      );
    }
    if (!acumulativa && (esperado !== null || (meta?.operador && meta.operador !== ">="))) {
      push(
        ADVERTENCIA,
        "BINARIA_CONFIG_INERTE",
        "esperado",
        `En la meta "${etiqueta}" el valor esperado y el operador no se usan.`,
        'Al ser "Cumple/No Cumple" por período, cada período vale 100 o 0 según el tilde. El esperado solo cuenta si la meta es acumulativa.'
      );
    }
  }

  /* --- Tolerancia --- */
  const tolerancia = num(meta?.tolerancia);
  if (tolerancia !== null && tolerancia < 0) {
    push(
      ERROR,
      "TOLERANCIA_NEGATIVA",
      "tolerancia",
      `La meta "${etiqueta}" tiene una tolerancia negativa (${tolerancia}).`,
      "Una tolerancia negativa endurece la meta en vez de aflojarla, que es lo contrario de lo que el campo dice hacer."
    );
  }

  /* --- permiteOver --- */
  if (meta?.permiteOver && ["==", "=", "!="].includes(operador)) {
    push(
      ADVERTENCIA,
      "PERMITE_OVER_CON_IGUALDAD",
      "permiteOver",
      `La meta "${etiqueta}" permite superar el 100% pero compara por igualdad.`,
      "Con un operador de igualdad no hay forma de superar el objetivo, así que el tope extra no se va a usar nunca."
    );
  }

  /* --- Peso de la meta --- */
  const pesoMeta = num(meta?.pesoMeta);
  if (pesoMeta !== null && (pesoMeta < 0 || pesoMeta > 100)) {
    push(
      ERROR,
      "PESO_META_FUERA_DE_RANGO",
      "pesoMeta",
      `El peso de la meta "${etiqueta}" es ${pesoMeta} y tiene que estar entre 0 y 100.`,
      ""
    );
  }

  return hallazgos;
}

/* ------------------------------------------------------------------ *
 * Reglas sobre el OBJETIVO completo
 * ------------------------------------------------------------------ */

function revisarObjetivo(plantilla, periodos) {
  const hallazgos = [];
  const push = (nivel, codigo, campo, mensaje, efecto) =>
    hallazgos.push({ nivel, codigo, meta: null, metaIndice: null, campo, mensaje, efecto });

  const metas = Array.isArray(plantilla?.metas) ? plantilla.metas : [];

  if (metas.length === 0) {
    push(
      ADVERTENCIA,
      "SIN_METAS",
      "metas",
      "El objetivo no tiene metas cargadas.",
      "Sin metas el motor cae en el cálculo viejo, que promedia valores sueltos y no aplica regla de cierre, tolerancia ni pesos."
    );
  }

  /* --- Pesos de las metas --- */
  const conPeso = metas.filter((m) => num(m?.pesoMeta) !== null);
  if (conPeso.length > 0 && conPeso.length < metas.length) {
    push(
      ERROR,
      "PESO_META_MEZCLADO",
      "metas",
      `${conPeso.length} de ${metas.length} metas tienen peso propio y el resto no.`,
      "Las que no tienen peso reciben una parte igual del total, que casi nunca es lo buscado: una meta sin peso en un objetivo de 3 se lleva 33%, aunque las otras dos sumen 100."
    );
  } else if (metas.length > 0 && conPeso.length === metas.length) {
    const suma = conPeso.reduce((a, m) => a + num(m.pesoMeta), 0);
    if (Math.abs(suma - 100) > 0.5) {
      push(
        ADVERTENCIA,
        "SUMA_PESO_METAS",
        "metas",
        `Los pesos de las metas suman ${Math.round(suma * 100) / 100}%, no 100%.`,
        "El motor reparte proporcionalmente igual, así que la nota sale bien, pero los porcentajes que se leen en pantalla no son los que se aplican."
      );
    }
  }

  /* --- Peso del objetivo --- */
  const pesoBase = num(plantilla?.pesoBase);
  if (pesoBase === 0) {
    push(
      ADVERTENCIA,
      "PESO_BASE_CERO",
      "pesoBase",
      "El objetivo pesa 0%.",
      "No va a influir en la nota final. Si la idea es que no cuente, conviene excluirlo en vez de dejarlo en 0."
    );
  }

  /* --- Calendario --- */
  if (periodos === 0 && plantilla?.frecuencia) {
    push(
      ERROR,
      "SIN_PERIODOS",
      "frecuencia",
      "El objetivo no genera ningún período de carga.",
      "Con este calendario no hay dónde cargar resultados, así que el objetivo nunca va a poder evaluarse. Suele pasar con una fecha de cierre anterior al inicio del año fiscal."
    );
  }

  return hallazgos;
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

/**
 * Revisa la coherencia de un objetivo contra lo que hace el motor.
 *
 * No reemplaza a `validarPlantilla` (que chequea lo formal: tipos, rangos,
 * campos obligatorios). Corre después y responde otra pregunta: con estos
 * campos bien puestos, ¿el número que va a salir es el que se quiso pedir?
 *
 * @param {Object} plantilla  objetivo ya saneado
 * @param {Object} [opts]
 * @param {Boolean} [opts.estricto]  forzar bloqueo sin mirar el año (tests, revisión manual)
 * @returns {{errores: Array, advertencias: Array, periodos: Number, estricto: Boolean}}
 */
export function validarCoherenciaObjetivo(plantilla = {}, opts = {}) {
  const periodos = cantidadDePeriodos(plantilla);

  const hallazgos = [
    ...revisarObjetivo(plantilla, periodos),
    ...(Array.isArray(plantilla?.metas) ? plantilla.metas : []).flatMap((m, i) =>
      revisarMeta(m, i, plantilla, periodos)
    ),
  ];

  const year = Number(plantilla?.year);
  const estricto =
    opts.estricto !== undefined
      ? !!opts.estricto
      : !Number.isFinite(year) || year >= AF_VALIDACION_ESTRICTA;

  // Fuera del modo estricto nada bloquea: los objetivos de años ya informados
  // se pueden seguir editando, con el problema a la vista.
  const errores = estricto ? hallazgos.filter((h) => h.nivel === ERROR) : [];
  const advertencias = estricto
    ? hallazgos.filter((h) => h.nivel === ADVERTENCIA)
    : hallazgos.map((h) => (h.nivel === ERROR ? { ...h, nivel: ADVERTENCIA, degradado: true } : h));

  return { errores, advertencias, periodos, estricto };
}

/**
 * Lo mismo para una lista, con un resumen por código.
 * Lo usa la pantalla de Control de Datos y el script de revisión.
 */
export function validarLote(plantillas = [], opts = {}) {
  const items = [];
  const porCodigo = new Map();

  for (const p of plantillas) {
    const r = validarCoherenciaObjetivo(p, opts);
    if (!r.errores.length && !r.advertencias.length) continue;

    items.push({
      plantillaId: String(p?._id || ""),
      nombre: p?.nombre || "",
      year: p?.year ?? null,
      frecuencia: p?.frecuencia || null,
      scopeType: p?.scopeType || null,
      activo: !!p?.activo,
      ...r,
    });

    for (const h of [...r.errores, ...r.advertencias]) {
      if (!porCodigo.has(h.codigo)) porCodigo.set(h.codigo, { codigo: h.codigo, nivel: h.nivel, cantidad: 0 });
      porCodigo.get(h.codigo).cantidad += 1;
    }
  }

  return {
    revisadas: plantillas.length,
    conHallazgos: items.length,
    conErrores: items.filter((i) => i.errores.length).length,
    resumen: [...porCodigo.values()].sort((a, b) => b.cantidad - a.cantidad),
    items,
  };
}

/**
 * Mensaje de una línea para el 400, cuando hay que cortar el guardado.
 * El detalle completo viaja aparte en `errores`.
 */
export function resumirErrores(errores = [], year) {
  if (!errores.length) return "";
  const etiqueta = Number.isFinite(Number(year)) ? ` (${etiquetaAnioFiscal(year)})` : "";
  if (errores.length === 1) return `${errores[0].mensaje}${etiqueta}`;
  return `El objetivo tiene ${errores.length} problemas de configuración${etiqueta}.`;
}
