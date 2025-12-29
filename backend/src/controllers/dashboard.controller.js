import mongoose from 'mongoose';
import Empleado from '../models/Empleado.model.js';
import Plantilla from '../models/Plantilla.model.js';
import OverrideObjetivo from '../models/OverrideObjetivo.model.js';
import Sector from '../models/Sector.model.js';
import Area from '../models/Area.model.js';
import Evaluacion from "../models/Evaluacion.model.js";
import { generarHitos } from "../utils/generarHitos.js";

const asObjectId = (v) => new mongoose.Types.ObjectId(String(v));
const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

import Feedback from '../models/Feedback.model.js';

export async function computeForEmployees(empleadoIds, anio) {
  if (!Array.isArray(empleadoIds) || empleadoIds.length === 0) return [];
  const ids = empleadoIds.map(asObjectId);

  const empleados = await Empleado.find({ _id: { $in: ids } })
    .populate("area")
    .populate("sector")
    .lean();

  // Fetch ALL templates for the year (Active & Inactive) to support "Sticky" logic
  const plantillas = await Plantilla.find({ year: Number(anio) }).lean();

  // overrides
  const overridesArr = await OverrideObjetivo.find({
    empleado: { $in: ids },
    year: Number(anio),
  }).lean();

  const overridesByEmp = new Map();
  for (const o of overridesArr) {
    const emp = String(o.empleado);
    const tpl = String(o.template);
    if (!overridesByEmp.has(emp)) overridesByEmp.set(emp, new Map());
    overridesByEmp.get(emp).set(tpl, o);
  }

  // evaluaciones
  const evals = await Evaluacion.find({
    empleado: { $in: ids },
    year: Number(anio),
  }).lean();

  // feedbacks
  const feedbacksArr = await Feedback.find({
    empleado: { $in: ids },
    year: Number(anio),
  }).lean();

  return await Promise.all(
    empleados.map(async (e, idx) => {
      const empIdStr = String(e._id);
      const areaIdStr = e.area ? String(e.area._id ?? e.area) : null;
      const sectorIdStr = e.sector ? String(e.sector._id ?? e.sector) : null;

      // Check if Referente
      const isAreaReferent = e.area?.referentes?.some(r => String(r) === empIdStr);
      const isSectorReferent = e.sector?.referentes?.some(r => String(r) === empIdStr);

      const aplicables = plantillas.filter((p) => {
        const tplIdStr = String(p._id);

        // 1. Sticky Logic: If employee has evaluations for this template, KEEP IT (History)
        const hasHistory = evals.some(ev =>
          String(ev.empleado) === empIdStr && String(ev.plantillaId) === tplIdStr
        );
        if (hasHistory) return true;

        // 2. If not sticky, it MUST be Active
        if (!p.activo) return false;

        // 3. Standard Scope Matching
        if (!p.scopeType || !p.scopeId) return false;
        const scopeIdStr = String(p.scopeId);

        // Exclude inheritance if Referente
        if (p.scopeType === "area") {
          if (isAreaReferent) return false; // Don't inherit area goals
          if (areaIdStr && scopeIdStr === areaIdStr) return true;
        }

        if (p.scopeType === "sector") {
          if (isSectorReferent) return false; // Don't inherit sector goals
          if (sectorIdStr && scopeIdStr === sectorIdStr) return true;
        }

        if (p.scopeType === "empleado" && scopeIdStr === empIdStr) return true;
        return false;
      });

      const objetivosArr = [];
      const aptitudesArr = [];
      let sumPesoObj = 0,
        weightedProgressSum = 0;
      let sumPesoApt = 0,
        weightedAptScoreSum = 0;

      const empOverrides = overridesByEmp.get(empIdStr);

      for (const p of aplicables) {
        const tplIdStr = String(p._id);
        const ov = empOverrides ? empOverrides.get(tplIdStr) : null;
        if (ov && ov.excluido) continue;

        const basePeso = Number(p.pesoBase || 0);
        const peso = (ov && typeof ov.peso === "number")
          ? Number(ov.peso)
          : basePeso;

        // 🔹 Generar hitos con resultados ya guardados
        const hitos = await Promise.all(
          generarHitos(p).map(async (h) => {
            const evHito = evals.find(
              (ev) =>
                String(ev.empleado) === empIdStr &&
                String(ev.plantillaId) === tplIdStr &&
                ev.periodo === h.periodo
            );

            const metasCombinadas = (p.metas || []).map((m) => {
              const evaluada = evHito?.metasResultados?.find(
                (em) => String(em._id) === String(m._id) || em.nombre === m.nombre
              );
              return {
                _id: m._id,
                nombre: m.nombre || m.descripcion || "Meta",
                esperado: m.esperado ?? m.target ?? null,
                unidad: m.unidad ?? "",
                reglaCierre: m.reglaCierre || "promedio",
                umbralPeriodos: m.umbralPeriodos || 0,
                permiteOver: m.permiteOver || false,
                modoAcumulacion: m.modoAcumulacion || (m.acumulativa ? "acumulativo" : "periodo"),
                reconoceEsfuerzo: m.reconoceEsfuerzo || false,
                resultado: evaluada?.resultado ?? null,
                cumple: evaluada?.cumple ?? false,
              };
            });

            return {
              ...h,
              actual: evHito?.actual ?? null,
              comentario: evHito?.comentario ?? "",
              estado: evHito?.estado ?? null,
              metas: metasCombinadas,
            };
          })
        );

        if (p.tipo === "objetivo") {
          // progreso promedio de hitos (o max si es acumulativo)
          const isCumulative = p.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
          const progresos = hitos.map((h) => h.actual ?? 0);

          const progreso = isCumulative
            ? Math.max(...progresos, 0)
            : (progresos.length ? Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length) : 0);

          objetivosArr.push({
            _id: p._id,
            nombre: p.nombre,
            descripcion: p.descripcion || "",
            frecuencia: p.frecuencia,
            proceso: p.proceso,
            metodo: p.metodo,
            target: p.target,
            unidad: p.unidad,
            peso,
            progreso,
            comentario: "",
            frecuencia: p.frecuencia,
            fechaLimite: p.fechaLimite,
            metas: p.metas || [],
            hitos,
          });

          sumPesoObj += peso;
          weightedProgressSum += (progreso || 0) * peso;
        } else if (p.tipo === "aptitud") {
          const puntuaciones = hitos.map((h) => h.actual ?? 0);
          const puntuacion = puntuaciones.length
            ? Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length)
            : 0;

          aptitudesArr.push({
            _id: p._id,
            nombre: p.nombre,
            descripcion: p.descripcion || "",
            metodo: p.metodo,
            peso,
            puntuacion,
            comentario: "",
            frecuencia: p.frecuencia,
            fechaLimite: p.fechaLimite,
            metas: p.metas || [],
            hitos,
          });

          sumPesoApt += peso;
          weightedAptScoreSum += puntuacion * peso;
        }
      }

      // --- Filter feedbacks for this employee ---
      const empFeedbacks = feedbacksArr.filter(f => String(f.empleado) === empIdStr);

      const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];

      // Find latest non-DRAFT feedback (The "Effective" one)
      const latestFeedback = empFeedbacks
        .sort((a, b) => periodOrder.indexOf(b.periodo) - periodOrder.indexOf(a.periodo))
        .find(f => f.estado !== "DRAFT");

      // Determine Cutoff Period (Default to FINAL if no feedback, or use latest feedback's period)
      // If no authorized feedback exists, maybe we shouldn't filter? Or assume year-to-date?
      // For legacy matching, if we have a locked Q2, we should only calc up to Q2.
      const cutoffPeriod = latestFeedback ? latestFeedback.periodo : "FINAL";
      const cutoffIndex = periodOrder.indexOf(cutoffPeriod);

      // --- Recalculate based on Cutoff (Live Fallback) ---
      // We re-iterate or just filter the `hitos` we already generated?
      // We already generated `hitos` for all periods. We just need to filter them BEFORE averaging.

      // Re-map objectives to apply cutoff
      objetivosArr.forEach(obj => {
        // Filter hitos up to cutoff
        const validHitos = obj.hitos.filter(h => periodOrder.indexOf(h.periodo) <= cutoffIndex);
        const progresos = validHitos.map(h => h.actual ?? 0);

        const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
        const newProgreso = isCumulative
          ? Math.max(...progresos, 0)
          : (progresos.length ? Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length) : 0);

        // Update the object in place (referenced in array)
        obj.progreso = newProgreso;
        // Note: Weights don't change, but weighted sums need updating?
        // Yes, we need to re-sum below.
      });

      // Re-map aptitudes
      aptitudesArr.forEach(apt => {
        const validHitos = apt.hitos.filter(h => periodOrder.indexOf(h.periodo) <= cutoffIndex);
        const puntuaciones = validHitos
          .map(h => h.actual)
          .filter(val => val !== null && val !== undefined);

        const newPuntuacion = puntuaciones.length
          ? Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length)
          : 0;

        apt.puntuacion = newPuntuacion;
      });

      // --- Re-Calculate Global Scores based on new progressions ---
      weightedProgressSum = objetivosArr.reduce((acc, curr) => acc + (curr.progreso * curr.peso), 0);
      weightedAptScoreSum = aptitudesArr.reduce((acc, curr) => acc + (curr.puntuacion * curr.peso), 0);

      // Default to 0 (Strict Mode: Only Show Result if Feedback Exists)
      let scoreObj = 0;
      let scoreApt = 0;
      let scoreFinal = 0;
      let bono = null;

      /* 
       * LEGACY/PARTIAL CALCULATION (Disabled per user request: "Solo el de resultados de el ultimo feedback evaluado")
       * If we wanted partials, we would uncomment this:
       * 
       * scoreObj = sumPesoObj > 0 ? weightedProgressSum / sumPesoObj : 0;
       * scoreApt = sumPesoApt > 0 ? weightedAptScoreSum / sumPesoApt : 0;
       * scoreFinal = Math.round((0.7 * scoreObj + 0.3 * scoreApt) * 10) / 10;
       * bono = (objetivosArr.length > 0 || aptitudesArr.length > 0) ? `${scoreFinal}%` : null;
       */

      // START OVERRIDE CHECK (If snapshot exists, it wins over our recalc)
      if (latestFeedback && latestFeedback.scores?.global != null) {
        scoreObj = latestFeedback.scores.obj ?? 0;
        scoreApt = latestFeedback.scores.comp ?? 0;
        scoreFinal = latestFeedback.scores.global;
        bono = `${scoreFinal}%`;
      }

      if (process.env.NODE_ENV !== 'production' && Number(anio) === 1989) {
        console.log(`DEBUG 1989: Emp ${empIdStr}`);
        console.log(`- Plantillas Aplicables: ${aplicables.length}`);
        console.log(`- Objetivos: ${objetivosArr.length}`);
        console.log(`- Aptitudes: ${aptitudesArr.length}`);
        if (objetivosArr.length > 0) console.log("Sample Obj:", objetivosArr[0].nombre);
      }

      return {
        empleado: {
          _id: e._id,
          nombre: e.nombre,
          apellido: e.apellido,
          puesto: e.puesto,
          fotoUrl: e.fotoUrl,
          sueldoBase: e.sueldoBase,
          fechaIngreso: e.fechaIngreso,
          area: e.area ? { _id: e.area._id, nombre: e.area.nombre } : null,
          sector: e.sector ? { _id: e.sector._id, nombre: e.sector.nombre } : null,
        },
        objetivos: { count: objetivosArr.length, sumPeso: sumPesoObj, items: objetivosArr },
        aptitudes: { count: aptitudesArr.length, sumPeso: sumPesoApt, items: aptitudesArr },
        // Estricto: Solo mostrar feedback si hay Objetivos. Ignorar Aptitudes (Competencias) según feedback del usuario.
        feedbacks: (objetivosArr.length > 0) ? empFeedbacks : [],
        scoreObj,
        scoreApt,
        scoreFinal,
        bono,
      };
    })
  );
}


export async function dashByArea(req, res) {
  try {
    const { areaId } = req.params;
    const { anio } = req.query;
    const user = req.user;

    // 🔹 Si es director/RRHH y no se pasa areaId → traer todos
    if ((!areaId || areaId === "null") && (user.rol === "directivo" || user.isRRHH)) {
      const empleadosDocs = await Empleado.find({}, { _id: 1 }).lean();
      const ids = empleadosDocs.map((e) => e._id);
      const data = await computeForEmployees(ids, anio || new Date().getFullYear());
      return res.json(data);
    }

    if (!areaId || !isValidObjectId(areaId))
      return res.status(400).json({ message: "areaId inválido" });

    // 🔹 Verificación solo para referentes
    const esReferente = user.referenteAreas?.map(String).includes(String(areaId));
    if (!esReferente) {
      return res.status(403).json({ message: "No autorizado para esta área" });
    }

    // 🔹 Exclude Referentes from the list (Prevent self-evaluation in team view)
    const areaDoc = await Area.findById(areaId, "referentes").lean();
    const referentesIds = areaDoc?.referentes || [];

    const sectores = await Sector.find({ areaId: asObjectId(areaId) }, "_id").lean();
    const sectorIds = sectores.map((s) => s._id);

    const empleadosDocs = await Empleado.find(
      {
        $or: [{ area: asObjectId(areaId) }, { sector: { $in: sectorIds } }],
        _id: { $nin: referentesIds } // Exclude referentes
      },
      { _id: 1 }
    ).lean();

    const ids = empleadosDocs.map((e) => e._id);
    const data = await computeForEmployees(ids, anio || new Date().getFullYear());
    res.json(data);
  } catch (e) {
    console.error("dashByArea error:", e);
    return res.status(500).json({ message: e.message || "Error interno" });
  }
}

export const dashBySector = async (req, res) => {
  try {
    const { sectorId } = req.params;
    const { anio } = req.query;
    const user = req.user;

    if ((!sectorId || sectorId === "null") && (user.rol === "directivo" || user.isRRHH)) {
      const empleadosDocs = await Empleado.find({}, { _id: 1 }).lean();
      const ids = empleadosDocs.map((e) => e._id);
      const data = await computeForEmployees(ids, anio || new Date().getFullYear());
      return res.json(data);
    }

    if (!sectorId || !isValidObjectId(sectorId)) {
      return res.status(400).json({ message: "sectorId inválido" });

    }

    const sectorDoc = await Sector.findById(sectorId, "referentes").lean();
    const referentesIds = sectorDoc?.referentes || [];

    const empleadosDocs = await Empleado.find(
      {
        sector: asObjectId(sectorId),
        _id: { $nin: referentesIds } // Exclude referentes
      },
      { _id: 1 }
    ).lean();

    const ids = empleadosDocs.map((e) => e._id);
    const data = await computeForEmployees(ids, anio || new Date().getFullYear());

    res.json(data);
  } catch (err) {
    console.error("dashBySector error:", err);
    res.status(500).json({ message: err.message || "Error interno en dashBySector" });
  }
};

export const dashByEmpleado = async (req, res, next) => {
  try {
    const { empleadoId } = req.params;
    const year = Number(req.params.year || req.query.anio || req.query.year || new Date().getFullYear());

    const empleado = await Empleado.findById(empleadoId)
      .populate("area")
      .populate("sector")
      .lean();

    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    const areaId = empleado.area ? (empleado.area._id ?? empleado.area) : null;
    const sectorId = empleado.sector ? (empleado.sector._id ?? empleado.sector) : null;

    // 🔹 Traer TODAS las plantillas del año (Active & Inactive) para filtrar en memoria con Sticky Logic
    const plantillas = await Plantilla.find({
      year: year,
      // Removemos filtro estricto de scope/activo aquí, filtramos abajo
    }).lean();

    // 🔹 Overrides del empleado para ese año
    const overridesArr = await OverrideObjetivo.find({
      empleado: empleado._id,
      year: year,
    }).lean();
    const ovByTpl = new Map(overridesArr.map(o => [String(o.template), o]));

    // 🔹 Evaluaciones del empleado para ese año
    const evals = await Evaluacion.find({
      empleado: empleado._id,
      year: year,
    }).lean();

    // 🔹 feedbacks del empleado para ese año (FIX: Needed for bonus calc)
    const feedbacksArr = await Feedback.find({
      empleado: empleado._id,
      year: year,
    }).lean();

    const empIdStr = String(empleado._id);

    // 🔹 Check Referent Status
    const isAreaReferent = empleado.area?.referentes?.some((r) => String(r) === empIdStr);
    const isSectorReferent = empleado.sector?.referentes?.some((r) => String(r) === empIdStr);

    const objetivosArr = [];
    const aptitudesArr = [];
    let sumPesoObj = 0, weightedProgressSum = 0;
    let sumPesoApt = 0, weightedAptScoreSum = 0;

    for (const p of plantillas) {
      const tplIdStr = String(p._id);

      // --- LOGIC: Sticky vs Scope vs Active ---
      // 1. Sticky: Has evaluations?
      const hasHistory = evals.some(ev => String(ev.plantillaId) === tplIdStr);

      // 2. If NOT sticky, apply strict filters
      if (!hasHistory) {
        if (!p.activo) continue; // Must be active

        // Scope Matching
        let matchesScope = false;
        if (p.scopeType === "empleado" && String(p.scopeId) === String(empleado._id)) matchesScope = true;
        else if (p.scopeType === "area" && areaId && String(p.scopeId) === String(areaId)) matchesScope = true;
        else if (p.scopeType === "sector" && sectorId && String(p.scopeId) === String(sectorId)) matchesScope = true;

        if (!matchesScope) continue;

        // Referente Exclusion (only if inheriting via scope)
        if (p.scopeType === "area" && isAreaReferent) continue;
        if (p.scopeType === "sector" && isSectorReferent) continue;
      }
      // If Sticky (hasHistory), we SKIP scope/active checks and INCLUDE it.
      // ----------------------------------------

      const ov = ovByTpl.get(tplIdStr);
      if (ov?.excluido) continue;

      // Peso base (share 100% en empleado directo)
      const basePeso = Number(p.pesoBase || 0);
      const peso = (ov && ov.peso != null && !isNaN(Number(ov.peso))) ? Number(ov.peso) : basePeso;

      // Hitos + metas evaluadas
      const hitos = await Promise.all(
        generarHitos(p).map(async (h) => {
          const evHito = evals.find(
            (ev) =>
              String(ev.plantillaId) === tplIdStr &&
              ev.periodo === h.periodo
          );

          if (p.tipo === "aptitud") {
            console.log("DEBUG DASH APTITUD:", {
              tplId: tplIdStr,
              periodo: h.periodo,
              found: !!evHito,
              actual: evHito?.actual,
              escala: evHito?.escala
            });
          }

          const metasCombinadas = (p.metas || []).map((m) => {
            const evaluada = evHito?.metasResultados?.find(
              (em) => String(em._id) === String(m._id) || em.nombre === m.nombre
            );
            return {
              _id: m._id,
              nombre: m.nombre || m.descripcion || "Meta",
              esperado: m.esperado ?? m.target ?? null,
              unidad: m.unidad ?? "",
              resultado: evaluada?.resultado ?? null,
              cumple: evaluada?.cumple ?? false,
            };
          });

          return {
            ...h,
            actual: evHito?.actual ?? null,
            comentario: evHito?.comentario ?? "",
            estado: evHito?.estado ?? null,
            metas: metasCombinadas,
          };
        })
      );

      if (p.tipo === "objetivo") {
        const isCumulative = p.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
        const progresos = hitos.map((h) => h.actual ?? 0);

        const progreso = isCumulative
          ? Math.max(...progresos, 0)
          : (progresos.length ? Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length) : 0);

        objetivosArr.push({
          _id: p._id,
          tipo: "objetivo",
          nombre: p.nombre,
          descripcion: p.descripcion || "",
          metodo: p.metodo,
          target: p.target,
          unidad: p.unidad,
          peso,
          pesoBase: basePeso,
          progreso,
          comentario: "",
          frecuencia: p.frecuencia,
          fechaLimite: p.fechaLimite,
          metas: p.metas || [],
          hitos,
        });

        sumPesoObj += peso;
        weightedProgressSum += (progreso || 0) * peso;
      } else if (p.tipo === "aptitud") {
        // Filter out nulls to calculate average only on evaluated hitos
        const puntuaciones = hitos
          .map(h => h.actual)
          .filter(val => val !== null && val !== undefined);

        const puntuacion = puntuaciones.length
          ? Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length)
          : 0;

        aptitudesArr.push({
          _id: p._id,
          tipo: "aptitud",
          nombre: p.nombre,
          descripcion: p.descripcion || "",
          metodo: p.metodo,
          peso,
          pesoBase: basePeso,
          puntuacion,
          comentario: "",
          frecuencia: p.frecuencia,
          fechaLimite: p.fechaLimite,
          metas: p.metas || [],
          hitos,
        });

        sumPesoApt += peso;
        weightedAptScoreSum += puntuacion * peso;
      }
    }

    // Calculate sums of base weights
    const sumBasePesoObj = objetivosArr.reduce((acc, curr) => acc + (curr.pesoBase || 0), 0);
    const sumBasePesoApt = aptitudesArr.reduce((acc, curr) => acc + (curr.pesoBase || 0), 0);

    let scoreObj = sumPesoObj > 0 ? weightedProgressSum / sumPesoObj : 0;
    let scoreApt = sumPesoApt > 0 ? weightedAptScoreSum / sumPesoApt : 0;
    let scoreFinal = Math.round((0.7 * scoreObj + 0.3 * scoreApt) * 10) / 10;
    let bono = (objetivosArr.length > 0 || aptitudesArr.length > 0) ? `${scoreFinal}%` : null;

    // Filter feedbacks for this employee
    const empFeedbacks = feedbacksArr.filter(f => String(f.empleado) === empIdStr);

    // --- LOGIC: Use Latest Feedback for Bonus ---
    const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];
    // Find latest non-DRAFT
    const latestFeedback = empFeedbacks
      .sort((a, b) => periodOrder.indexOf(b.periodo) - periodOrder.indexOf(a.periodo))
      .find(f => f.estado !== "DRAFT");

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[BONUS DEBUG] Emp: ${empIdStr}`);
      console.log(`- Latest Non-Draft: ${latestFeedback?.periodo || 'None'}`);
      console.log(`- Scores:`, latestFeedback?.scores);
    }

    // OVERRIDE if Latest Feedback exists and has valid scores
    if (latestFeedback && latestFeedback.scores?.global != null) {
      scoreObj = latestFeedback.scores.obj ?? scoreObj;
      scoreApt = latestFeedback.scores.comp ?? scoreApt;
      scoreFinal = latestFeedback.scores.global;
      bono = `${scoreFinal}%`;
    }

    return res.json({
      empleado: {
        _id: empleado._id,
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        puesto: empleado.puesto,
        area: empleado.area ? { _id: empleado.area._id, nombre: empleado.area.nombre } : null,
        sector: empleado.sector ? { _id: empleado.sector._id, nombre: empleado.sector.nombre } : null,
      },
      objetivos: { count: objetivosArr.length, sumPeso: sumPesoObj, items: objetivosArr },
      aptitudes: { count: aptitudesArr.length, sumPeso: sumPesoApt, items: aptitudesArr },
      // Mostrar feedback siempre, sin depender de objetivos
      feedbacks: empFeedbacks,
      scoreObj, scoreApt, scoreFinal, bono,
    });
  } catch (err) {
    console.error("dashByEmpleado error:", err);
    next(err);
  }
};

export const getExecutiveData = async (req, res, next) => {
  try {
    const { anio } = req.query;
    const year = Number(anio || new Date().getFullYear());

    // 1. Fetch ALL Areas with Referentes (populated)
    const areasDocs = await Area.find({}, { nombre: 1, referentes: 1 })
      .populate("referentes", "nombre apellido fotoUrl")
      .lean();

    const areaMap = new Map(); // AreaId -> { doc, employees: [], totalBudget: 0, ... }

    // Initialize map
    for (const a of areasDocs) {
      areaMap.set(String(a._id), {
        id: a._id,
        nombre: a.nombre,
        referentes: a.referentes || [],
        // Create a Set of Referente IDs for easy lookup (filtering them out from metrics)
        referentesSet: new Set((a.referentes || []).map(r => String(r._id || r))),
        employees: [],
        totalBudget: 0,
        totalScoreSum: 0,
        countEvaluated: 0,
        countApproved: 0,
        countDisagreement: 0,
        countAgreement: 0
      });
    }

    // 2. Fetch Employees & Compute
    const allEmployees = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } }, { _id: 1, sueldoBase: 1, area: 1, sector: 1 })
      .populate("area", "nombre")
      .populate("sector", "nombre")
      .lean();

    const ids = allEmployees.map(e => e._id);
    const computedData = await computeForEmployees(ids, year);

    // 3. Bucket & Aggregate
    let globalHeadcount = allEmployees.length;
    let globalEvaluated = 0;
    let globalApproved = 0;
    let globalBudget = 0;
    let globalAgreement = 0;
    let globalDisagreement = 0;
    const globalPerformers = [];

    // Temporary budget by sector tracker
    const budgetBySector = {};

    for (const item of computedData) {
      if (!item) continue;
      const { scoreFinal, empleado, feedbacks } = item;
      const sueldo = empleado.sueldoBase?.monto || 0;
      const estimatedBonus = (sueldo * (scoreFinal || 0)) / 100;

      // Identify Feedbacks
      const closingF = feedbacks.find(f => f.periodo === 'FINAL' && f.estado !== 'DRAFT');
      const prelimF = feedbacks
        .filter(f => f.periodo !== 'FINAL' && f.estado !== 'DRAFT')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]; // Latest prelim

      const scoreClosing = closingF?.scores?.global ?? null;
      const scorePrelim = prelimF?.scores?.global ?? null;

      // Flags
      const hasDisagreement = closingF?.empleadoAck?.estado === "CONTEST" || prelimF?.empleadoAck?.estado === "CONTEST";
      const hasAgreement = [closingF, prelimF].some(f => ["ACK", "CONFIRMADO", "SIGNED"].includes(f?.empleadoAck?.estado));

      // Global Stats
      globalBudget += estimatedBonus;
      if (scoreFinal > 0) globalEvaluated++;
      if (scoreFinal >= 70) globalApproved++;
      if (hasDisagreement) globalDisagreement++;
      if (hasAgreement) globalAgreement++;

      // Sector Budget
      const sectName = empleado.sector?.nombre || "Sin Sector";
      if (!budgetBySector[sectName]) budgetBySector[sectName] = 0;
      budgetBySector[sectName] += estimatedBonus;

      // Performer Obj
      const pObj = {
        id: empleado._id,
        nombre: `${empleado.nombre} ${empleado.apellido}`,
        foto: empleado.fotoUrl,
        puesto: empleado.puesto, // Added
        area: empleado.area?.nombre,
        sector: empleado.sector?.nombre,
        score: scoreFinal || 0,
        scoreClosing,
        scorePrelim,
        disagreement: hasDisagreement,
        feedbackStatus: (closingF || prelimF)?.estado || "PENDING"
      };
      globalPerformers.push(pObj);

      // Add to Area Group
      if (empleado.area && empleado.area._id) {
        const aId = String(empleado.area._id);
        if (areaMap.has(aId)) {
          const group = areaMap.get(aId);

          // 🔹 EXCLUDE SCOPE REFERENTS from the aggregated list
          // Bosses shouldn't dilute the team's average or appear as "Critical Cases" within their own team view
          if (group.referentesSet.has(String(empleado._id))) {
            continue;
          }

          group.employees.push(pObj);
          group.totalBudget += estimatedBonus;
          if (scoreFinal > 0) {
            group.totalScoreSum += scoreFinal;
            group.countEvaluated++;
          }
          if (scoreFinal >= 70) group.countApproved++;

          if (hasDisagreement) group.countDisagreement++;
          if (hasAgreement) group.countAgreement++;
        }
      }
    }

    // 4. Finalize Area Data
    const areasResult = [];
    for (const group of areaMap.values()) {
      const headcount = group.employees.length;
      if (headcount === 0) continue;

      const avgScore = group.countEvaluated > 0
        ? Math.round(group.totalScoreSum / group.countEvaluated)
        : 0;

      const countPending = Math.max(0, headcount - group.countEvaluated);
      const pendingPct = Math.round((countPending / headcount) * 100);

      // Full list sorted by name for "View All"
      const allEmps = [...group.employees].sort((a, b) => a.nombre.localeCompare(b.nombre));

      // Top 5 Area
      const top5 = [...group.employees].sort((a, b) => b.score - a.score).slice(0, 5);

      // Critical Area
      const critical = [...group.employees]
        .filter(p => p.disagreement || p.score < 50)
        .sort((a, b) => (b.disagreement === a.disagreement) ? (a.score - b.score) : (b.disagreement ? 1 : -1))
        .slice(0, 5);

      areasResult.push({
        id: group.id,
        nombre: group.nombre,
        referentes: group.referentes,
        headcount,
        avgScore,
        countEvaluated: group.countEvaluated,
        countPending,
        pendingPct,
        countApproved: group.countApproved,
        countDisagreement: group.countDisagreement,
        countAgreement: group.countAgreement,
        totalBudget: Math.round(group.totalBudget),
        employees: allEmps, // Full list included
        topPerformers: top5,
        criticalCases: critical
      });
    }

    // Sort Areas (e.g. by Name)
    areasResult.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Global Top Lists
    const globalTop = [...globalPerformers].sort((a, b) => b.score - a.score).slice(0, 5);
    const globalCritical = [...globalPerformers]
      .filter(p => p.disagreement || p.score < 50)
      .sort((a, b) => (b.disagreement === a.disagreement) ? (a.score - b.score) : (b.disagreement ? 1 : -1))
      .slice(0, 5);

    // Global Charts
    const topSectorsBudget = Object.entries(budgetBySector)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    res.json({
      metrics: {
        headcount: globalHeadcount,
        departments: areasResult.length,
        evaluatedPct: globalHeadcount ? Math.round((globalEvaluated / globalHeadcount) * 100) : 0,
        averageScore: globalEvaluated ? Math.round(globalPerformers.reduce((a, b) => a + b.score, 0) / globalEvaluated) : 0,
        totalBudgetEstimated: Math.round(globalBudget),
        approvedPct: globalEvaluated ? Math.round((globalApproved / globalEvaluated) * 100) : 0,
        // Added metrics
        agreementCount: globalAgreement,
        disagreementCount: globalDisagreement
      },
      charts: {
        budgetBySector: topSectorsBudget,
      },
      areas: areasResult, // New field
      globalTop,
      globalCritical
    });

  } catch (e) {
    console.error(e);
    next(e);
  }
};