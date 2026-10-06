// backend/src/reportes/dataset.js
//
// Arma el conjunto de datos del reporte de desempeño. Lo usan tanto el
// generador de Excel como el de PDF, así que los dos formatos salen de la
// misma fuente y no pueden diferir entre sí.
//
// DECISIÓN IMPORTANTE — de dónde sale cada número:
//
//   · Las NOTAS (obj / comp / global por período) se leen del feedback: la
//     confirmada si la hay, y si no el snapshot guardado. Es el registro de lo
//     que efectivamente se le comunicó a la persona, y lo acordado con RRHH
//     como LA nota del año. NO se recalculan: recalcular acá daría un número
//     distinto del que la gente ya vio y del que paga el bono.
//
//   · El DETALLE de objetivos y competencias son los valores efectivamente
//     cargados por período (resultado, cumple) más la configuración de la meta
//     (esperado, operador, unidad, peso). Todo dato guardado, nada calculado.
//
// El único campo derivado es `progreso` por objetivo, que viene de
// computeForEmployees; va rotulado como tal y aparte de las notas oficiales.

import Empleado from "../models/Empleado.model.js";
import Area from "../models/Area.model.js";
import Usuario from "../models/Usuario.model.js";
import { computeForEmployees } from "../controllers/dashboard.controller.js";
import { filtroAlcanceEmpleados, filtroDesvinculados } from "../utils/alcanceEmpleados.js";

export const PERIODOS_FEEDBACK = ["Q1", "Q2", "Q3", "FINAL"];

// Mismo formato que el front (src/lib/fiscalYear.js): el año fiscal 2025 va del
// 1/9/2025 al 31/8/2026 y se muestra "AF 2025/26".
export const fiscalYearLabel = (year) => `AF ${year}/${String(Number(year) + 1).slice(-2)}`;

const ESTADO_LABEL = {
  DRAFT: "Borrador",
  SENT: "Enviado al empleado",
  PENDING_HR: "Pendiente de RRHH",
  CLOSED: "Cerrado",
};

const ACK_LABEL = {
  ACK: "Conforme",
  CONTEST: "En desacuerdo",
  SYSTEM_CLOSED: "Cerrado por sistema",
};

const nombreCompleto = (e) =>
  `${e?.apellido || ""}${e?.apellido && e?.nombre ? ", " : ""}${e?.nombre || ""}`.trim() || "—";

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Resuelve qué empleados entran en el reporte, respetando el alcance del
 * usuario que lo pide (un jefe exporta solo su gente).
 */
async function resolverEmpleados({ user, alcance, id, incluirDesvinculados }) {
  const base = filtroDesvinculados(incluirDesvinculados);
  const condiciones = [base];

  if (alcance === "empleado" && id) condiciones.push({ _id: id });
  if (alcance === "area" && id) condiciones.push({ area: id });

  const recorte = filtroAlcanceEmpleados(user);
  if (recorte) condiciones.push(recorte);

  return Empleado.find(condiciones.length === 1 ? condiciones[0] : { $and: condiciones })
    .populate("area", "nombre referentes")
    .populate("sector", "nombre referentes")
    .select("_id nombre apellido puesto estadoLaboral area sector fechaIngreso")
    .lean();
}

/**
 * Nombre de los empleados que figuran como referentes, para poder mostrar
 * "quién es el jefe directo" sin hacer una consulta por persona.
 */
async function mapaDeNombres(ids) {
  const unicos = [...new Set(ids.map(String).filter(Boolean))];
  if (!unicos.length) return new Map();
  const docs = await Empleado.find({ _id: { $in: unicos } }, "nombre apellido").lean();
  return new Map(docs.map((e) => [String(e._id), nombreCompleto(e)]));
}

/**
 * Quién cargó cada feedback. El documento guarda `creadoPor` apuntando al
 * usuario; para mostrarlo hay que pasar por el empleado vinculado.
 */
async function mapaDeEvaluadores(feedbacks) {
  const ids = [...new Set(feedbacks.map((f) => f.creadoPor).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const usuarios = await Usuario.find({ _id: { $in: ids } }, "email empleado")
    .populate("empleado", "nombre apellido")
    .lean();
  return new Map(
    usuarios.map((u) => [String(u._id), u.empleado ? nombreCompleto(u.empleado) : (u.email || "—")])
  );
}

/** Feedback de un período, aplanado y con las etiquetas ya resueltas. */
function filaFeedback(fb) {
  if (!fb) return null;

  // La nota confirmada le gana a `scores`.
  //
  // Son el mismo número salvo que alguien edite el feedback después de
  // confirmarlo: `scores` se mueve y `oficial.nota` no. En un reporte que se
  // imprime y se archiva, el que vale es el que se fijó.
  const confirmada = fb.oficial?.confirmada ? fb.oficial.nota : null;
  const nota = confirmada ?? fb.scores;

  return {
    periodo: fb.periodo,
    estado: fb.estado,
    estadoLabel: ESTADO_LABEL[fb.estado] || fb.estado,
    oficialConfirmada: !!confirmada,
    obj: num(nota?.obj),
    comp: num(nota?.comp),
    global: num(nota?.global),
    enviado: fb.submittedToEmployeeAt || null,
    cerrado: fb.closedAt || null,
    ack: fb.empleadoAck?.estado || null,
    ackLabel: ACK_LABEL[fb.empleadoAck?.estado] || "",
    ackFecha: fb.empleadoAck?.fecha || null,
    motivoDesacuerdo: fb.motivoDesacuerdo || "",
    comentario: fb.comentario || "",
    comentarioEmpleado: fb.comentarioEmpleado || "",
    comentarioRRHH: fb.comentarioRRHH || "",
  };
}

/**
 * Orden cronológico dentro del año fiscal (arranca en septiembre).
 * Ordenar los períodos como texto ponía "2025Q1" entre "2025M12" y "2026M01",
 * o sea los trimestres en el medio de los meses.
 */
function ordenFiscal(periodo) {
  const m = String(periodo).match(/^(\d{4})?(M(\d{2})|Q(\d)|S(\d)|A)$/i);
  if (!m) return 9999;
  if (m[3]) {                       // mensual: sep..dic = 0..3, ene..ago = 4..11
    const mes = Number(m[3]);
    return mes >= 9 ? mes - 9 : mes + 3;
  }
  if (m[4]) return Number(m[4]);    // trimestral
  if (m[5]) return Number(m[5]);    // semestral
  return 0;                         // anual
}

/** Mensual / trimestral / otro: define en qué tabla va cada columna. */
export function frecuenciaDe(periodo) {
  const p = String(periodo).toUpperCase();
  if (/M\d{2}$/.test(p)) return "mensual";
  if (/Q\d$/.test(p)) return "trimestral";
  if (/S\d$/.test(p)) return "semestral";
  return "anual";
}

/**
 * Períodos en los que se cargó algo, agrupados por frecuencia y en orden
 * cronológico. Mezclar meses y trimestres en una sola tabla dejaba casi todas
 * las celdas vacías, porque cada objetivo vive en una sola frecuencia.
 */
function periodosDe(items) {
  const set = new Set();
  for (const it of items) for (const h of it.hitos || []) if (h?.periodo) set.add(h.periodo);
  const todos = [...set].sort((a, b) => ordenFiscal(a) - ordenFiscal(b));
  const grupos = {};
  for (const p of todos) {
    const f = frecuenciaDe(p);
    (grupos[f] ||= []).push(p);
  }
  return { todos, grupos };
}

const promedio = (valores) => {
  const v = valores.filter((n) => n !== null && n !== undefined && !Number.isNaN(n));
  return v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null;
};

/**
 * Promedios de un conjunto de empleados por período, separando objetivos y
 * competencias. Antes solo se promediaba el global, y así el reporte no dejaba
 * ver de qué lado venía el número.
 */
function resumirGrupo(empleados) {
  const promedios = {};
  for (const p of PERIODOS_FEEDBACK) {
    promedios[p] = {
      obj: promedio(empleados.map((e) => e.feedback[p]?.obj)),
      comp: promedio(empleados.map((e) => e.feedback[p]?.comp)),
      global: promedio(empleados.map((e) => e.feedback[p]?.global)),
    };
  }
  return {
    promedios,
    conNota: empleados.filter((e) =>
      PERIODOS_FEEDBACK.some((p) => e.feedback[p]?.global != null)
    ).length,
    // Avance cargado hasta hoy, que existe aunque todavía no haya feedback.
    // Sin esto, un año recién empezado sale con todas las celdas vacías.
    avanceObjetivos: promedio(empleados.flatMap((e) => e.objetivos.map((o) => o.progreso))),
    avanceCompetencias: promedio(empleados.flatMap((e) => e.competencias.map((c) => c.puntuacion))),
    pesosFueraDe100: empleados.filter(
      (e) => e.objetivos.length > 0 && e.sumaPesoObjetivos !== 100
    ).length,
  };
}

/**
 * @returns {Promise<{
 *   anio:number, anioLabel:string, generadoEl:Date, alcance:string,
 *   titulo:string, empleados:Array, areas:Array, totales:Object
 * }>}
 */
export async function construirDataset({
  user,
  anio,
  alcance = "nomina",
  id = null,
  incluirDesvinculados = false,
}) {
  const empleados = await resolverEmpleados({ user, alcance, id, incluirDesvinculados });
  if (!empleados.length) {
    return {
      anio, anioLabel: fiscalYearLabel(anio), generadoEl: new Date(),
      alcance, titulo: "Sin empleados en el alcance seleccionado",
      empleados: [], areas: [],
    };
  }

  const computados = await computeForEmployees(empleados.map((e) => e._id), anio);
  const porId = new Map(computados.map((c) => [String(c.empleado._id), c]));

  // Referentes (jefe directo) y evaluadores, resueltos en bloque.
  const idsReferentes = empleados.flatMap((e) => [
    ...(e.sector?.referentes || []),
    ...(e.area?.referentes || []),
  ]);
  const todosLosFeedbacks = computados.flatMap((c) => c?.feedbacks || []);
  const [nombresReferentes, evaluadores] = await Promise.all([
    mapaDeNombres(idsReferentes),
    mapaDeEvaluadores(todosLosFeedbacks),
  ]);

  const filas = empleados.map((e) => {
    const c = porId.get(String(e._id));
    const objetivos = c?.objetivos?.items || [];
    const competencias = c?.aptitudes?.items || [];
    const feedbacks = c?.feedbacks || [];

    const porPeriodo = {};
    for (const p of PERIODOS_FEEDBACK) {
      const fb = feedbacks.find((f) => f.periodo === p);
      porPeriodo[p] = filaFeedback(fb);
      if (porPeriodo[p]) {
        porPeriodo[p].evaluador = fb?.creadoPor
          ? evaluadores.get(String(fb.creadoPor)) || "—"
          : "—";
      }
    }

    // El referente directo es el del sector si lo tiene; si no, el del área.
    // Uno puede figurar en varios, así que se listan todos y se marca de dónde
    // viene cada uno.
    const refSector = (e.sector?.referentes || [])
      .map((r) => nombresReferentes.get(String(r))).filter(Boolean);
    const refArea = (e.area?.referentes || [])
      .map((r) => nombresReferentes.get(String(r))).filter(Boolean);
    const propio = nombreCompleto(e);
    const referentes = (refSector.length ? refSector : refArea)
      .filter((n) => n !== propio);   // uno no es referente de sí mismo

    return {
      referentes,
      referenteDirecto: referentes[0] || "—",
      referenteOrigen: refSector.length ? "sector" : refArea.length ? "área" : "",
      empleadoId: String(e._id),
      nombre: e.nombre || "",
      apellido: e.apellido || "",
      nombreCompleto: nombreCompleto(e),
      puesto: e.puesto || "",
      estadoLaboral: e.estadoLaboral || "",
      area: e.area?.nombre || "",
      areaId: e.area?._id ? String(e.area._id) : "",
      sector: e.sector?.nombre || "",
      fechaIngreso: e.fechaIngreso || null,

      objetivos: objetivos.map((o) => ({
        nombre: o.nombre,
        peso: num(o.peso) ?? 0,
        frecuencia: o.frecuencia || "",
        progreso: num(o.progreso),          // derivado — rotulado como tal
        reglaCierre: o.reglaCierre || "",
        metas: (o.metas || []).map((m) => ({
          nombre: m.nombre,
          unidad: m.unidad || "",
          operador: m.operador || "",
          esperado: num(m.esperado),
          pesoMeta: num(m.pesoMeta),
          // Valor cargado en cada período, tal cual quedó guardado.
          resultados: (o.hitos || []).map((h) => {
            const mr = (h.metas || []).find(
              (x) => String(x.metaId ?? x._id) === String(m._id) || x.nombre === m.nombre
            );
            return {
              periodo: h.periodo,
              resultado: num(mr?.resultado),
              cumple: mr?.cumple ?? null,
            };
          }),
        })),
      })),
      periodosObjetivos: periodosDe(objetivos),

      competencias: competencias.map((a) => ({
        nombre: a.nombre,
        peso: num(a.peso) ?? 0,
        puntuacion: num(a.puntuacion),      // derivado (promedio de los hitos)
        resultados: (a.hitos || []).map((h) => ({
          periodo: h.periodo,
          puntuacion: num(h.actual),
        })),
      })),
      periodosCompetencias: periodosDe(competencias),

      sumaPesoObjetivos: num(c?.objetivos?.sumPeso) ?? 0,
      sumaPesoCompetencias: num(c?.aptitudes?.sumPeso) ?? 0,
      feedback: porPeriodo,
    };
  });

  filas.sort((a, b) =>
    (a.area || "~").localeCompare(b.area || "~", "es") ||
    a.nombreCompleto.localeCompare(b.nombreCompleto, "es")
  );

  // Agrupado por área, para la bajada correspondiente.
  const mapaAreas = new Map();
  for (const f of filas) {
    const clave = f.areaId || "__sin_area__";
    if (!mapaAreas.has(clave)) {
      mapaAreas.set(clave, { areaId: f.areaId, nombre: f.area || "Sin área", empleados: [] });
    }
    mapaAreas.get(clave).empleados.push(f);
  }
  const areas = [...mapaAreas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  for (const a of areas) Object.assign(a, resumirGrupo(a.empleados));
  const totales = resumirGrupo(filas);

  let titulo = `Resultados de desempeño — ${fiscalYearLabel(anio)}`;
  if (alcance === "empleado" && id) titulo = `${filas[0]?.nombreCompleto || ""} — ${fiscalYearLabel(anio)}`;
  if (alcance === "area" && id) titulo = `${areas[0]?.nombre || ""} — ${fiscalYearLabel(anio)}`;

  return {
    anio,
    anioLabel: fiscalYearLabel(anio),
    generadoEl: new Date(),
    alcance,
    titulo,
    empleados: filas,
    areas,
    totales,
  };
}

export async function listarAreas() {
  return Area.find({}, "nombre").sort({ nombre: 1 }).lean();
}
