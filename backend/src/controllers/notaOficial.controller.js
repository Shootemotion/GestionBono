// backend/src/controllers/notaOficial.controller.js
//
// Normalización de notas: fijar, persona por persona, cuál es LA nota del año.
//
// Acordado con RRHH: la que el jefe evaluó, vio en su pantalla y le comunicó
// a la persona. Esta pantalla la muestra junto a lo que hoy devuelve el
// recálculo, y deja confirmarla una por una.
//
// Va de a una y no en lote a propósito. Es el número que define un bono: que
// alguien lo mire y lo confirme deja un responsable y una fecha por cada
// persona, que es lo que faltó en todo lo demás que revisamos este año. El
// botón de "confirmar todas" existe igual para las que no tienen ninguna
// observación, porque obligar a 68 clics idénticos no agrega control, cansa.

import mongoose from "mongoose";
import Feedback from "../models/Feedback.model.js";
import Empleado from "../models/Empleado.model.js";
import Auditoria from "../models/Auditoria.model.js";
import { computeForEmployees } from "./dashboard.controller.js";
import { calcularScoresPeriodo, calcularScoresEnBackend } from "../lib/feedbackScores.js";
import { resolverNotaOficial, etiquetaEstado, ESTADO } from "../lib/notaOficial.js";
import { anioFiscalActual } from "../lib/fiscalYear.js";

/**
 * GET /api/notas-oficiales?year=2025
 *
 * Estado de cada persona: cuál es su nota, de qué feedback sale, si está
 * confirmada, y qué devuelve el recálculo de hoy para la misma persona.
 */
export async function estadoNotasOficiales(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    const incluirDesvinculados = req.query.incluirDesvinculados === "true";

    const filtro = incluirDesvinculados ? {} : { estadoLaboral: { $ne: "DESVINCULADO" } };
    const empleados = await Empleado.find(filtro)
      .select("nombre apellido puesto estadoLaboral")
      .lean();

    const ids = empleados.map((e) => e._id);
    const [feedbacks, dashes] = await Promise.all([
      Feedback.find({ year, empleado: { $in: ids } }).lean(),
      computeForEmployees(ids, year),
    ]);

    const fbPorEmpleado = new Map();
    for (const f of feedbacks) {
      const k = String(f.empleado);
      if (!fbPorEmpleado.has(k)) fbPorEmpleado.set(k, []);
      fbPorEmpleado.get(k).push(f);
    }
    const dashPorEmpleado = new Map(dashes.map((d) => [String(d.empleado._id), d]));

    const items = empleados.map((e) => {
      const empId = String(e._id);
      const propios = fbPorEmpleado.get(empId) || [];
      const r = resolverNotaOficial(propios);

      // El recálculo de hoy, para poder mostrar los dos lado a lado. No se usa
      // para nada más: la nota es la del feedback, no esta.
      let recalculo = null;
      const dash = dashPorEmpleado.get(empId);
      if (dash && r.periodo) {
        const s = calcularScoresPeriodo(dash, r.periodo);
        recalculo = s ? { obj: s.obj, comp: s.comp, global: s.global } : null;
      }

      const diferencia =
        r.nota && recalculo ? +(Number(recalculo.global) - Number(r.nota.global)).toFixed(1) : null;

      return {
        empleadoId: empId,
        empleado: `${e.apellido ?? ""}, ${e.nombre ?? ""}`.trim(),
        puesto: e.puesto || null,
        estado: r.estado,
        estadoEtiqueta: etiquetaEstado(r.estado),
        nota: r.nota,
        periodo: r.periodo,
        feedbackId: r.feedbackId,
        motivo: r.motivo,
        confirmable: r.confirmable,
        confirmadaEl: r.feedback?.oficial?.confirmadaEl ?? null,
        cerradoEl: r.feedback?.closedAt ?? null,
        recalculo,
        diferencia,
      };
    });

    // Primero lo que necesita atención, después lo pendiente, al final lo hecho.
    const prioridad = {
      [ESTADO.NOTA_INVALIDA]: 0,
      [ESTADO.SIN_CIERRE_ANUAL]: 1,
      [ESTADO.PENDIENTE]: 2,
      [ESTADO.SIN_EVALUAR]: 3,
      [ESTADO.CONFIRMADA]: 4,
    };
    items.sort(
      (a, b) =>
        prioridad[a.estado] - prioridad[b.estado] ||
        Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0) ||
        a.empleado.localeCompare(b.empleado)
    );

    const resumen = items.reduce((acc, i) => {
      acc[i.estado] = (acc[i.estado] || 0) + 1;
      return acc;
    }, {});

    res.json({
      year,
      total: items.length,
      resumen,
      confirmables: items.filter((i) => i.confirmable).length,
      conDiferencia: items.filter((i) => Math.abs(i.diferencia ?? 0) > 1).length,
      items,
    });
  } catch (err) {
    console.error("estadoNotasOficiales error:", err);
    res.status(500).json({ message: "Error leyendo el estado de las notas" });
  }
}

/**
 * POST /api/notas-oficiales/:feedbackId/confirmar
 *
 * Fija la nota de ese feedback como la oficial del año.
 */
export async function confirmarNotaOficial(req, res) {
  try {
    const { feedbackId } = req.params;
    if (!mongoose.isValidObjectId(feedbackId)) {
      return res.status(400).json({ message: "feedbackId inválido" });
    }

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) return res.status(404).json({ message: "Feedback no encontrado" });

    // Se vuelve a resolver sobre todos los del empleado y año: confirmar un
    // feedback que el resolvedor no considera confirmable —uno de un trimestre
    // cuando falta el cierre anual, o uno con la nota fuera de escala— es
    // justamente lo que esta pantalla tiene que impedir.
    const propios = await Feedback.find({ empleado: feedback.empleado, year: feedback.year }).lean();
    const r = resolverNotaOficial(propios);

    if (r.estado === ESTADO.CONFIRMADA) {
      return res.status(409).json({
        message: "Esta persona ya tiene su nota confirmada.",
        motivo: "ya_confirmada",
        nota: r.nota,
      });
    }
    if (String(r.feedbackId) !== String(feedbackId) || !r.confirmable) {
      return res.status(409).json({
        message: r.motivo || "Este feedback no es el que define la nota del año.",
        motivo: r.estado,
      });
    }

    // Cuál de las dos queda. El default es la comunicada, que es el acuerdo
    // con RRHH; `usar: "recalculo"` existe para los casos en que la foto se
    // sacó mal y RRHH decide que el número correcto es el otro. Es una
    // decisión que se toma de a una y queda registrada como tal.
    const usarRecalculo = req.body?.usar === "recalculo";
    let nota = {
      obj: feedback.scores.obj,
      comp: feedback.scores.comp,
      global: feedback.scores.global,
    };

    if (usarRecalculo) {
      const calculado = await calcularScoresEnBackend(feedback.empleado, feedback.year, feedback.periodo);
      if (!calculado) {
        return res.status(409).json({ message: "No se pudo recalcular la nota de esta persona." });
      }
      nota = { obj: calculado.obj, comp: calculado.comp, global: calculado.global };
    }

    feedback.oficial = {
      confirmada: true,
      confirmadaPor: req.user?._id ?? null,
      confirmadaEl: new Date(),
      origen: usarRecalculo ? "recalculo" : "comunicada",
      // Se congela el valor: si alguien tocara `scores` después, la nota que
      // se pagó no se mueve.
      nota,
    };
    await feedback.save();

    // La auditoría genérica no alcanza acá: la ruta lleva el id del feedback,
    // no el del empleado, y lo que importa registrar es qué número quedó.
    await Auditoria.create({
      usuarioId: req.user?._id ?? null,
      email: req.user?.email ?? null,
      rol: req.user?.rol ?? null,
      accion: "APROBAR",
      entidad: "nota_oficial",
      documentoId: feedback._id,
      resumen:
        `Nota oficial ${feedback.year} confirmada en ${nota.global} ` +
        `(feedback ${feedback.periodo}, origen: ${feedback.oficial.origen})`,
      antes: null,
      cambios: { nota: feedback.oficial.nota, periodo: feedback.periodo, origen: feedback.oficial.origen },
      metodo: "POST",
      ruta: req.originalUrl,
      statusCode: 200,
    });

    res.json({
      ok: true,
      feedbackId: String(feedback._id),
      nota: feedback.oficial.nota,
      confirmadaEl: feedback.oficial.confirmadaEl,
    });
  } catch (err) {
    console.error("confirmarNotaOficial error:", err);
    res.status(500).json({ message: "Error confirmando la nota" });
  }
}

/**
 * DELETE /api/notas-oficiales/:feedbackId/confirmar
 *
 * Deshace una confirmación. Existe porque confirmar de a una, 68 veces, sin
 * poder corregir un clic equivocado sería peor que no tener la pantalla.
 */
export async function desconfirmarNotaOficial(req, res) {
  try {
    const { feedbackId } = req.params;
    if (!mongoose.isValidObjectId(feedbackId)) {
      return res.status(400).json({ message: "feedbackId inválido" });
    }

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) return res.status(404).json({ message: "Feedback no encontrado" });
    if (!feedback.oficial?.confirmada) {
      return res.status(409).json({ message: "Esta nota no estaba confirmada." });
    }

    const antes = { ...feedback.oficial };
    feedback.oficial = { confirmada: false };
    await feedback.save();

    await Auditoria.create({
      usuarioId: req.user?._id ?? null,
      email: req.user?.email ?? null,
      rol: req.user?.rol ?? null,
      accion: "EDITAR",
      entidad: "nota_oficial",
      documentoId: feedback._id,
      resumen: `Se deshizo la confirmación de la nota oficial ${feedback.year}`,
      antes,
      metodo: "DELETE",
      ruta: req.originalUrl,
      statusCode: 200,
    });

    res.json({ ok: true, feedbackId: String(feedback._id) });
  } catch (err) {
    console.error("desconfirmarNotaOficial error:", err);
    res.status(500).json({ message: "Error deshaciendo la confirmación" });
  }
}

/**
 * POST /api/notas-oficiales/confirmar-sin-observaciones?year=2025
 *
 * Confirma de una sola vez las que no tienen nada que mirar: cierre anual
 * cerrado, nota en escala y sin diferencia contra el recálculo. Las que tienen
 * cualquier observación quedan afuera y hay que verlas de a una.
 */
export async function confirmarSinObservaciones(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    const TOLERANCIA = 1;

    const empleados = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } })
      .select("_id")
      .lean();
    const ids = empleados.map((e) => e._id);

    const [feedbacks, dashes] = await Promise.all([
      Feedback.find({ year, empleado: { $in: ids } }).lean(),
      computeForEmployees(ids, year),
    ]);

    const fbPorEmpleado = new Map();
    for (const f of feedbacks) {
      const k = String(f.empleado);
      if (!fbPorEmpleado.has(k)) fbPorEmpleado.set(k, []);
      fbPorEmpleado.get(k).push(f);
    }
    const dashPorEmpleado = new Map(dashes.map((d) => [String(d.empleado._id), d]));

    const aConfirmar = [];
    for (const [empId, propios] of fbPorEmpleado) {
      const r = resolverNotaOficial(propios);
      if (!r.confirmable) continue;

      const dash = dashPorEmpleado.get(empId);
      const s = dash ? calcularScoresPeriodo(dash, r.periodo) : null;
      const diferencia = s ? Math.abs(Number(s.global) - Number(r.nota.global)) : 0;
      if (diferencia > TOLERANCIA) continue; // tiene algo que mirar: va de a una

      aConfirmar.push({ id: r.feedbackId, nota: r.nota });
    }

    const ahora = new Date();
    for (const { id, nota } of aConfirmar) {
      await Feedback.findByIdAndUpdate(id, {
        oficial: {
          confirmada: true,
          confirmadaPor: req.user?._id ?? null,
          confirmadaEl: ahora,
          nota,
        },
      });
    }

    if (aConfirmar.length) {
      await Auditoria.create({
        usuarioId: req.user?._id ?? null,
        email: req.user?.email ?? null,
        rol: req.user?.rol ?? null,
        accion: "APROBAR",
        entidad: "nota_oficial",
        resumen: `Confirmadas ${aConfirmar.length} notas oficiales del ${year} sin observaciones`,
        cambios: { cantidad: aConfirmar.length, feedbackIds: aConfirmar.map((x) => x.id) },
        metodo: "POST",
        ruta: req.originalUrl,
        statusCode: 200,
      });
    }

    res.json({ ok: true, confirmadas: aConfirmar.length });
  } catch (err) {
    console.error("confirmarSinObservaciones error:", err);
    res.status(500).json({ message: "Error confirmando las notas" });
  }
}
