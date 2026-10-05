// backend/src/controllers/divergenciaDetalle.controller.js
//
// El desglose, objetivo por objetivo, de por qué una nota cambió.
//
// El análisis general dice "los objetivos aportaban 41,5 y hoy aportan 52,5".
// Eso ubica el problema pero no lo explica: quedan 11 puntos sin dueño y la
// pregunta siguiente es siempre "¿cuál de los objetivos?".
//
// Acá se abre esa cuenta. Para cada objetivo se muestra cuánto aporta hoy,
// cuánto pesa, y qué le pasó desde que se cerró el feedback: si lo editaron
// —con el peso de antes y el de ahora, la fecha y quién—, si cambió su
// configuración, si tiene resultados que el motor no suma, o si directamente
// no existía.
//
// La suma de los aportes da el número de la columna "objetivos". Esa es la
// prueba de que el desglose está completo y no es una lista de sospechas: si
// no cerrara, faltaría algo.
//
// LÍMITE: la auditoría empezó el 08/09/2026. Para lo anterior se puede decir
// qué objetivo aporta cuánto hoy, pero no con qué peso se cerró.

import mongoose from "mongoose";
import Feedback from "../models/Feedback.model.js";
import Empleado from "../models/Empleado.model.js";
import Auditoria from "../models/Auditoria.model.js";
import Plantilla from "../models/Plantilla.model.js";
import { computeForEmployees } from "./dashboard.controller.js";
import { calcularScoresPeriodo, getPeriodMonth } from "../lib/feedbackScores.js";
import { calculateObjectiveProgress } from "../lib/scoringCore.js";
import { validarEvaluacion } from "../lib/validacionEvaluaciones.js";

const redondear = (n) => Math.round(Number(n) * 10) / 10;

const creadoEl = (doc) => {
  try {
    return new mongoose.Types.ObjectId(String(doc._id)).getTimestamp();
  } catch {
    return doc?.createdAt ? new Date(doc.createdAt) : null;
  }
};

/**
 * Qué le pasó a los pesos de esta persona después del cierre.
 *
 * La auditoría de overrides guarda el array completo de los que tenía antes
 * del cambio, así que se puede decir con qué peso estaba cada objetivo ese
 * día y compararlo con el de ahora. Es la respuesta a "¿cuándo cambiaron los
 * pesos?" con fecha y responsable, no una inferencia.
 */
function cambiosDePeso(auditoriaOverrides, cerradoEl) {
  const porPlantilla = new Map();

  const posteriores = (auditoriaOverrides || [])
    .filter((a) => cerradoEl && new Date(a.createdAt) > cerradoEl && Array.isArray(a.antes))
    .sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));

  // El primero posterior al cierre tiene el estado que había ese día.
  const primero = posteriores[0];
  if (!primero) return porPlantilla;

  for (const ov of primero.antes) {
    porPlantilla.set(String(ov.template), {
      pesoAlCerrar: ov.excluido ? null : ov.peso,
      excluidoAlCerrar: !!ov.excluido,
      cuando: new Date(primero.createdAt).toISOString().slice(0, 10),
      quien: primero.email || "?",
      accion: primero.accion,
    });
  }
  return porPlantilla;
}

/**
 * GET /api/divergencias/detalle?empleadoId=&year=&periodo=
 */
export async function detalleDivergencia(req, res) {
  try {
    const { empleadoId, periodo } = req.query;
    const year = Number(req.query.year);

    if (!mongoose.isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "empleadoId inválido" });
    }
    if (!periodo || !Number.isFinite(year)) {
      return res.status(400).json({ message: "Faltan year o periodo" });
    }

    const [empleado, feedbacks] = await Promise.all([
      Empleado.findById(empleadoId).select("nombre apellido fechaIngreso").lean(),
      Feedback.find({ empleado: empleadoId, year }).lean(),
    ]);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    const fb = feedbacks.find((f) => f.periodo === periodo);
    const cerradoEl = fb?.closedAt ? new Date(fb.closedAt) : null;

    const [dash] = await computeForEmployees([empleado._id], year);
    if (!dash) return res.status(404).json({ message: "Sin datos para ese año" });

    const objetivos = dash.objetivos?.items ?? dash.objetivos ?? [];
    const limite = getPeriodMonth(periodo);
    const esCierre = limite === 12 || periodo === "FINAL";

    // Auditoría: la de los objetivos de esta persona y la de sus pesos.
    const idsPlantilla = objetivos.map((o) => o._id);
    const [auditPlantillas, auditOverrides, plantillas] = await Promise.all([
      Auditoria.find({ entidad: "plantilla", documentoId: { $in: idsPlantilla } })
        .select("accion documentoId email resumen createdAt antes cambios")
        .sort({ createdAt: 1 })
        .lean(),
      Auditoria.find({ entidad: "override", "antes.empleado": empleado._id })
        .select("accion email createdAt antes")
        .sort({ createdAt: 1 })
        .lean(),
      Plantilla.find({ _id: { $in: idsPlantilla } })
        .select("nombre frecuencia metas year fechaInicioFiscal fechaCierre fechaCierreCustom")
        .lean(),
    ]);

    const auditPorPlantilla = new Map();
    for (const a of auditPlantillas) {
      const k = String(a.documentoId);
      if (!auditPorPlantilla.has(k)) auditPorPlantilla.set(k, []);
      auditPorPlantilla.get(k).push(a);
    }
    const pesosAlCerrar = cambiosDePeso(auditOverrides, cerradoEl);
    const plantillaPorId = new Map(plantillas.map((p) => [String(p._id), p]));

    const filas = objetivos.map((o) => {
      const oid = String(o._id);
      const peso = Number(o.peso || 0);
      const hitos = (o.hitos || []).filter((h) => getPeriodMonth(h.periodo) <= limite);

      const progreso = hitos.length ? calculateObjectiveProgress(o, hitos, esCierre) : 0;
      // Mismo reparto que `calcularScoresPeriodo`: se divide por 100 fijo y se
      // pesa 70%. Por eso la suma de esta columna da la nota de objetivos.
      const aporte = (progreso * peso) / 100 * 0.7;

      // El peso que tenía al cerrar sale de la auditoría de overrides, y hace
      // falta antes de comparar nada: es el denominador de la comparación.
      const peso0 = pesosAlCerrar.get(oid);
      const cambioDePeso =
        peso0 && Number(peso0.pesoAlCerrar ?? -1) !== peso
          ? { ...peso0, pesoAhora: peso }
          : null;

      const cambios = (auditPorPlantilla.get(oid) || []).filter(
        (a) => cerradoEl && new Date(a.createdAt) > cerradoEl
      );

      // Qué cambió exactamente en cada edición posterior al cierre.
      const ediciones = cambios.map((a) => {
        const antes = a.antes || {};
        const detalle = [];
        if (antes.pesoBase != null && Number(antes.pesoBase) !== Number(o.pesoBase ?? peso)) {
          detalle.push({ campo: "peso del objetivo", antes: antes.pesoBase, ahora: o.pesoBase ?? peso });
        }
        if (antes.frecuencia && o.frecuencia && antes.frecuencia !== o.frecuencia) {
          detalle.push({ campo: "frecuencia", antes: antes.frecuencia, ahora: o.frecuencia });
        }

        // Comparación meta por meta: el nombre no alcanza para saber qué se
        // tocó, y "se editó el objetivo" sin más deja la pregunta abierta.
        const metasAntes = Array.isArray(antes.metas) ? antes.metas : [];
        const metasAhora = Array.isArray(o.metas) ? o.metas : [];
        if (metasAntes.length !== metasAhora.length) {
          detalle.push({ campo: "cantidad de metas", antes: metasAntes.length, ahora: metasAhora.length });
        }
        for (const mAntes of metasAntes) {
          const mAhora = metasAhora.find((m) => String(m._id) === String(mAntes._id));
          if (!mAhora) {
            detalle.push({ campo: `meta "${mAntes.nombre}"`, antes: "existía", ahora: "se quitó" });
            continue;
          }
          for (const campo of ["esperado", "operador", "reglaCierre", "umbralPeriodos", "pesoMeta", "reconoceEsfuerzo"]) {
            const vA = mAntes[campo] ?? null;
            const vB = mAhora[campo] ?? null;
            if (String(vA) !== String(vB)) {
              detalle.push({ campo: `${mAntes.nombre} · ${campo}`, antes: vA, ahora: vB });
            }
          }
        }

        return {
          cuando: new Date(a.createdAt).toISOString().slice(0, 10),
          quien: a.email || "?",
          accion: a.accion,
          detalle,
        };
      });

      // Cuánto aportaba este objetivo con la configuración que tenía al
      // cerrar. Es la comparación que responde "¿por qué antes daba otra cosa?"
      // en vez de limitarse a avisar que alguien lo tocó.
      //
      // `antes` del cambio más viejo posterior al cierre es la versión que
      // estaba vigente ese día.
      let aporteAlCerrar = null;
      const primeraEdicion = cambios.find((a) => Array.isArray(a.antes?.metas));
      if (primeraEdicion && hitos.length) {
        const pesoEntonces =
          peso0?.pesoAlCerrar != null
            ? Number(peso0.pesoAlCerrar)
            : Number(primeraEdicion.antes.pesoBase ?? peso);
        const progresoEntonces = calculateObjectiveProgress(
          { ...o, metas: primeraEdicion.antes.metas },
          hitos,
          esCierre
        );
        aporteAlCerrar = redondear((progresoEntonces * pesoEntonces) / 100 * 0.7);
      } else if (peso0?.pesoAlCerrar != null && Number(peso0.pesoAlCerrar) !== peso) {
        // No cambió la configuración, solo el peso.
        aporteAlCerrar = redondear((progreso * Number(peso0.pesoAlCerrar)) / 100 * 0.7);
      }

      // Datos que el motor no suma, de este objetivo y período.
      const pl = plantillaPorId.get(oid);
      const evaluacionesDelObj = (dash.evaluaciones || []).filter(
        (e) => String(e.plantillaId) === oid && getPeriodMonth(e.periodo) <= limite
      );
      const noComputan = evaluacionesDelObj.flatMap((e) =>
        validarEvaluacion(e, pl, { fechaIngreso: empleado.fechaIngreso })
      ).filter((h) => h.nivel === "error");

      const nacioDespues = cerradoEl && creadoEl(o) > cerradoEl;

      return {
        objetivoId: oid,
        nombre: o.nombre,
        peso,
        progreso: redondear(progreso),
        aporte: redondear(aporte),
        aporteAlCerrar,
        cambioDeAporte: aporteAlCerrar != null ? redondear(aporte - aporteAlCerrar) : null,
        periodosConDatos: hitos.length,
        nacioDespuesDelCierre: !!nacioDespues,
        creadoEl: creadoEl(o)?.toISOString().slice(0, 10) ?? null,
        cambioDePeso,
        ediciones,
        noComputan: noComputan.slice(0, 6).map((h) => ({
          codigo: h.codigo,
          periodo: h.periodo,
          meta: h.meta,
          mensaje: h.mensaje,
        })),
        // Para ordenar: lo que tiene algo que explicar, arriba.
        tieneNovedad: !!(nacioDespues || cambioDePeso || ediciones.length || noComputan.length),
      };
    });

    filas.sort(
      (a, b) => Number(b.tieneNovedad) - Number(a.tieneNovedad) || b.aporte - a.aporte
    );

    const actuales = calcularScoresPeriodo(dash, periodo);
    const sumaAportes = redondear(filas.reduce((s, f) => s + f.aporte, 0));

    res.json({
      empleado: `${empleado.apellido ?? ""}, ${empleado.nombre ?? ""}`.trim(),
      year,
      periodo,
      cerradoEl: cerradoEl ? cerradoEl.toISOString() : null,
      comunicada: fb?.scores
        ? { obj: fb.scores.obj, comp: fb.scores.comp, global: fb.scores.global }
        : null,
      actual: actuales,
      sumaDePesos: redondear(filas.reduce((s, f) => s + f.peso, 0)),
      // Si esto no coincide con `actual.obj`, el desglose no está completo y
      // hay que mirarlo antes de creerle.
      sumaDeAportes: sumaAportes,
      cuadra: Math.abs(sumaAportes - Number(actuales.obj)) <= 0.2,
      objetivos: filas,
    });
  } catch (err) {
    console.error("detalleDivergencia error:", err);
    res.status(500).json({ message: "Error armando el detalle" });
  }
}
