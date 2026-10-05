// backend/src/lib/validacionEvaluaciones.js
//
// ============================================================================
//  VALIDADOR DE RESULTADOS CARGADOS
// ============================================================================
//
//  El otro validador (validacionObjetivos.js) mira cómo quedó configurado un
//  objetivo. Este mira lo que efectivamente se cargó contra él.
//
//  Son dos preguntas distintas y las dos hicieron falta: un objetivo puede
//  estar perfectamente configurado y tener resultados colgando de períodos que
//  ya no existen, cargados antes de que la persona entrara, o apuntando a una
//  meta que se borró. Nada de eso lo ve el motor: simplemente no los suma, y el
//  objetivo computa más bajo sin que nadie entienda por qué.
//
//  LOS CASOS QUE LO ORIGINARON
//    · Cambiar un objetivo de mensual a trimestral dejó 5 resultados colgados
//      de períodos inexistentes, en 20 personas, sin un solo aviso.
//    · 52 evaluaciones cargadas en períodos anteriores a la fecha de ingreso.
//    · ~719 metaId huérfanos: resultados que apuntan a metas que ya no están
//      en la plantilla, casi siempre por renombrar una meta sin mandar su _id.
//
//  SEVERIDADES
//    ERROR: el resultado NO se computa, o se computa contra la meta
//      equivocada. Hay que corregirlo o borrarlo.
//    ADVERTENCIA: se computa, pero hay algo que conviene mirar.
// ============================================================================

import { generarHitos } from "../utils/generarHitos.js";
import { mesesEnCiclo, esPeriodoAnteriorAlIngreso } from "./tiempoEfectivo.js";

const ERROR = "error";
const ADVERTENCIA = "advertencia";

const esBinaria = (meta) =>
  String(meta?.unidad || "").toLowerCase().includes("cumple");

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Períodos válidos de una plantilla, como Set, según el calendario real. */
export function periodosValidos(plantilla) {
  try {
    return new Set(generarHitos(plantilla).map((h) => h.periodo));
  } catch {
    return new Set();
  }
}

/**
 * Campos de configuración que `metasResultados` copia de la plantilla.
 *
 * El motor NO los usa —lee siempre la definición de la plantilla— pero quedan
 * guardados en cada resultado. Cuando divergen, la pantalla de detalle muestra
 * una cosa y la nota se calcula con otra, que es un buen susto sin ser un
 * error de cálculo.
 */
// El valor es el default del schema de Evaluacion.metasResultados. Un hito que
// tiene el default no está diciendo "esto vale X": está diciendo que nunca se
// copió nada. Comparar esos contra la plantilla da ruido y nada más: medido
// sobre el AF2025, 1761 de 1784 divergencias eran `pesoMeta: null` contra el
// 100 de la plantilla, y otras 525 `umbralPeriodos: 0` contra 12.
//
// Lo que queda después de descartarlos sí es señal: un hito con reglaCierre
// "umbral_periodos" cuando la plantilla hoy dice "promedio" significa que
// alguien cambió la configuración del objetivo después de cargar resultados.
// Eso son 47 casos, y vale la pena mirarlos.
const CAMPOS_COPIADOS = {
  unidad: undefined,
  operador: ">=",
  esperado: null,
  pesoMeta: null,
  reconoceEsfuerzo: true,
  permiteOver: false,
  tolerancia: 0,
  reglaCierre: "promedio",
  umbralPeriodos: 0,
  modoAcumulacion: "periodo",
};

/* ------------------------------------------------------------------ *
 * Validación de UNA evaluación
 * ------------------------------------------------------------------ */

/**
 * @param {Object} evaluacion   documento de Evaluacion (lean)
 * @param {Object} plantilla    la plantilla a la que pertenece
 * @param {Object} [contexto]
 * @param {Date|String} [contexto.fechaIngreso]  para detectar carga previa al ingreso
 * @param {Date}  [contexto.ahora]               para detectar períodos futuros (tests)
 * @param {Set}   [contexto.periodos]            calendario ya calculado (lote)
 * @returns {Array<{nivel, codigo, periodo, meta, mensaje, efecto}>}
 */
export function validarEvaluacion(evaluacion, plantilla, contexto = {}) {
  const hallazgos = [];
  const periodo = String(evaluacion?.periodo || "");
  const push = (nivel, codigo, mensaje, efecto, meta = null) =>
    hallazgos.push({ nivel, codigo, periodo, meta, mensaje, efecto });

  if (!plantilla) {
    push(
      ERROR,
      "PLANTILLA_INEXISTENTE",
      `El resultado de ${periodo} apunta a un objetivo que ya no existe.`,
      "No se computa en ninguna nota y no se ve en ninguna pantalla. Es un dato huérfano."
    );
    return hallazgos;
  }

  /* --- 1. El período existe en el calendario del objetivo --- */
  const periodos = contexto.periodos || periodosValidos(plantilla);
  if (periodo && periodos.size > 0 && !periodos.has(periodo)) {
    push(
      ERROR,
      "PERIODO_FUERA_DE_CALENDARIO",
      `El período ${periodo} no existe en el calendario de este objetivo (${plantilla.frecuencia}).`,
      "El resultado quedó colgado: no se ve en la pantalla de carga y el motor no lo suma. Suele pasar después de cambiarle la frecuencia al objetivo."
    );
  }

  // NO comparar el prefijo del período contra `plantilla.year`.
  //
  // Parece la verificación obvia y es falsa: el año fiscal 2025 va de
  // septiembre de 2025 a agosto de 2026, así que un objetivo mensual del
  // AF2025 genera "2025M09".."2025M12" y después "2026M01".."2026M08". Ocho
  // de cada doce períodos llevan legítimamente el año siguiente.
  //
  // Esa regla se escribió, se midió contra la base y marcó 1139 resultados
  // perfectamente válidos. El calendario de `generarHitos` ya es la única
  // autoridad sobre qué período existe: la verificación de arriba alcanza.

  /* --- 2. Carga anterior al ingreso de la persona --- */
  if (contexto.fechaIngreso) {
    const meses = mesesEnCiclo(contexto.fechaIngreso, Number(plantilla.year));
    if (meses < 12 && esPeriodoAnteriorAlIngreso(periodo, meses)) {
      push(
        ERROR,
        "PERIODO_PREVIO_AL_INGRESO",
        `Hay un resultado cargado en ${periodo}, anterior al ingreso de la persona.`,
        "Se le está evaluando un período en el que todavía no trabajaba acá. Ese resultado entra en la nota."
      );
    }
  }

  /* --- 3. Período futuro --- */
  const ahora = contexto.ahora || new Date();
  const mes = mesDelPeriodo(periodo, Number(plantilla.year));
  if (mes && mes > ahora) {
    push(
      ADVERTENCIA,
      "PERIODO_FUTURO",
      `El período ${periodo} todavía no terminó.`,
      "Es un resultado cargado por adelantado. Puede ser intencional, pero conviene confirmarlo."
    );
  }

  /* --- 4. Resultados por meta --- */
  const metasDef = Array.isArray(plantilla.metas) ? plantilla.metas : [];
  const idsDefinidos = new Set(metasDef.map((m) => String(m._id)));

  for (const res of evaluacion?.metasResultados || []) {
    const etiqueta = String(res?.nombre || "sin nombre");
    const metaId = res?.metaId ? String(res.metaId) : null;
    const def = metasDef.find((m) => String(m._id) === metaId);

    // 4a. metaId huérfano
    if (metasDef.length > 0 && (!metaId || !idsDefinidos.has(metaId))) {
      push(
        ERROR,
        "META_HUERFANA",
        `El resultado de "${etiqueta}" en ${periodo} apunta a una meta que ya no está en el objetivo.`,
        "El motor busca los resultados por metaId: este no lo encuentra, así que la meta computa como si nunca se hubiera cargado. Pasa al renombrar una meta sin conservar su identificador.",
        etiqueta
      );
      continue;
    }

    if (!def) continue;

    // 4b. Valor incompatible con la unidad
    const valor = res?.resultado;
    if (valor !== null && valor !== undefined && valor !== "") {
      if (esBinaria(def)) {
        const n = num(valor);
        const booleano = typeof valor === "boolean";
        if (!booleano && n !== null && n !== 0 && n !== 1) {
          push(
            ADVERTENCIA,
            "VALOR_BINARIO_RARO",
            `La meta "${etiqueta}" es Cumple/No Cumple pero tiene cargado ${valor} en ${periodo}.`,
            "El motor lo toma como cumplido por ser distinto de 0. Si la idea era cargar un porcentaje, la unidad de la meta está mal.",
            etiqueta
          );
        }
      } else if (num(valor) === null) {
        push(
          ERROR,
          "VALOR_NO_NUMERICO",
          `La meta "${etiqueta}" tiene cargado "${valor}" en ${periodo}, que no es un número.`,
          "El motor lo convierte a 0, así que el período cuenta como incumplido.",
          etiqueta
        );
      } else if (num(valor) < 0) {
        push(
          ADVERTENCIA,
          "VALOR_NEGATIVO",
          `La meta "${etiqueta}" tiene un valor negativo (${valor}) en ${periodo}.`,
          "El motor lleva el score a 0 para ese período. Si el negativo es correcto, conviene revisar el operador de la meta.",
          etiqueta
        );
      }
    }

    // 4c. Configuración copiada que ya no coincide con la plantilla
    const divergentes = Object.entries(CAMPOS_COPIADOS)
      .filter(([campo, porDefecto]) => {
        if (res[campo] === undefined || def[campo] === undefined) return false;
        // El hito trae el default: nunca copió este campo, no es una divergencia.
        if (porDefecto !== undefined && res[campo] === porDefecto) return false;
        const a = res[campo] === null ? null : String(res[campo]);
        const b = def[campo] === null ? null : String(def[campo]);
        return a !== b;
      })
      .map(([campo]) => campo);
    if (divergentes.length) {
      push(
        ADVERTENCIA,
        "CONFIG_DIVERGENTE",
        `La meta "${etiqueta}" tiene guardada en ${periodo} una configuración distinta a la del objetivo (${divergentes.join(", ")}).`,
        "La nota se calcula con la configuración del objetivo, no con esta copia. El detalle del período puede mostrar valores que no son los que se aplicaron.",
        etiqueta
      );
    }
  }

  return hallazgos;
}

/** Fecha aproximada de fin de un período, para detectar cargas adelantadas. */
function mesDelPeriodo(periodo, year) {
  const m = /^(\d{4})(M|Q|S|A)(\d+)$/.exec(String(periodo || ""));
  if (!m) return null;
  const [, anio, tipo, idxStr] = m;
  const idx = Number(idxStr);
  const base = Number(anio);
  if (tipo === "M") return new Date(base, idx, 0, 23, 59, 59);
  // Q/S/A se cuentan desde septiembre del año fiscal.
  const mesesDesdeInicio = tipo === "Q" ? idx * 3 : tipo === "S" ? idx * 6 : 12;
  return new Date(Number(year) || base, 8 + mesesDesdeInicio, 0, 23, 59, 59);
}

/* ------------------------------------------------------------------ *
 * Validación de un LOTE
 * ------------------------------------------------------------------ */

/**
 * Revisa todas las evaluaciones de una tanda.
 *
 * Además de lo que ve cada evaluación por separado, detecta el duplicado:
 * dos resultados para el mismo empleado, objetivo y período. El motor toma
 * los dos y promedia, que no es lo que nadie espera.
 *
 * @param {Array} evaluaciones
 * @param {Map|Object} plantillasPorId   Map(id → plantilla)
 * @param {Object} [opts]
 * @param {Map} [opts.ingresoPorEmpleado]  Map(empleadoId → fechaIngreso)
 * @param {Date} [opts.ahora]
 */
export function validarLoteEvaluaciones(evaluaciones = [], plantillasPorId = new Map(), opts = {}) {
  const get = (id) =>
    plantillasPorId instanceof Map ? plantillasPorId.get(String(id)) : plantillasPorId[String(id)];

  const items = [];
  const porCodigo = new Map();
  const vistos = new Map(); // empleado|plantilla|periodo → cantidad
  const calendarios = new Map(); // plantillaId → Set de períodos

  for (const ev of evaluaciones) {
    const plantilla = get(ev?.plantillaId);
    const pid = String(ev?.plantillaId || "");

    if (plantilla && !calendarios.has(pid)) calendarios.set(pid, periodosValidos(plantilla));

    const fechaIngreso = opts.ingresoPorEmpleado?.get?.(String(ev?.empleado)) ?? null;
    const hallazgos = validarEvaluacion(ev, plantilla, {
      fechaIngreso,
      ahora: opts.ahora,
      periodos: calendarios.get(pid),
    });

    const clave = `${ev?.empleado}|${pid}|${ev?.periodo}`;
    vistos.set(clave, (vistos.get(clave) || 0) + 1);
    if (vistos.get(clave) === 2) {
      hallazgos.push({
        nivel: ERROR,
        codigo: "PERIODO_DUPLICADO",
        periodo: String(ev?.periodo || ""),
        meta: null,
        mensaje: `Hay más de un resultado cargado para ${ev?.periodo} en este objetivo.`,
        efecto: "El motor toma todos los que encuentra y los promedia, así que el período pesa doble.",
      });
    }

    if (!hallazgos.length) continue;

    items.push({
      evaluacionId: String(ev?._id || ""),
      empleado: String(ev?.empleado || ""),
      plantillaId: pid,
      objetivo: plantilla?.nombre || "(objetivo inexistente)",
      year: plantilla?.year ?? ev?.year ?? null,
      periodo: String(ev?.periodo || ""),
      estado: ev?.estado || null,
      errores: hallazgos.filter((h) => h.nivel === ERROR),
      advertencias: hallazgos.filter((h) => h.nivel === ADVERTENCIA),
    });

    for (const h of hallazgos) {
      if (!porCodigo.has(h.codigo)) porCodigo.set(h.codigo, { codigo: h.codigo, nivel: h.nivel, cantidad: 0 });
      porCodigo.get(h.codigo).cantidad += 1;
    }
  }

  return {
    revisadas: evaluaciones.length,
    conHallazgos: items.length,
    conErrores: items.filter((i) => i.errores.length).length,
    resumen: [...porCodigo.values()].sort((a, b) => b.cantidad - a.cantidad),
    items,
  };
}
