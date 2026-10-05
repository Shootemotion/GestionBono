import mongoose from 'mongoose';
import Empleado from '../models/Empleado.model.js';
import Plantilla from '../models/Plantilla.model.js';
import OverrideObjetivo from '../models/OverrideObjetivo.model.js';
import Sector from '../models/Sector.model.js';
import Area from '../models/Area.model.js';
import Evaluacion from "../models/Evaluacion.model.js";
import { generarHitos } from "../utils/generarHitos.js";
import { calculateAnnualObjectiveProgress, calculateGlobalPerformance } from "../lib/scoringEngine.js";
import { redactSueldoDashboard } from "../utils/salaryVisibility.js";
import { puedeVerEmpleado, filtroAlcanceEmpleados } from "../utils/alcanceEmpleados.js";

const asObjectId = (v) => new mongoose.Types.ObjectId(String(v));
const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

import Feedback from '../models/Feedback.model.js';
import Incidencia from '../models/Incidencia.model.js';
import { tiempoEfectivo, prorratearMeta, aplicaProrrateo, esPeriodoAnteriorAlIngreso } from '../lib/tiempoEfectivo.js';

// --- In-Memory Cache for Heavy Dashboard Queries ---
const dashboardCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCache(key) {
  const cached = dashboardCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  dashboardCache.set(key, { data, timestamp: Date.now() });
}
// ---------------------------------------------------

/**
 * Determines if a template is applicable to an employee based on:
 * 1. Sticky Logic (History): If employee has evaluations for this template, it remains applicable even if inactive/scope changes.
 * 2. Status: Must be active (unless sticky).
 * 3. Scope: Must match employee's Area/Sector or be assigned directly.
 */
/**
 * Índice de "qué plantillas ya tienen evaluaciones cargadas", para la regla
 * sticky. Antes cada consulta recorría el array completo de evaluaciones por
 * cada par empleado×plantilla: con 79 empleados, 170 plantillas y 4300
 * evaluaciones eso daba ~58 millones de comparaciones y el dashboard tardaba
 * 19 segundos bloqueando el event loop. Indexar una vez lo deja en O(1).
 */
/**
 * Cuenta los hitos CON DATO que caen en períodos anteriores al ingreso.
 *
 * Un hito vacío en un período previo es solo calendario: lo genera la plantilla
 * y no molesta a nadie. Lo que hay que ver es el que tiene un resultado cargado,
 * porque significa que alguien evaluó un tiempo en el que la persona no estaba.
 */
function contarPreviasAlIngreso(objetivos = [], mesesPorIngreso) {
  if (!Number.isFinite(mesesPorIngreso) || mesesPorIngreso >= 12) return 0;
  let n = 0;
  for (const o of objetivos) {
    for (const h of o.hitos || []) {
      if (!esPeriodoAnteriorAlIngreso(h.periodo, mesesPorIngreso)) continue;
      const conDato = (h.metas || []).some(
        (m) => m.resultado !== null && m.resultado !== undefined && m.resultado !== ""
      ) || (h.actual !== null && h.actual !== undefined);
      if (conDato) n++;
    }
  }
  return n;
}

export function indexarHistorial(evals = []) {
  const set = new Set();
  for (const ev of evals) {
    const emp = String(ev.empleado?._id ?? ev.empleado);
    set.add(`${emp}_${String(ev.plantillaId)}`);
  }
  return set;
}

function isTemplateApplicable(p, empIdStr, areaIdStr, sectorIdStr, isAreaReferent, isSectorReferent, historial) {
  const tplIdStr = String(p._id);

  // 1. Sticky Logic: If employee has evaluations for this template, KEEP IT (History)
  // Acepta el Set indexado o, por compatibilidad, el array crudo de evaluaciones.
  const hasHistory = historial instanceof Set
    ? historial.has(`${empIdStr}_${tplIdStr}`)
    : (historial || []).some(ev =>
      (String(ev.empleado) === empIdStr || String(ev.empleado?._id) === empIdStr) &&
      String(ev.plantillaId) === tplIdStr
    );

  if (hasHistory) return true;

  // 2. If not sticky, it MUST be Active
  if (!p.activo) return false;

  // 3. Standard Scope Matching
  if (!p.scopeType || !p.scopeId) return false;
  const scopeIdStr = String(p.scopeId);

  // Exclude inheritance if Referente (Bosses don't inherit team goals automatically)
  if (p.scopeType === "area") {
    // Sync with GestionPlantillas: Bosses SHOULD inherit area goals by default unless manually excluded
    // if (isAreaReferent) return false; 
    if (areaIdStr && scopeIdStr === areaIdStr) return true;
  }

  if (p.scopeType === "sector") {
    // if (isSectorReferent) return false;
    if (sectorIdStr && scopeIdStr === sectorIdStr) return true;
  }

  // El schema admite "empleado" y "employee": aceptamos las dos para que una
  // plantilla personal no quede fuera por la variante del enum.
  if ((p.scopeType === "empleado" || p.scopeType === "employee") && scopeIdStr === empIdStr) return true;

  return false;
}


export async function computeForEmployees(empleadoIds, anio, auditLog = null) {
  if (!Array.isArray(empleadoIds) || empleadoIds.length === 0) return [];
  const ids = empleadoIds.map(asObjectId);

  // Las cinco consultas salen JUNTAS: ninguna necesita el resultado de otra.
  //
  // Estaban escritas en fila, una esperando a la anterior, y sumaban sus
  // tiempos: 1403 ms para el Área Técnica. Lanzadas a la vez tardan lo que la
  // más lenta —las evaluaciones— y bajan a 599 ms. Mismo resultado, misma
  // cantidad de consultas: solo dejan de hacer cola.
  const [empleados, plantillas, overridesArr, evals, feedbacksArr, incidencias] = await Promise.all([
    Empleado.find({ _id: { $in: ids } })
      .populate("area")
      .populate("sector")
      .lean(),

    // Trae TODAS las plantillas del año: esta query no filtra por scope, así que
    // ya incluye las de área, sector Y empleado. Antes se hacía además una
    // segunda consulta por las de scope "empleado" y se concatenaban ambas, con
    // lo cual cada plantilla personal entraba DOS veces. Como el score es un
    // promedio ponderado, esa duplicación parcial inflaba el peso relativo de
    // las plantillas personales frente a las heredadas y torcía el resultado.
    Plantilla.find({ year: Number(anio) }).lean(),

    OverrideObjetivo.find({
      empleado: { $in: ids },
      year: Number(anio),
    }).lean(),

    Evaluacion.find({
      empleado: { $in: ids }
      // year: Number(anio) <-- Removed to support fiscal years where evaluations and templates have different years
    }).lean(),

    Feedback.find({
      empleado: { $in: ids },
      year: Number(anio),
    }).lean(),

    // Licencias del ciclo: descuentan tiempo efectivo igual que en el bono.
    // Solo se consultan cuando el prorrateo aplica, para no cargar una
    // colección entera en los años que no lo usan.
    aplicaProrrateo(anio)
      ? Incidencia.find({ empleado: { $in: ids }, tipo: "LICENCIA" }).lean()
      : Promise.resolve([]),
  ]);

  const overridesByEmp = new Map();
  for (const o of overridesArr) {
    const emp = String(o.empleado);
    const tpl = String(o.template);
    if (!overridesByEmp.has(emp)) overridesByEmp.set(emp, new Map());
    overridesByEmp.get(emp).set(tpl, o);
  }

  const incidenciasPorEmpleado = new Map();
  for (const i of incidencias) {
    const k = String(i.empleado);
    if (!incidenciasPorEmpleado.has(k)) incidenciasPorEmpleado.set(k, []);
    incidenciasPorEmpleado.get(k).push(i);
  }

  // ⚡ OPTIMIZATION: Index evaluations by Key (Emp + Tpl + Per) to avoid O(N) search in loop
  const evalsMap = new Map();
  for (const ev of evals) {
    const key = `${String(ev.empleado)}_${String(ev.plantillaId)}_${ev.periodo}`;
    evalsMap.set(key, ev);
  }
  const historial = indexarHistorial(evals);

  return await Promise.all(
    empleados.map(async (e, idx) => {
      const empIdStr = String(e._id);
      const areaIdStr = e.area ? String(e.area._id ?? e.area) : null;
      const sectorIdStr = e.sector ? String(e.sector._id ?? e.sector) : null;

      // Check if Referente
      const isAreaReferent = e.area?.referentes?.some(r => String(r) === empIdStr);
      const isSectorReferent = e.sector?.referentes?.some(r => String(r) === empIdStr);

      const empOverrides = overridesByEmp.get(empIdStr);

      const aplicables = plantillas.filter((p) => {
        // 0. Check Manual Override Inclusion first
        // If there's an override that is NOT excluded, we force inclusion (Classic "Asignación Manual")
        const ov = empOverrides ? empOverrides.get(String(p._id)) : null;
        if (ov && !ov.excluido) return true;

        return isTemplateApplicable(p, empIdStr, areaIdStr, sectorIdStr, isAreaReferent, isSectorReferent, historial);
      });

      const objetivosArr = [];
      const aptitudesArr = [];
      let sumPesoObj = 0,
        weightedProgressSum = 0;
      let sumPesoApt = 0,
        weightedAptScoreSum = 0;

      // Cuánto del ciclo estuvo realmente esta persona.
      //
      // Quien entra a mitad de año no puede cumplir una meta que pide 12
      // períodos ni un total anual: no es bajo desempeño, es imposible por
      // definición. Olguin Oriana ingresó en mayo, tiene 2 de 16 períodos
      // cargados y el sistema le calculó 37,8.
      //
      // Los cortes son los de la política de bonos —6 meses de mínimo,
      // licencias de más de 60 días descuentan— para que la empresa tenga una
      // sola regla. Rige desde el AF2026: el AF2025 ya se comunicó.
      // Se calcula SIEMPRE, en todos los años: saber que Dikun estuvo 6 de 12
      // meses es un hecho, y mostrarlo no le cambia ningún número.
      const tiempo = tiempoEfectivo({
        fechaIngreso: e.fechaIngreso,
        incidencias: incidenciasPorEmpleado.get(empIdStr) || [],
        anioFiscal: Number(anio),
      });

      // AJUSTAR LAS METAS sí cambia números, y por eso rige desde el AF2026:
      // en el AF2025 las notas ya se comunicaron.
      const ajustaMetas = aplicaProrrateo(anio) && tiempo.prorratea;

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
            // [DEBUG REMOVED FOR PERFORMANCE]

            // ⚡ OPTIMIZATION: Use Map lookup instead of .find()
            const evHito = evalsMap.get(`${empIdStr}_${tplIdStr}_${h.periodo}`);

            /*
            // OLD SLOW LOGIC
            const evHito = evals.find(
              (ev) =>
                String(ev.empleado) === empIdStr &&
                String(ev.plantillaId) === tplIdStr &&
                ev.periodo === h.periodo
            );
            */

            const metasCombinadas = (p.metas || []).map((m) => {
              // Se busca por metaId y, como red, por nombre. Antes comparaba
              // em._id (el id del subdocumento del resultado) contra m._id (el
              // id de la meta): nunca coincidían, así que TODO se sostenía en el
              // nombre y renombrar una meta huerfanaba su historial.
              const evaluada = evHito?.metasResultados?.find(
                (em) => String(em.metaId) === String(m._id) || em.nombre === m.nombre
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

          // Metas ajustadas al tiempo que estuvo. Con el ciclo completo esto
          // devuelve las mismas metas y no cambia nada.
          const metasAjustadas = ajustaMetas
            ? (p.metas || []).map((m) => prorratearMeta(m, tiempo.meses))
            : (p.metas || []);
          const huboAjuste = metasAjustadas.some((m, i) => m !== (p.metas || [])[i]);

          // 🔹 Score Calculation Refactor: Annual Closure Rules (Regla de Cierre)
          const { progreso, metasAnuales } = calculateAnnualObjectiveProgress(metasAjustadas, hitos);

          objetivosArr.push({
            _id: p._id,
            nombre: p.nombre,
            year: p.year,
            descripcion: p.descripcion || "",
            frecuencia: p.frecuencia,
            proceso: p.proceso,
            metodo: p.metodo,
            target: p.target,
            unidad: p.unidad,
            peso,
            progreso,
            comentario: "",
            fechaLimite: p.fechaLimite,
            reglaCierre: p.reglaCierre,
            umbralPeriodos: p.umbralPeriodos,
            metas: metasAjustadas,
            hitos,
            // Bandera para la pantalla: por qué esta meta pide 7 y no 12.
            ajustadoAutomaticamente: huboAjuste || false,
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
            year: p.year,
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
        .find(f => f.estado === "CLOSED");

      // --- Re-Calculate Global Scores based on new progressions ---
      const { scoreObj, scoreApt, scoreFinal, bono } = calculateGlobalPerformance(
        objetivosArr,
        aptitudesArr,
        latestFeedback
      );


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
        // Cuánto del ciclo estuvo, y si eso ajustó sus metas. `parcial` marca
        // que estuvo menos del mínimo (6 meses): se lo evalúa igual, pero su
        // nota no es comparable con la de quien hizo el año entero.
        ciclo: {
          meses: tiempo.meses,
          mesesPorIngreso: tiempo.mesesPorIngreso,
          // El hecho: no estuvo el año entero. Se informa en todos los años.
          incompleto: tiempo.incompleto,
          // El juicio: menos del mínimo, su nota no se compara.
          parcial: tiempo.parcial,
          // La acción: se le ajustaron las metas. Solo desde el AF2026.
          prorrateado: ajustaMetas,
          motivo: tiempo.motivo,
          diasLicencia: tiempo.diasLicencia,
          periodosAplicables: tiempo.periodosAplicables,
          metasAjustadas: objetivosArr.filter((o) => o.ajustadoAutomaticamente).length,
          // Resultados cargados en períodos en los que la persona no estaba.
          // No es un error de criterio, es un imposible, y hay que verlo.
          evaluacionesPreviasIngreso: contarPreviasAlIngreso(objetivosArr, tiempo.mesesPorIngreso),
        },
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
    const selfEmpId = req.user?.empleadoId;

    // 🔹 Si es director/RRHH/Super y no se pasa areaId → traer todos
    if ((!areaId || areaId === "null") && (user.rol === "directivo" || user.isRRHH || user.rol === "superadmin" || user.isSuper)) {
      const cacheKey = `dashArea_ALL_${anio || new Date().getFullYear()}`;
      const cached = getCache(cacheKey);
      if (cached) return res.json(redactSueldoDashboard(cached, req.user));

      const empleadosDocs = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } }, { _id: 1 }).lean();
      const ids = empleadosDocs.map((e) => e._id);
      const data = await computeForEmployees(ids, anio || new Date().getFullYear());

      setCache(cacheKey, data);
      return res.json(redactSueldoDashboard(data, req.user));
    }

    if (!areaId || !isValidObjectId(areaId))
      return res.status(400).json({ message: "areaId inválido" });

    // 🔹 Verificación solo para referentes
    // Si es SuperAdmin, RRHH o Directivo, Bypass check
    if (user.rol === "superadmin" || user.isSuper || user.isRRHH || user.rol === "directivo" || user.isDirectivo) {
      // Allow execution to proceed.
    } else {
      const esReferente = user.referenteAreas?.map(String).includes(String(areaId));
      if (!esReferente) {
        return res.status(403).json({ message: "No autorizado para esta área" });
      }
    }

    // 🔹 Exclusión de referentes — lógica basada en membresía del área:
    //
    //   EVALUADOR EXTERNO: el área personal del usuario es DISTINTA al área consultada.
    //     Ej: Alejandra (Comité de Gestión) consulta Atención al Cliente.
    //     → Solo se excluye a sí misma. Ve a los co-referentes (Mauro) ✅
    //
    //   MIEMBRO DEL ÁREA: el área personal del usuario es la MISMA que consulta.
    //     Ej: Mauro (Atención al Cliente) consulta Atención al Cliente.
    //     → Se excluyen todos los referentes del área (incluyendo Alejandra). ✅
    //     Mauro sigue viendo a Lautaro, Axel y todos los empleados no-referentes.
    const userAreaId = req.user?.areaId;                  // área personal del usuario
    const userBelongsToArea = userAreaId && String(userAreaId) === String(areaId);

    let exclusionIds;
    if (userBelongsToArea) {
      // Miembro del área → comportamiento original (excluir todos los referentes)
      const areaDoc = await Area.findById(areaId, "referentes").lean();
      exclusionIds = (areaDoc?.referentes || []).map(String);
    } else {
      // Evaluador externo → solo excluir al que consulta
      exclusionIds = selfEmpId ? [String(selfEmpId)] : [];
    }

    // 🔹 Cache check for specific Area
    const cacheKey = `dashArea_${areaId}_${anio || new Date().getFullYear()}_exc_${exclusionIds.join('-')}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(redactSueldoDashboard(cached, req.user));

    const sectores = await Sector.find({ areaId: asObjectId(areaId) }, "_id").lean();
    const sectorIds = sectores.map((s) => s._id);

    const empleadosDocs = await Empleado.find(
      {
        $or: [{ area: asObjectId(areaId) }, { sector: { $in: sectorIds } }],
        _id: { $nin: exclusionIds },
        estadoLaboral: { $ne: "DESVINCULADO" },
      },
      { _id: 1 }
    ).lean();

    const ids = empleadosDocs.map((e) => e._id);
    const data = await computeForEmployees(ids, anio || new Date().getFullYear());

    setCache(cacheKey, data);
    res.json(redactSueldoDashboard(data, req.user));
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

    if ((!sectorId || sectorId === "null") && (user.rol === "directivo" || user.isRRHH || user.rol === "superadmin" || user.isSuper)) {
      const cacheKey = `dashSector_ALL_${anio || new Date().getFullYear()}`;
      const cached = getCache(cacheKey);
      if (cached) return res.json(redactSueldoDashboard(cached, req.user));

      const empleadosDocs = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } }, { _id: 1 }).lean();
      const ids = empleadosDocs.map((e) => e._id);
      const data = await computeForEmployees(ids, anio || new Date().getFullYear());

      setCache(cacheKey, data);
      return res.json(redactSueldoDashboard(data, req.user));
    }

    if (!sectorId || !isValidObjectId(sectorId)) {
      return res.status(400).json({ message: "sectorId inválido" });
    }

    // 🔒 Verificación de alcance.
    //
    // Faltaba. `dashByArea` sí comprobaba que el usuario fuera referente del
    // área, pero acá no había nada: `requireCap('nomina:ver')` solo dice que
    // la persona puede ver NÓMINA, no CUÁL. Cualquier jefe de sector podía
    // pedir el dashboard de cualquier otro sector, con las notas de toda esa
    // gente, cambiando el id en la URL.
    //
    // Vale el sector propio o el área que lo contiene: `referenteSectors`
    // trae solo los sectores donde la persona figura como referente directa,
    // y los 7 jefes de área de la empresa no figuran en ninguno. Sin la
    // segunda condición, cerrar el agujero los dejaba sin ver a su propia
    // gente.
    if (user.rol === "superadmin" || user.isSuper || user.isRRHH || user.rol === "directivo" || user.isDirectivo) {
      // Dirección, RRHH y superadmin ven todo: misma excepción que en dashByArea.
    } else {
      const esReferenteDelSector = user.referenteSectors?.map(String).includes(String(sectorId));
      let esReferenteDelArea = false;
      if (!esReferenteDelSector && user.referenteAreas?.length) {
        const sectorDoc = await Sector.findById(sectorId, "areaId area").lean();
        const areaDelSector = String(sectorDoc?.areaId ?? sectorDoc?.area ?? "");
        esReferenteDelArea = user.referenteAreas.map(String).includes(areaDelSector);
      }
      if (!esReferenteDelSector && !esReferenteDelArea) {
        return res.status(403).json({ message: "No autorizado para este sector" });
      }
    }

    // 🔹 Exclusión de referentes — lógica basada en membresía del sector:
    // IGUAL que en dashByArea.
    // EXTERNO (Alejandra viendo este sector) → solo se excluye a sí misma, ve a los líderes (Mauro)
    // INTERNO (Mauro viendo su propio sector) → se excluyen todos los líderes del sector
    const selfEmpIdSec = req.user?.empleadoId;
    const userSectorId = req.user?.sectorId;
    const userBelongsToSector = userSectorId && String(userSectorId) === String(sectorId);

    let exclusionIdsSec;
    if (userBelongsToSector) {
      const sectorDoc = await Sector.findById(sectorId, "referentes").lean();
      exclusionIdsSec = (sectorDoc?.referentes || []).map(String);
    } else {
      exclusionIdsSec = selfEmpIdSec ? [String(selfEmpIdSec)] : [];
    }

    const empleadosDocs = await Empleado.find(
      {
        sector: asObjectId(sectorId),
        _id: { $nin: exclusionIdsSec },
        estadoLaboral: { $ne: "DESVINCULADO" },
      },
      { _id: 1 }
    ).lean();

    // 🔹 Cache check for specific Sector
    const cacheKey = `dashSector_${sectorId}_${anio || new Date().getFullYear()}_exc_${exclusionIdsSec.join('-')}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(redactSueldoDashboard(cached, req.user));

    const ids = empleadosDocs.map((e) => e._id);
    const data = await computeForEmployees(ids, anio || new Date().getFullYear());

    setCache(cacheKey, data);
    res.json(redactSueldoDashboard(data, req.user));
  } catch (err) {
    console.error("dashBySector error:", err);
    res.status(500).json({ message: err.message || "Error interno en dashBySector" });
  }
};

export const dashByEmpleado = async (req, res, next) => {
  // console.log("!!! VERSION ESTRICTA ACTIVA -- dashByEmpleado CALLED !!!");
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

    // 🔒 Un jefe solo consulta el desempeño de su gente.
    if (!puedeVerEmpleado(req.user, empleado)) {
      return res.status(403).json({ message: "Este empleado está fuera de tu alcance" });
    }

    const areaId = empleado.area ? (empleado.area._id ?? empleado.area) : null;
    const sectorId = empleado.sector ? (empleado.sector._id ?? empleado.sector) : null;
    const areaIdStr = areaId ? String(areaId) : null;
    const sectorIdStr = sectorId ? String(sectorId) : null;

    // 🔹 Traer TODAS las plantillas del año (Active & Inactive) para filtrar en memoria con Sticky Logic
    const plantillas = await Plantilla.find({
      year: year,
      // Removemos filtro estricto de scope/activo aquí, filtramos abajo
    }).lean();

    // Las cuatro consultas que siguen salen juntas: ninguna depende de otra.
    // Mismo motivo que en `computeForEmployees` — estaban haciendo cola.
    const [overridesArr, evals, feedbacksArr, licenciasEmp] = await Promise.all([
      OverrideObjetivo.find({ empleado: empleado._id, year: year }).lean(),
      Evaluacion.find({ empleado: empleado._id, year: year }).lean(),
      Feedback.find({ empleado: empleado._id, year: year }).lean(),
      Incidencia.find({ empleado: empleadoId, tipo: "LICENCIA" }).lean(),
    ]);

    const ovByTpl = new Map(overridesArr.map(o => [String(o.template), o]));
    const historial = indexarHistorial(evals);

    const empIdStr = String(empleado._id);

    // 🔹 Check Referent Status
    const isAreaReferent = empleado.area?.referentes?.some((r) => String(r) === empIdStr);
    const isSectorReferent = empleado.sector?.referentes?.some((r) => String(r) === empIdStr);

    // Cuánto del ciclo estuvo esta persona. Se calcula SIEMPRE —es un hecho—;
    // ajustar las metas sí cambia números y por eso rige desde el AF2026.
    //
    // OJO: la misma lógica está en `computeForEmployees`. Son dos caminos que
    // arman el mismo dashboard y hay que tocar los dos: la primera vez agregué
    // el ciclo solo en aquél, y Mi Desempeño —que entra por acá— no mostraba
    // nada.
    const tiempo = tiempoEfectivo({
      fechaIngreso: empleado.fechaIngreso,
      incidencias: licenciasEmp,
      anioFiscal: Number(year),
    });
    const ajustaMetas = aplicaProrrateo(year) && tiempo.prorratea;

    const objetivosArr = [];
    const aptitudesArr = [];
    let sumPesoObj = 0, weightedProgressSum = 0;
    let sumPesoApt = 0, weightedAptScoreSum = 0;

    for (const p of plantillas) {
      const tplIdStr = String(p._id);

      const isApp = isTemplateApplicable(p, empIdStr, areaIdStr, sectorIdStr, isAreaReferent, isSectorReferent, historial);

      if (!isApp) {
        continue;
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


          const metasCombinadas = (p.metas || []).map((m) => {
            // Ver el comentario del otro punto de búsqueda, más arriba en este
            // mismo archivo: por metaId, con el nombre como red.
            const evaluada = evHito?.metasResultados?.find(
              (em) => String(em.metaId) === String(m._id) || em.nombre === m.nombre
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

        // Metas ajustadas al tiempo que la persona estuvo en el ciclo.
        // Con el ciclo completo devuelve las mismas y no cambia nada.
        const metasAjustadas = ajustaMetas
          ? (p.metas || []).map((m) => prorratearMeta(m, tiempo.meses))
          : (p.metas || []);
        const huboAjuste = metasAjustadas.some((m, i) => m !== (p.metas || [])[i]);

        // 🔹 Score Calculation Refactor
        const { progreso } = calculateAnnualObjectiveProgress(metasAjustadas, hitos);

        objetivosArr.push({
          _id: p._id,
          tipo: "objetivo",
          nombre: p.nombre,
          year: p.year,
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
          metas: metasAjustadas,
          hitos,
          ajustadoAutomaticamente: huboAjuste || false,
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
          year: p.year,
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




    const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];

    // Find latest non-DRAFT feedback (The "Effective" one)
    const latestFeedback = feedbacksArr
      .filter(f => String(f.empleado) === empIdStr)
      .sort((a, b) => periodOrder.indexOf(b.periodo) - periodOrder.indexOf(a.periodo))
      .find(f => f.estado === "CLOSED");

    // --- Re-Calculate Global Scores based on new progressions ---
    const { scoreObj, scoreApt, scoreFinal, bono } = calculateGlobalPerformance(
      objetivosArr,
      aptitudesArr,
      latestFeedback
    );

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
      ciclo: {
        meses: tiempo.meses,
        mesesPorIngreso: tiempo.mesesPorIngreso,
        incompleto: tiempo.incompleto,
        parcial: tiempo.parcial,
        prorrateado: ajustaMetas,
        motivo: tiempo.motivo,
        diasLicencia: tiempo.diasLicencia,
        periodosAplicables: tiempo.periodosAplicables,
        metasAjustadas: objetivosArr.filter((o) => o.ajustadoAutomaticamente).length,
        evaluacionesPreviasIngreso: contarPreviasAlIngreso(objetivosArr, tiempo.mesesPorIngreso),
      },
      debug: {
        sumPesoObj, weightedProgressSum,
        sumPesoApt, weightedAptScoreSum,
        scoreObjRaw: scoreObj,
        scoreAptRaw: scoreApt,
        latestFeedbackPeriod: latestFeedback?.periodo
      },
      // Mostrar feedback solo si está CERRADO
      feedbacks: feedbacksArr.filter(f => f.estado === "CLOSED"),
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

/** ─────────────────────────────────────────────────────────────
 * DEBUG ENDPOINT – GET /api/dashboard/debug/empleado/:empleadoId?anio=2025
 * Comparación compacta: nombre + tipo + peso por fuente.
 * Fuentes: Mi Desempeño (=Sala Eval), Gantt Área, Gantt Sector, Gestión Plantillas
 * ─────────────────────────────────────────────────────────────*/
/** Helper: resume plantilla a lo esencial para comparación */
function slim(p, pesoOverride, reason) {
  return {
    _id: String(p._id),
    nombre: p.nombre,
    tipo: p.tipo,
    peso: pesoOverride ?? p.pesoBase ?? 0,
    reason,
  };
}

export const debugEmpleadoPlantillas = async (req, res, next) => {
  try {
    const { empleadoId } = req.params;
    const year = Number(req.query.anio || req.query.year || new Date().getFullYear());

    // ── Datos base del empleado ──
    const empleado = await Empleado.findById(empleadoId)
      .populate({ path: 'area', select: '_id nombre referentes' })
      .populate({ path: 'sector', select: '_id nombre referentes' })
      .lean();
    if (!empleado) return res.status(404).json({ message: 'Empleado no encontrado' });

    const empIdStr = String(empleado._id);
    const areaIdStr = empleado.area ? String(empleado.area._id ?? empleado.area) : null;
    const sectorIdStr = empleado.sector ? String(empleado.sector._id ?? empleado.sector) : null;

    const isAreaReferent = empleado.area?.referentes?.map(String).includes(empIdStr);
    const isSectorReferent = empleado.sector?.referentes?.map(String).includes(empIdStr);

    // ── Datos base ──
    const plantillas = await Plantilla.find({ year }).lean();
    const evals = await Evaluacion.find({ empleado: empleado._id, year }).lean();
    const overrides = await OverrideObjetivo.find({ empleado: empleado._id, year }).lean();
    const ovByTpl = new Map(overrides.map(o => [String(o.template), o]));

    // ── Helper: motivo por el que aplica (o no) ──
    const getReasonAndApplies = (p) => {
      const tplId = String(p._id);
      const scopeId = p.scopeId ? String(p.scopeId) : null;
      const ov = ovByTpl.get(tplId);
      const hasHist = evals.some(ev =>
        (String(ev.empleado) === empIdStr || String(ev.empleado?._id) === empIdStr) &&
        String(ev.plantillaId) === tplId
      );

      if (ov && !ov.excluido) return { reason: 'OVERRIDE_INCLUDED', applies: true };
      if (ov && ov.excluido) return { reason: 'OVERRIDE_EXCLUDED', applies: false };
      if (hasHist) return { reason: 'STICKY_HISTORY', applies: true };
      if (!p.activo) return { reason: 'INACTIVE', applies: false };
      if (p.scopeType === 'empleado' && scopeId === empIdStr) return { reason: 'SCOPE_EMPLEADO', applies: true };
      if (p.scopeType === 'area' && scopeId === areaIdStr) return { reason: 'SCOPE_AREA', applies: true };
      if (p.scopeType === 'sector' && scopeId === sectorIdStr) return { reason: 'SCOPE_SECTOR', applies: true };
      return { reason: 'NO_MATCH', applies: false };
    };

    // ──────────────────────────────────────────────────────────────────
    // FUENTE A: Mi Desempeño + Sala de Evaluación (mismo endpoint: dashByEmpleado)
    // Lógica: isTemplateApplicable primero, luego excluye si override.excluido
    // ──────────────────────────────────────────────────────────────────
    const fuenteA = plantillas
      .filter(p => {
        const { applies, reason } = getReasonAndApplies(p);
        if (reason === 'OVERRIDE_EXCLUDED') return false;  // explicitamente excluido
        return applies;
      })
      .map(p => {
        const ov = ovByTpl.get(String(p._id));
        const peso = (ov && ov.peso != null) ? Number(ov.peso) : (p.pesoBase ?? 0);
        const { reason } = getReasonAndApplies(p);
        return slim(p, peso, reason);
      });

    // ──────────────────────────────────────────────────────────────────
    // FUENTE B: Gantt (computeForEmployees)
    // Diferencia clave: chequea override de INCLUSIÓN antes que isTemplateApplicable
    // Pero TAMBIÉN: el empleado puede ser excluido del query de área/sector si es referente
    // ──────────────────────────────────────────────────────────────────
    // ¿Aparecería en el Gantt del Área?
    let incluidoEnGanttArea = false;
    if (areaIdStr) {
      const empEnArea = await Empleado.findOne(
        { _id: empleado._id, area: areaIdStr, ...(isAreaReferent ? {} : {}) },
        '_id'
      ).lean();
      // El Gantt de área excluye referentes del área
      incluidoEnGanttArea = !!empEnArea && !isAreaReferent;
    }
    // ¿Aparecería en el Gantt del Sector?
    let incluidoEnGanttSector = false;
    if (sectorIdStr) {
      incluidoEnGanttSector = !isSectorReferent; // solo excluye si es referente del sector
    }

    // Items que computeForEmployees devolvería para este empleado (lógica override-first)
    const fuenteB = plantillas
      .filter(p => {
        const ov = ovByTpl.get(String(p._id));
        if (ov && !ov.excluido) return true;  // inclusión forzada
        const { applies } = getReasonAndApplies(p);
        return applies && !(ov?.excluido);    // scope/sticky + no excluido
      })
      .map(p => {
        const ov = ovByTpl.get(String(p._id));
        const peso = (ov && ov.peso != null) ? Number(ov.peso) : (p.pesoBase ?? 0);
        const { reason } = getReasonAndApplies(p);
        return slim(p, peso, reason);
      });

    // ──────────────────────────────────────────────────────────────────
    // FUENTE C: Gestión Plantillas (query directa, sin overrides)
    // ──────────────────────────────────────────────────────────────────
    const rawGestion = await Plantilla.find({
      year, activo: true,
      $or: [
        { scopeType: 'empleado', scopeId: empleado._id },
        ...(areaIdStr ? [{ scopeType: 'area', scopeId: areaIdStr }] : []),
        ...(sectorIdStr ? [{ scopeType: 'sector', scopeId: sectorIdStr }] : []),
      ]
    }).lean();
    const fuenteC = rawGestion.map(p => slim(p, p.pesoBase ?? 0, 'SCOPE_DIRECTO'));

    // ── Comparación ──
    const idsA = new Set(fuenteA.map(x => x._id));
    const idsB = new Set(fuenteB.map(x => x._id));
    const idsC = new Set(fuenteC.map(x => x._id));

    const soloEnA = fuenteA.filter(x => !idsB.has(x._id));
    const soloEnB = fuenteB.filter(x => !idsA.has(x._id));
    const enAyBperoNoC = fuenteA.filter(x => idsB.has(x._id) && !idsC.has(x._id));
    const enCperoNoAyB = fuenteC.filter(x => !idsA.has(x._id) && !idsB.has(x._id));

    res.json({
      empleado: {
        nombre: `${empleado.apellido}, ${empleado.nombre}`,
        puesto: empleado.puesto,
        area: empleado.area?.nombre ?? null,
        sector: empleado.sector?.nombre ?? null,
        esReferenteArea: !!isAreaReferent,
        esReferenteSector: !!isSectorReferent,
      },
      year,
      gantt_nota: incluidoEnGanttArea
        ? '✅ Incluido en Gantt de Área (no es referente de área)'
        : incluidoEnGanttSector
          ? '⚠️ Solo visible en Gantt de Área; excluido del Gantt de Sector (es referente de sector)'
          : '❌ Excluido de todos los Gantt (es referente de área y sector)',
      totales: {
        'Mi Desempeño + Sala Eval': fuenteA.length,
        'Gantt (computeForEmployees)': fuenteB.length,
        'Gestión Plantillas (directa)': fuenteC.length,
      },
      // ── Listas comparativas por fuente ──
      fuenteA_MiDesempeno: fuenteA,
      fuenteB_Gantt: fuenteB,
      fuenteC_GestionPlantillas: fuenteC,
      // ── Discrepancias ──
      discrepancias: {
        soloEnMiDesempeno_noEnGantt: soloEnA,
        soloEnGantt_noEnMiDesempeno: soloEnB,
        enDashboard_noEnGestionPlantillas: enAyBperoNoC,
        enGestionPlantillas_noEnDashboard: enCperoNoAyB,
      },
    });
  } catch (e) {
    console.error('debugEmpleadoPlantillas error:', e);
    next(e);
  }
};

/**
 * Pesos asignados por empleado: cuánto suman los objetivos y las competencias
 * que efectivamente le aplican en un año fiscal.
 *
 * Por qué existe: los pesos no se cargan en un solo lugar. Salen del alcance de
 * cada plantilla (global / área / sector / empleado) más los overrides
 * individuales, así que desde la pantalla de carga nadie puede ver el total de
 * una persona. El desvío aparece recién cuando la nota ya salió: en AF 2025/26
 * Susana Iturrioz cerró el año con 70 puntos asignados sobre 100, y tres
 * empleados de AF 2026/27 tienen 150.
 *
 * Usa isTemplateApplicable —el mismo criterio que el dashboard, incluida la
 * regla "sticky" de conservar plantillas con historial— para que lo que se
 * muestra acá sea exactamente lo que se calcula.
 */
export async function pesosAsignados(req, res) {
  try {
    const anio = Number(req.query.anio);
    if (!anio || Number.isNaN(anio)) {
      return res.status(400).json({ message: "Parámetro 'anio' requerido" });
    }
    const incluirDesvinculados = String(req.query.incluirDesvinculados || "") === "true";

    const base = incluirDesvinculados ? {} : { estadoLaboral: "VINCULADO" };
    const alcance = filtroAlcanceEmpleados(req.user);
    const queryEmp = alcance ? { $and: [base, alcance] } : base;

    const [empleados, plantillas, overrides, evals] = await Promise.all([
      Empleado.find(queryEmp)
        .populate("area", "nombre referentes")
        .populate("sector", "nombre referentes")
        .lean(),
      Plantilla.find({ year: anio }).lean(),
      OverrideObjetivo.find({ year: anio }).lean(),
      Evaluacion.find({ year: anio }, "empleado plantillaId").lean(),
    ]);

    const ovByEmp = new Map();
    for (const o of overrides) {
      const k = String(o.empleado);
      if (!ovByEmp.has(k)) ovByEmp.set(k, new Map());
      ovByEmp.get(k).set(String(o.template), o);
    }
    const historial = indexarHistorial(evals);

    const items = empleados.map((emp) => {
      const empIdStr = String(emp._id);
      const areaIdStr = emp.area ? String(emp.area._id ?? emp.area) : "";
      const sectorIdStr = emp.sector ? String(emp.sector._id ?? emp.sector) : "";
      const isAreaReferent = (emp.area?.referentes || []).some((r) => String(r) === empIdStr);
      const isSectorReferent = (emp.sector?.referentes || []).some((r) => String(r) === empIdStr);
      const ovs = ovByEmp.get(empIdStr) || new Map();

      const bloque = (tipo) => {
        const detalle = [];
        let suma = 0;
        for (const p of plantillas) {
          if (p.tipo !== tipo) continue;
          if (!isTemplateApplicable(p, empIdStr, areaIdStr, sectorIdStr, isAreaReferent, isSectorReferent, historial)) continue;

          const ov = ovs.get(String(p._id));
          const excluido = !!ov?.excluido;
          const tieneOvPeso = ov && ov.peso != null && !Number.isNaN(Number(ov.peso));
          const peso = tieneOvPeso ? Number(ov.peso) : Number(p.pesoBase || 0);
          if (!excluido) suma += peso;

          detalle.push({
            plantillaId: String(p._id),
            nombre: p.nombre,
            scopeType: p.scopeType,
            peso,
            pesoBase: Number(p.pesoBase || 0),
            origen: tieneOvPeso ? "override" : "base",
            excluido,
          });
        }
        // Primero los que cuentan, de mayor a menor peso; los excluidos al final.
        detalle.sort((a, b) => Number(a.excluido) - Number(b.excluido) || b.peso - a.peso);
        return {
          cantidad: detalle.filter((d) => !d.excluido).length,
          excluidos: detalle.filter((d) => d.excluido).length,
          suma: Math.round(suma * 100) / 100,
          detalle,
        };
      };

      return {
        empleadoId: empIdStr,
        nombre: emp.nombre,
        apellido: emp.apellido,
        puesto: emp.puesto,
        estadoLaboral: emp.estadoLaboral,
        area: emp.area?.nombre || null,
        sector: emp.sector?.nombre || null,
        objetivos: bloque("objetivo"),
        competencias: bloque("aptitud"),
      };
    });

    items.sort((a, b) =>
      `${a.apellido || ""} ${a.nombre || ""}`.localeCompare(`${b.apellido || ""} ${b.nombre || ""}`, "es")
    );

    // Un empleado sin ninguna plantilla no es un desvío de pesos: es alguien a
    // quien todavía no le cargaron nada. Lo contamos aparte.
    const conCarga = items.filter((i) => i.objetivos.cantidad > 0 || i.competencias.cantidad > 0);
    const resumen = {
      total: items.length,
      sinCarga: items.length - conCarga.length,
      objetivosFueraDe100: conCarga.filter((i) => i.objetivos.cantidad > 0 && i.objetivos.suma !== 100).length,
      competenciasFueraDe100: conCarga.filter((i) => i.competencias.cantidad > 0 && i.competencias.suma !== 100).length,
    };

    res.json({ anio, resumen, items });
  } catch (err) {
    console.error("pesosAsignados error:", err);
    res.status(500).json({ message: "Error calculando pesos asignados" });
  }
}
