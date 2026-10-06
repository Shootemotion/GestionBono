// backend/src/controllers/divergencias.controller.js
//
// Compara la nota guardada en cada feedback contra la que da el motor hoy, y
// explica la diferencia.
//
// La explicación necesita evidencia que el front no tiene: las fechas reales
// de inserción, la auditoría, las evaluaciones crudas. Por eso vive acá y la
// pantalla solo muestra lo que se le responde — el mismo criterio que con la
// validación de objetivos.
//
// Las reproducciones (recalcular bajo una hipótesis para ver si devuelve la
// nota comunicada) también se hacen acá: son el paso que convierte "esto
// cambió después" en "esto lo explica".

import mongoose from "mongoose";
import Feedback from "../models/Feedback.model.js";
import Empleado from "../models/Empleado.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Auditoria from "../models/Auditoria.model.js";
import { computeForEmployees } from "./dashboard.controller.js";
import { calcularScoresPeriodo, getPeriodMonth } from "../lib/feedbackScores.js";
import { calculateObjectiveProgress, calculateCompetencyProgress } from "../lib/scoringCore.ts";
import { explicarDivergencia, TOLERANCIA } from "../lib/atribucionDivergencia.js";
import { validarEvaluacion } from "../lib/validacionEvaluaciones.js";
import { anioFiscalActual } from "../lib/fiscalYear.js";
import { filtroDesvinculados, pidioIncluirDesvinculados } from "../utils/alcanceEmpleados.js";

/** Marca de inserción real; el cliente no puede falsificarla. */
const creadoEl = (doc) => {
  try {
    return new mongoose.Types.ObjectId(String(doc._id)).getTimestamp();
  } catch {
    return doc?.createdAt ? new Date(doc.createdAt) : null;
  }
};

const listaObjetivos = (dash) => dash?.objetivos?.items ?? dash?.objetivos ?? [];

/**
 * Recalcula la nota de un período excluyendo algunos objetivos, o forzando el
 * modo seguimiento.
 *
 * Es `calcularScoresPeriodo` con dos perillas. No se reutiliza esa función
 * con parámetros extra a propósito: la del cálculo real no debe aceptar
 * "calculá distinto", que es justamente lo que se quiere poder afirmar que no
 * pasa en producción.
 */
function recalcular(
  dash,
  periodo,
  {
    excluirIds = new Set(),
    excluirHitos = new Set(),
    forzarSeguimiento = false,
    metasPorObjetivo = null,
  } = {}
) {
  const limite = getPeriodMonth(periodo);
  const esCierre = forzarSeguimiento ? false : limite === 12 || periodo === "FINAL";

  let totalObj = 0;
  for (const obj of listaObjetivos(dash)) {
    if (excluirIds.has(String(obj._id))) continue;
    const hitos = (obj.hitos || []).filter(
      (h) => getPeriodMonth(h.periodo) <= limite && !excluirHitos.has(`${obj._id}|${h.periodo}`)
    );
    if (!hitos.length) continue;

    // Con `metasPorObjetivo` el objetivo se evalúa con la configuración que
    // tenía otro día, sobre los mismos resultados. Es lo que permite separar
    // "cambiaron los datos" de "cambió la regla con la que se miden".
    const definicion = metasPorObjetivo?.get(String(obj._id));
    const objetivo = definicion ? { ...obj, metas: definicion } : obj;

    totalObj += calculateObjectiveProgress(objetivo, hitos, esCierre) * (obj.peso || 0);
  }

  const scoreObj = (totalObj / 100) * 0.7;
  const scoreComp = calculateCompetencyProgress(dash.aptitudes, getPeriodMonth, limite) * 0.3;
  return {
    obj: +scoreObj.toFixed(1),
    comp: +scoreComp.toFixed(1),
    global: +(scoreObj + scoreComp).toFixed(1),
  };
}

/**
 * GET /api/divergencias?year=2025[&empleadoId=...]
 *
 * Devuelve, por feedback, la nota guardada, la de hoy y por qué difieren.
 */
export async function listarDivergencias(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    const { empleadoId } = req.query;
    const soloDivergentes = req.query.todos !== "true";

    if (empleadoId && !mongoose.isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "empleadoId inválido" });
    }

    // Los desvinculados no salen salvo que se pidan: su ciclo ya terminó y
    // revisar sus divergencias solo agrega ruido al listado.
    const filtroEmp = empleadoId
      ? { _id: empleadoId }
      : filtroDesvinculados(pidioIncluirDesvinculados(req));
    const empleados = await Empleado.find(filtroEmp).select("nombre apellido fechaIngreso").lean();
    if (!empleados.length) return res.json({ year, items: [], resumen: [] });

    const ids = empleados.map((e) => e._id);
    const nombre = new Map(
      empleados.map((e) => [String(e._id), `${e.apellido ?? ""}, ${e.nombre ?? ""}`.trim()])
    );

    const [feedbacks, dashes, plantillas] = await Promise.all([
      Feedback.find({ year, empleado: { $in: ids }, "scores.global": { $ne: null } }).lean(),
      computeForEmployees(ids, year),
      Plantilla.find({ year, tipo: "objetivo" })
        .select("nombre year frecuencia metas fechaInicioFiscal fechaCierre fechaCierreCustom")
        .lean(),
    ]);

    const porEmpleado = new Map(dashes.map((d) => [String(d.empleado._id), d]));
    const plantillaPorId = new Map(plantillas.map((p) => [String(p._id), p]));

    // La evidencia se trae de una sola vez para todos: pedirla por feedback
    // serían cientos de consultas por los mismos documentos.
    const [evaluaciones, auditoria] = await Promise.all([
      Evaluacion.find({ empleado: { $in: ids } })
        .select("empleado plantillaId periodo metasResultados updatedAt")
        .lean(),
      Auditoria.find({
        $or: [{ "antes.empleado": { $in: ids } }, { entidad: "plantilla" }],
      })
        .select("entidad accion documentoId email resumen createdAt antes")
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean(),
    ]);

    // Desde cuándo hay registro de cambios. Marca el límite del análisis: para
    // un feedback cerrado antes de esta fecha no se puede reconstruir cómo
    // estaba configurado ese día, y la pantalla tiene que poder decirlo.
    const [primerRegistro] = await Auditoria.find({}).select("createdAt").sort({ createdAt: 1 }).limit(1).lean();
    const auditoriaDesde = primerRegistro?.createdAt || null;

    const evalsPorEmpleado = new Map();
    for (const ev of evaluaciones) {
      const k = String(ev.empleado);
      if (!evalsPorEmpleado.has(k)) evalsPorEmpleado.set(k, []);
      evalsPorEmpleado.get(k).push(ev);
    }

    // La auditoría se liga a cada persona por dos caminos, porque los cambios
    // que le mueven la nota vienen de dos lados:
    //   · Overrides: el registro guarda el empleado en `antes.empleado`.
    //   · Plantillas: el registro no sabe de empleados. La ligadura es el
    //     objetivo: si la plantilla que le computa a esta persona se editó
    //     después del cierre, ese cambio es suyo aunque el log no lo diga.
    // Sin el segundo camino quedaban 8 casos detectados en vez de los reales.
    const auditPorEmpleado = new Map();
    const auditPorPlantilla = new Map();
    for (const a of auditoria) {
      if (a?.antes?.empleado) {
        const k = String(a.antes.empleado);
        if (!auditPorEmpleado.has(k)) auditPorEmpleado.set(k, []);
        auditPorEmpleado.get(k).push(a);
      }
      if (a.entidad === "plantilla" && a.documentoId) {
        const k = String(a.documentoId);
        if (!auditPorPlantilla.has(k)) auditPorPlantilla.set(k, []);
        auditPorPlantilla.get(k).push(a);
      }
    }

    const items = [];
    for (const fb of feedbacks) {
      const empId = String(fb.empleado);
      const dash = porEmpleado.get(empId);
      if (!dash) continue;

      const actuales = calcularScoresPeriodo(dash, fb.periodo);
      const diferencia = Number(actuales.global) - Number(fb.scores.global);
      if (soloDivergentes && Math.abs(diferencia) <= TOLERANCIA) continue;

      const cerradoEl = fb.closedAt ? new Date(fb.closedAt) : null;
      const objetivos = listaObjetivos(dash);

      // Reproducción 1: sin los objetivos que no existían al cerrar.
      const posteriores = new Set(
        objetivos.filter((o) => cerradoEl && creadoEl(o) > cerradoEl).map((o) => String(o._id))
      );
      const sinPosteriores = posteriores.size
        ? recalcular(dash, fb.periodo, { excluirIds: posteriores }).global
        : null;

      // Reproducción 2: con la regla de seguimiento en vez de la de cierre.
      // Solo tiene sentido en el período de cierre, que es donde difieren.
      const conSeguimiento =
        fb.periodo === "FINAL" ? recalcular(dash, fb.periodo, { forzarSeguimiento: true }).global : null;

      // Evaluaciones de este período, para detectar cargas posteriores.
      const limite = getPeriodMonth(fb.periodo);
      const delPeriodo = (evalsPorEmpleado.get(empId) || []).filter(
        (ev) => getPeriodMonth(ev.periodo) <= limite
      );

      // Reproducción 3: la foto del día del cierre.
      //
      // Se sacan los resultados que todavía no existían —los creados después—
      // junto con los objetivos que tampoco existían. Es la más fuerte de las
      // tres: si devuelve la nota comunicada, la diferencia es exactamente
      // todo lo que se cargó después, sin margen para interpretación.
      //
      // Un resultado EDITADO después del cierre no se puede deshacer así: se
      // sabe que cambió, no a qué valor. Esos casos quedan sin reproducir a
      // propósito, y el veredicto lo dice en vez de forzar una explicación.
      const hitosPosteriores = new Set(
        delPeriodo
          .filter((ev) => cerradoEl && creadoEl(ev) > cerradoEl)
          .map((ev) => `${ev.plantillaId}|${ev.periodo}`)
      );
      const comoAlCerrar =
        cerradoEl && (hitosPosteriores.size || posteriores.size)
          ? recalcular(dash, fb.periodo, {
              excluirIds: posteriores,
              excluirHitos: hitosPosteriores,
            }).global
          : null;

      // Reproducción 4: con la configuración que tenían los objetivos ese día.
      //
      // La auditoría guarda el documento completo previo a cada cambio, así
      // que la versión vigente al cerrar es el `antes` del cambio más viejo
      // posterior a esa fecha. Recalcular con esas metas, sobre los mismos
      // resultados, separa "cambiaron los datos" de "cambió la regla".
      const metasDelCierre = new Map();
      if (cerradoEl) {
        for (const o of objetivos) {
          const cambios = (auditPorPlantilla.get(String(o._id)) || [])
            .filter((a) => new Date(a.createdAt) > cerradoEl && Array.isArray(a.antes?.metas))
            .sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
          if (cambios.length) metasDelCierre.set(String(o._id), cambios[0].antes.metas);
        }
      }
      const conConfigDelCierre = metasDelCierre.size
        ? recalcular(dash, fb.periodo, { metasPorObjetivo: metasDelCierre }).global
        : null;

      // Y las dos cosas juntas: la foto completa del día del cierre.
      const comoAlCerrarCompleto =
        metasDelCierre.size && (hitosPosteriores.size || posteriores.size)
          ? recalcular(dash, fb.periodo, {
              excluirIds: posteriores,
              excluirHitos: hitosPosteriores,
              metasPorObjetivo: metasDelCierre,
            }).global
          : null;

      // Hallazgos del validador que afectan a esta persona y período.
      const hallazgos = delPeriodo.flatMap((ev) =>
        validarEvaluacion(ev, plantillaPorId.get(String(ev.plantillaId)), {
          fechaIngreso: empleados.find((e) => String(e._id) === empId)?.fechaIngreso,
        })
      );

      const explicacion = explicarDivergencia({
        feedback: fb,
        scoresActuales: actuales,
        dash,
        evaluaciones: delPeriodo,
        auditoria: [
          ...(auditPorEmpleado.get(empId) || []),
          ...objetivos.flatMap((o) => auditPorPlantilla.get(String(o._id)) || []),
        ],
        hallazgos,
        reproduccion: { sinPosteriores, conSeguimiento, comoAlCerrar, conConfigDelCierre, comoAlCerrarCompleto },
        auditoriaDesde,
      });

      items.push({
        feedbackId: String(fb._id),
        empleadoId: empId,
        empleado: nombre.get(empId) || empId,
        periodo: fb.periodo,
        estado: fb.estado,
        ...explicacion,
        // Después del spread: la explicación trae `guardado` y `actual` como
        // números sueltos, y acá hacen falta las tres partes de cada nota.
        guardado: { obj: fb.scores.obj, comp: fb.scores.comp, global: fb.scores.global },
        actual: actuales,
      });
    }

    // Lo más grave arriba.
    items.sort((a, b) => Math.abs(b.divergencia ?? 0) - Math.abs(a.divergencia ?? 0));

    const porCodigo = new Map();
    for (const i of items) {
      for (const c of i.causas) {
        if (!porCodigo.has(c.codigo)) porCodigo.set(c.codigo, { codigo: c.codigo, titulo: c.titulo, cantidad: 0 });
        porCodigo.get(c.codigo).cantidad += 1;
      }
    }
    const porVeredicto = items.reduce((acc, i) => {
      acc[i.veredicto.nivel] = (acc[i.veredicto.nivel] || 0) + 1;
      return acc;
    }, {});

    res.json({
      year,
      auditoriaDesde,
      revisados: feedbacks.length,
      divergentes: items.length,
      porVeredicto,
      resumen: [...porCodigo.values()].sort((a, b) => b.cantidad - a.cantidad),
      items,
    });
  } catch (err) {
    console.error("listarDivergencias error:", err);
    res.status(500).json({ message: "Error analizando las divergencias" });
  }
}
