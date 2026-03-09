import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { api, API_ORIGIN } from "@/lib/api";
import { evaluarCumple, calcularResultadoGlobal } from "@/lib/evaluarCumple";
import { dashEmpleado } from "@/lib/dashboard";
import {
  UserCircle2,
  ChevronDown,
  ChevronUp,
  Target,
  Lightbulb,
  Save,
  Send,
  MessageSquare,
  BarChart3,
  RefreshCw,
  Calendar,
  FileEdit,
  Users,
  CheckCircle,
  Trash2,
  Printer,
  Trophy,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  History
} from "lucide-react";
import { calculateObjectiveProgress, calculateWeightedScore, calculateGlobalScore, calculateMetaScore, calculatePeriodCompliance } from "@/utils/calculos";

import { ReferenceRulesDialog } from "@/components/ReferenceRulesDialog";
import { ReporteFinal } from "@/components/ReporteFinal";

/* ===================== Constantes y helpers ===================== */

const ESTADOS = [
  { code: "NO_ENVIADOS", label: "No enviados", color: "bg-slate-100 text-slate-700", ring: "ring-slate-300" },
  { code: "PENDING_EMPLOYEE", label: "Enviados", color: "bg-amber-100 text-amber-800", ring: "ring-amber-300" },
  { code: "PENDING_HR", label: "En RRHH", color: "bg-blue-100 text-blue-800", ring: "ring-blue-300" },
  { code: "CLOSED", label: "Cerrados", color: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-300" },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Helper to calculate "Running Score" for display
const getRunningScore = (obj, currentHito) => {
  if (!obj?.hitos || obj.hitos.length === 0) return { value: 0, label: "Sin datos" };

  // --- 1. GATHER DATA ---
  // We construct the "effective" hitos list by merging the current editing state
  const effectiveHitos = obj.hitos.map(h => {
    // If this is the current period being edited
    if (h.periodo === currentHito.periodo) {
      // Create a merged hito that includes the latest values from currentHito
      return {
        ...h,
        ...currentHito, // Merge results, state, etc.
        actual: currentHito.actual // Ensure actual key is set
      };
    }
    return h;
  });

  // --- 2. CALCULATE USING CORE ENGINE ---
  // This handles mixed rules (e.g. Meta A = Average, Meta B = Threshold) correctly
  // by delegating to the standard calculation logic used in the backend/reports.
  const score = calculateObjectiveProgress(obj, effectiveHitos);

  // --- 3. DETERMINE LABEL ---
  // Try to detect if we are waiting for a threshold on the OBJECTIVE level
  // (Only if ALL metas or the Obj itself use threshold rule)
  let label = "Proyección Anual";
  let isPendingThreshold = false;

  const rule = obj.reglaCierre || "promedio";
  const uniqueMetaRules = [...new Set(obj.metas?.map(m => m.reglaCierre).filter(Boolean))];

  if (rule === "umbral_periodos" || (uniqueMetaRules.length === 1 && uniqueMetaRules[0] === "umbral_periodos")) {
    // If score is 0 but we have valid hitos, it might be pending threshold
    if (score === 0 && effectiveHitos.some(h => h.actual > 0)) {
      label = "Umbral Pendiente";
      isPendingThreshold = true;
    } else {
      label = "Promedio (Umbral)";
    }
  } else if (rule === "ultimo_valor" || (uniqueMetaRules.length === 1 && uniqueMetaRules[0] === "ultimo_valor")) {
    label = "Último Valor";
  } else if (uniqueMetaRules.length > 1) {
    label = "Score Estimado (Mix)";
  }

  return {
    value: score,
    label,
    isValue: true,
    decimals: 1,
    isPendingThreshold
  };
};

const ProgressBar = ({ value = 0 }) => (
  <div className="w-full h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
    <div
      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-[width] duration-300"
      style={{ width: `${Math.max(0, Math.min(100, Math.round(value)))}%` }}
    />
  </div>
);

function buildResumenEmpleado(data) {
  if (!data) return null;
  let objetivos = Array.isArray(data.objetivos) ? data.objetivos : (data.objetivos?.items || []);
  let aptitudes = Array.isArray(data.aptitudes) ? data.aptitudes : (data.aptitudes?.items || []);

  console.group("🧮 Debug Cálculo de Scores");

  // Calculate Objective Score (LIVE RECALCULATION)
  const pesosObj = objetivos.map((o) => Number(o.peso ?? 0));
  const pesosBaseObj = objetivos.map((o) => Number(o.pesoBase ?? o.peso ?? 0));

  let scoreObjRaw = 0;
  let totalBasePesoObj = 0;
  const progObj = []; // To store individual objective progress for debug/display

  objetivos.forEach((o, i) => {
    const peso = pesosObj[i];
    const pesoBase = pesosBaseObj[i];
    totalBasePesoObj += pesoBase;

    const hitosValidos = o.hitos?.filter(h => h.actual != null) || [];
    const scoreRaw = calculateObjectiveProgress(o, hitosValidos);
    const scoreContrib = calculateWeightedScore(scoreRaw, peso, o); // Pass objective for permiteOver check

    scoreObjRaw += scoreContrib;
    progObj.push(scoreRaw); // Store for debug/display
  });

  // Normalize scoreObjRaw if totalBasePesoObj is not 100 (e.g., if some objectives have 0 weight)
  // The calculateWeightedScore already handles the 100 division, so scoreObjRaw is already a percentage of total possible.
  // If totalBasePesoObj is 0, scoreObjRaw will be 0, which is correct.

  console.log("Objetivos (Live Calc):", objetivos.map((o, i) => ({
    nombre: o.nombre,
    peso: pesosObj[i],
    progreso: progObj[i],
    scoreContrib: (pesosObj[i] * progObj[i]) / 100
  })));

  // scoreObjRaw is already calculated in the loop above.
  console.log("Score Objetivos (Raw):", scoreObjRaw);

  const scoreObj = scoreObjRaw;

  // Calculate Aptitude Score
  const pesosApt = aptitudes.map((a) => Number(a.peso ?? 0));
  const progApt = aptitudes.map((a) => Number(a.puntuacion ?? a.score ?? 0));

  console.log("Aptitudes:", aptitudes.map((a, i) => ({
    nombre: a.nombre,
    score: progApt[i]
  })));

  const scoreApt = progApt.length
    ? progApt.reduce((a, b) => a + b, 0) / progApt.length
    : 0;

  console.log("Score Aptitudes (Raw):", scoreApt);

  // Global Score (70/30)
  const scoreObjWeighted = scoreObj * 0.7;
  const scoreAptWeighted = scoreApt * 0.3;
  const global = scoreObjWeighted + scoreAptWeighted;

  console.log("Final:", { scoreObjWeighted, scoreAptWeighted, global });

  // --- DEBUG: CÁLCULO POR TRIMESTRE (Q1, Q2, Q3, Q4) ---
  const periods = ["Q1", "Q2", "Q3", "4"]; // Helper to identify periods (checking string contains)
  const breakdownProyeccion = {};

  // Find all unique periods present in hitos
  const allPeriods = new Set();
  objetivos.forEach(o => o.hitos?.forEach(h => allPeriods.add(h.periodo)));
  const sortedPeriods = Array.from(allPeriods).sort();

  const periodBreakdown = sortedPeriods.map(periodo => {
    // 1. Calc Obj Score for this period
    let p_totalPesoObj = 0;
    let p_weightedScoreObj = 0;

    objetivos.forEach(o => {
      // Find hito for this period
      const hito = o.hitos?.find(h => h.periodo === periodo);
      const peso = Number(o.peso || 0);

      // Calculate PROPER score for this hito using the helper
      // This will respect reconoceEsfuerzo, tolerancia, permiteOver from the meta definitions
      // We create a temporary objective object with only this hito to use the helper
      const scoreRaw = calculateObjectiveProgress(o, [hito].filter(Boolean));

      p_totalPesoObj += peso;
      p_weightedScoreObj += calculateWeightedScore(scoreRaw, peso, o);
    });

    const p_scoreObj = p_totalPesoObj > 0 ? p_weightedScoreObj : 0; // weightedScore already normalized to contribution



    // 2. Calc Apt Score for this period
    let p_aptSum = 0;
    let p_aptCount = 0;
    aptitudes.forEach(a => {
      const hito = a.hitos?.find(h => h.periodo === periodo);
      if (hito && hito.actual != null) {
        p_aptSum += Number(hito.actual);
        p_aptCount++;
      }
    });
    const p_scoreApt = p_aptCount > 0 ? (p_aptSum / p_aptCount) : 0;

    // 3. Global
    const p_global = (p_scoreObj * 0.7) + (p_scoreApt * 0.3);

    return {
      periodo,
      scoreObj: Math.round(p_scoreObj),
      scoreApt: Math.round(p_scoreApt),
      global: Math.round(p_global)
    };
  });

  console.log("Breakdown Periods:", periodBreakdown);
  console.groupEnd();

  return {
    objetivos: { cantidad: objetivos.length, peso: totalBasePesoObj, score: scoreObjWeighted, rawScore: scoreObj },
    aptitudes: { cantidad: aptitudes.length, score: scoreAptWeighted, rawScore: scoreApt },
    global,
    debug: {
      objetivos: objetivos.map((o, i) => {
        // Collect ALL metas (root + hitos) to ensure we find the rules (which might be populated in hitos only)
        const allMetas = [...(o.metas || [])];
        o.hitos?.forEach(h => {
          h.metas?.forEach(m => allMetas.push(m));
        });

        const hasEffectiveAccumulation = allMetas.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
        const uniqueRules = [...new Set(allMetas.map(m => m.reglaCierre).filter(Boolean))];

        let label = "Promedio";
        if (hasEffectiveAccumulation) {
          label = "Suma (Acum.)";
        } else if (uniqueRules.length === 1) {
          const r = uniqueRules[0];
          if (r === "ultimo_valor") label = "Último Valor";
          else if (r === "umbral_periodos") label = "Umbral Periodos";
          else if (r === "promedio") label = "Promedio";
          else label = r;
        } else if (uniqueRules.length > 1) {
          label = "Mix Metas";
        }

        // --- Meta Detail Construction ---
        // We need a unique list of definition metas. 
        // Best source: root definition OR inferred from first hito.
        // Let's group allMeta entries by ID/Name to build the "Rows"
        const metaGroups = {};
        allMetas.forEach(m => {
          const k = m.metaId || m._id || m.nombre;
          if (!metaGroups[k]) {
            metaGroups[k] = {
              def: m,
              values: []
            };
          } else {
            // Update def if current m is "better" (has config that current def lacks)
            const curDef = metaGroups[k].def;
            const hasRule = m.reglaCierre || m.umbralPeriodos;
            const curHasRule = curDef.reglaCierre || curDef.umbralPeriodos;
            if (hasRule && !curHasRule) {
              metaGroups[k].def = m;
            }
          }
        });

        // Now populate values per period for each meta
        o.hitos?.forEach(h => {
          h.metas?.forEach(m => {
            const k = m.metaId || m._id || m.nombre;
            if (metaGroups[k]) {
              metaGroups[k].values.push({
                period: h.periodo,
                val: m.resultado,
                target: m.esperado ?? m.target // Capture target
              });
            }
          });
        });

        const metasDetails = Object.values(metaGroups).map(g => ({
          nombre: g.def.nombre,
          peso: g.def.peso || g.def.pesoMeta, // Check both
          config: {
            regla: g.def.reglaCierre || "promedio",
            acum: g.def.modoAcumulacion === 'acumulativo' || g.def.acumulativa,
            esfuerzo: g.def.reconoceEsfuerzo,
            over: g.def.permiteOver,
            umbral: g.def.umbralPeriodos, // Capture threshold
            target: g.def.esperado ?? g.def.target,
            unidad: g.def.unidad,
            operador: g.def.operador
          },
          breakdown: g.values // [{period: 'Q1', val: 50}, ...]
        }));

        return {
          nombre: o.nombre,
          peso: pesosObj[i],
          progreso: progObj[i],
          hitosEvaluados: o.hitos?.filter(h => h.actual != null).length || 0,
          hitosTotal: o.hitos?.length || 0,
          hitosValores: o.hitos?.map(h => ({
            actual: h.actual ?? 0,
            target: h.target ?? h.meta ?? 100
          })) || [],
          scoreContrib: (pesosObj[i] * progObj[i]) / 100,
          metodoCalculo: label,
          plantillaId: o.plantillaId, // Pass through
          umbralPeriodos: o.umbralPeriodos, // Pass through if exists
          rawMetas: o.metas, // EXPOSE RAW METAS FOR FALLBACK
          metasDetails
        };
      }),
      aptitudes: aptitudes.map((a, i) => ({ nombre: a.nombre, score: progApt[i] })),
      periodos: periodBreakdown
    }
  };
}

function metaKey(m = {}) {
  return `${m.nombre ?? ""}__${m.unidad ?? ""}`;
}

function dedupeMetas(arr = []) {
  const seen = new Set();
  const out = [];
  for (const m of arr) {
    const key = metaKey(m);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function deepCloneMetas(metas = []) {
  const cloned = metas.map((m) => {
    const esperado = m.esperado ?? m.target ?? m.meta ?? null;
    return {
      _id: m._id,
      metaId: m.metaId || m._id,
      nombre: m.nombre,
      esperado,
      unidad: m.unidad,
      operador: m.operador || ">=",
      modoAcumulacion: m.modoAcumulacion || (m.acumulativa ? "acumulativo" : "periodo"),
      acumulativa: m.acumulativa ?? m.modoAcumulacion === "acumulativo",
      resultado: m.resultado ?? null,
      cumple: m.resultado != null && m.cumple != null ? !!m.cumple : false,
      peso: m.peso ?? m.pesoBase ?? null,
      reconoceEsfuerzo: m.reconoceEsfuerzo,
      permiteOver: m.permiteOver,
      tolerancia: m.tolerancia,
      reglaCierre: m.reglaCierre
    };
  });
  return dedupeMetas(cloned);
}

function bucketConfig(bucket) {
  switch (bucket) {
    case "por_vencer": return { label: "Por vencer", chip: "🔥 Por vencer", badgeClass: "bg-amber-100 text-amber-800", canEdit: true };
    case "vencido": return { label: "Vencidos", chip: "⚠ Vencido", badgeClass: "bg-rose-100 text-rose-800", canEdit: true };
    // Estados de flujo antiguos (ahora se consideran simplemente evaluados o en proceso)
    case "PENDING_EMPLOYEE":
    case "PENDING_HR":
    case "CLOSED":
      return { label: "Evaluado", chip: "✅ Evaluado", badgeClass: "bg-emerald-100 text-emerald-800", canEdit: true };
    default: return { label: "En curso", chip: "⏳ En curso", badgeClass: "bg-slate-100 text-slate-700", canEdit: true };
  }
}

const FISCAL_YEAR_START_MONTH = 8; // September (0-indexed = 8)

function getSmartHitoStatus(hito) {
  if (hito.actual !== null || hito.estado === "CERRADO") return "evaluado";

  const now = new Date();
  let startDate, deadline;

  // Try parsing period string (e.g., "2025M12", "2025Q2")
  const period = hito.periodo || "";
  const yearStr = period.slice(0, 4);
  const typeCode = period.slice(4); // "M12", "Q2"

  if (!isNaN(yearStr) && typeCode) {
    let year = parseInt(yearStr);

    // --- MONTHLY LOGIC ---
    if (typeCode.startsWith("M")) {
      const month = parseInt(typeCode.slice(1)); // 1-12
      // Construct Start Date: 1st of that month
      startDate = new Date(year, month - 1, 1);
      // Construct Deadline: 10th of the NEXT month
      deadline = new Date(year, month, 10);
    }
    // --- QUARTERLY LOGIC ---
    else if (typeCode.startsWith("Q")) {
      const q = parseInt(typeCode.slice(1)); // 1-4
      // Mapping Fiscal Q to Calendar Months (Assuming Fiscal Start Sep)
      // Q1: Sep-Nov (Year)
      // Q2: Dec (Year) - Feb (Year+1)
      // Q3: Mar-May (Year+1)
      // Q4: Jun-Aug (Year+1)

      let startMonth; // 0-indexed
      let endMonth;

      if (q === 1) { // Sep-Nov
        startMonth = 8; // Sep
        // year remains same
      } else if (q === 2) { // Dec-Feb
        startMonth = 11; // Dec
        // year remains same for start
      } else if (q === 3) { // Mar-May
        startMonth = 2; // Mar
        year += 1; // next year
      } else if (q === 4) { // Jun-Aug
        startMonth = 5; // Jun
        year += 1; // next year
      }

      startDate = new Date(year, startMonth, 1);
      // Deadline: 10th of month AFTER quarter ends (3 months long)
      deadline = new Date(year, startMonth + 3, 10);
    }
  }

  // Fallback if parsing failed
  if (!startDate) {
    if (!hito.fecha) return "futuro";
    startDate = new Date(hito.fecha);
    deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + 30); // Default 30 day window
  }

  // LOGIC
  // If NOW < START -> Futuro
  if (now < startDate) return "futuro";

  // If NOW > DEADLINE -> Vencido
  if (now > deadline) return "vencido";

  // If NOW is between START and DEADLINE -> Por Vencer / En Curso
  // User wants "Por Vencer" for current month M12.
  return "por_vencer";
}

function getHitoColorClass(status) {
  switch (status) {
    case "evaluado": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "vencido": return "bg-rose-100 text-rose-800 border-rose-200";
    case "por_vencer": return "bg-amber-100 text-amber-800 border-amber-200";
    default: return "bg-blue-50 text-blue-700 border-blue-200";
  }
}



function getCierreLabel(meta) {
  const rule = meta.reglaCierre || "promedio";
  if (rule === "promedio") return "Promedio";
  if (rule === "cierre_unico") return "Cierre Único";
  if (rule === "umbral_periodos") return `Umbral (${meta.umbralPeriodos || "?"} per.)`;
  return rule.charAt(0).toUpperCase() + rule.slice(1);
}

/* ===================== Componente principal ===================== */

function getAccumulatedValue(obj, metaId, currentPeriod, currentValue) {
  if (!obj || !Array.isArray(obj.hitos)) return currentValue || 0;

  // Dynamically determine period order from available hitos in the object
  // Sorting effectively handles: 
  // - "YYYYQX" (e.g. 2025Q1, 2025Q2)
  // - "YYYYMXX" (e.g. 2025M01, 2025M02)
  // - Simple "Q1", "Q2" (legacy support)
  const periodOrder = obj.hitos
    .map(h => h.periodo)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const currentIdx = periodOrder.indexOf(currentPeriod);
  if (currentIdx === -1) return currentValue || 0;

  let total = 0;
  for (const h of obj.hitos) {
    const hIdx = periodOrder.indexOf(h.periodo);
    if (hIdx !== -1 && hIdx <= currentIdx) {
      const m = h.metas?.find(m => (m.metaId === metaId || m._id === metaId));
      if (h.periodo === currentPeriod) {
        // If it's the current period being edited/viewed, use the passed currentValue
        total += Number(currentValue ?? 0);
      } else if (m) {
        total += Number(m.resultado || 0);
      }
    }
  }
  return total;
}

/* ===================== Componente Principal ===================== */
export default function EvaluacionFlujo() {
  const { plantillaId, periodo, empleadoId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Roles
  const esReferente = Boolean((Array.isArray(user?.referenteAreas) && user.referenteAreas.length > 0) || (Array.isArray(user?.referenteSectors) && user.referenteSectors.length > 0));
  const esDirector = user?.rol === "directivo" || user?.isRRHH === true;
  const esSuperAdmin = user?.rol === "superadmin";
  const esVisor = user?.rol === "visor";
  const puedeVer = esReferente || esDirector || esSuperAdmin || esVisor;

  const [anio] = useState(state?.anio ?? Number(String(periodo || 2025).slice(0, 4)));
  const [selectedEmpleadoId] = useState(empleadoId || state?.empleado?._id || state?.empleadosDelItem?.[0]?._id || user?.empleado?._id || null);
  const [empleadoInfo, setEmpleadoInfo] = useState(state?.empleado || state?.empleadosDelItem?.[0] || user?.empleado || null);

  const [dashEmpleadoData, setDashEmpleadoData] = useState(null);
  const [loadingDash, setLoadingDash] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState(plantillaId === "feedback-global" ? "feedback" : "evaluacion"); // "evaluacion" | "feedback"

  // Estado local para selección (Sidebar Logic)
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'objetivo' | 'competencia', id: string, data: object }
  const [evaluacionData, setEvaluacionData] = useState({}); // { [itemId]: { localHito: ..., comentarioManager: ... } }
  const [savingItems, setSavingItems] = useState({}); // { [itemId]: boolean }

  // Estado para expandir detalles de feedback
  const [expandedFeedback, setExpandedFeedback] = useState({}); // { [periodo]: boolean }

  const toggleFeedbackDetail = (periodo) => {
    setExpandedFeedback(prev => ({ ...prev, [periodo]: !prev[periodo] }));
  };

  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]);

  // TESTING MODE
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [showFinalReport, setShowFinalReport] = useState(false);
  const [showDebugDialog, setShowDebugDialog] = useState(false);

  const puedeEditarObjetivo = (obj, localHito) => {
    if (isTestingMode) return true;
    if (savingItems[obj._id]) return false;
    if (!localHito) return false;
    if (localHito.estado === "PENDING_HR" || localHito.estado === "CERRADO") return false;
    return true;
  };

  const handleDeleteEvaluacion = async (item, periodo) => {
    if (!confirm(`[MODO ADMIN] ¿Borrar la evaluación de ${periodo}? Esto es irreversible.`)) return;
    try {
      // Find evaluation ID
      const ev = await api(`/evaluaciones?empleado=${selectedEmpleadoId}&plantillaId=${item._id}&periodo=${periodo}`);
      const target = Array.isArray(ev) ? ev[0] : ev?.items?.[0];

      if (target?._id) {
        await api(`/evaluaciones/${target._id}`, { method: "DELETE" });
        toast.success("Evaluación eliminada");
        // Reload dashboard
        const res = await dashEmpleado(selectedEmpleadoId, anio);
        if (res) setDashEmpleadoData(res);
        // Clear local view
        setEvaluacionData(prev => {
          const copy = { ...prev };
          delete copy[item._id];
          return copy;
        });
        setExpandedItems(prev => ({ ...prev, [item._id]: false }));
      } else {
        toast.error("No se encontró evaluación guardada para borrar");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error borrando evaluación");
    }
  };

  const handleDeleteFeedback = async (id) => {
    if (!confirm(`[MODO ADMIN] ¿Borrar este feedback?`)) return;
    try {
      await api(`/feedbacks/${id}`, { method: "DELETE" });
      toast.success("Feedback eliminado");
      setFeedbacks(prev => prev.filter(f => f._id !== id));
    } catch (e) {
      console.error(e);
      toast.error("Error eliminando feedback");
    }
  };

  // Periodo Global de Evaluación (por defecto el de la URL)
  const [periodoGlobal, setPeriodoGlobal] = useState(periodo || null);

  // Cargar info empleado y validar permisos
  useEffect(() => {
    (async () => {
      if (!selectedEmpleadoId || empleadoInfo) {
        // Si ya tenemos info, validamos permisos aquí también por si acaso
        if (empleadoInfo && esReferente && !esDirector && !esSuperAdmin && !esVisor) {
          const empSectorId = String(empleadoInfo.sector?._id || empleadoInfo.sector);
          const empAreaId = String(empleadoInfo.area?._id || empleadoInfo.area);

          const hasSectorAccess = user.referenteSectors?.some(s => String(s._id || s) === empSectorId);
          const hasAreaAccess = user.referenteAreas?.some(a => String(a._id || a) === empAreaId);

          if (!hasSectorAccess && !hasAreaAccess) {
            // Si es el propio empleado, permitir (autoevaluación o ver su propia eval)
            // Pero 'esReferente' suele ser para ver a OTROS.
            // Si user.empleado._id === selectedEmpleadoId -> OK.
            if (user.empleado?._id !== selectedEmpleadoId) {
              toast.error("No tienes permisos para ver este empleado.");
              navigate("/seguimiento"); // O a donde corresponda
              return;
            }
          }
        }
        return;
      }

      try {
        const emp = await api(`/empleados/${selectedEmpleadoId}`);

        // Validar permisos al cargar
        if (esReferente && !esDirector && !esSuperAdmin && !esVisor) {
          const empSectorId = String(emp.sector?._id || emp.sector);
          const empAreaId = String(emp.area?._id || emp.area);

          const hasSectorAccess = user.referenteSectors?.some(s => String(s._id || s) === empSectorId);
          const hasAreaAccess = user.referenteAreas?.some(a => String(a._id || a) === empAreaId);

          if (!hasSectorAccess && !hasAreaAccess) {
            if (user.empleado?._id !== emp._id) {
              toast.error("No tienes permisos para ver este empleado.");
              navigate("/seguimiento");
              return;
            }
          }
        }

        setEmpleadoInfo(emp);
      } catch (e) { console.error(e); }
    })();
  }, [selectedEmpleadoId, empleadoInfo, esReferente, esDirector, esSuperAdmin, esVisor, user, navigate]);

  // Cargar Dashboard + Hydrate Templates
  useEffect(() => {
    (async () => {
      if (!selectedEmpleadoId) return;
      try {
        setLoadingDash(true);
        const res = await dashEmpleado(selectedEmpleadoId, anio);
        if (res) {
          const normalized = { ...res };
          if (normalized.objetivos?.items && !Array.isArray(normalized.objetivos)) normalized.objetivos = normalized.objetivos.items;
          if (normalized.aptitudes?.items && !Array.isArray(normalized.aptitudes)) normalized.aptitudes = normalized.aptitudes.items;

          // --- HYDRATION STEP: Fetch fresh templates to fix stale snapshots ---
          if (normalized.objetivos && normalized.objetivos.length > 0) {
            try {
              // 1. Collect IDs
              const ids = normalized.objetivos.map(o => o._id).filter(Boolean);

              // 2. Fetch all fresh templates
              // We use Promise.all for now. If too many, we might need a bulk endpoint, but 10-20 is fine.
              const freshTemplates = await Promise.all(
                ids.map(id => api(`/templates/${id}`).catch(() => null))
              );

              const freshMap = new Map();
              freshTemplates.forEach(t => {
                if (t && t._id) freshMap.set(String(t._id), t);
              });

              // 3. Merge fresh meta config into dashboard objectives
              normalized.objetivos = normalized.objetivos.map(obj => {
                const fresh = freshMap.get(String(obj._id));
                if (!fresh) return obj;

                // We want to keep the assigned hitos/results, but UPDATE the definition (Metas config)
                // BUT we must be careful to match metas by ID or Name.
                if (!fresh.metas || fresh.metas.length === 0) return obj;

                // FIX: If obj.metas is missing (flatter structure or old snapshot), 
                // fill it with fresh metas defaults so we don't fall back to Legacy Calculation
                let baseMetasDefinitions = obj.metas || [];
                if (baseMetasDefinitions.length === 0 && fresh.metas.length > 0) {
                  baseMetasDefinitions = fresh.metas.map(m => ({
                    ...m,
                    metaId: m.metaId || m._id
                  }));
                }

                if (baseMetasDefinitions.length === 0) return obj;

                const mergedMetas = baseMetasDefinitions.map(currentMeta => {
                  // Find corresponding fresh meta definition
                  let freshMeta = fresh.metas.find(fm =>
                    String(fm.metaId || fm._id) === String(currentMeta.metaId || currentMeta._id) ||
                    fm.nombre === currentMeta.nombre // Fallback Name
                  );

                  // Fallback: If 1-to-1 mapping exists (1 meta in obj, 1 meta in fresh)
                  if (!freshMeta && baseMetasDefinitions.length === 1 && fresh.metas.length === 1) {
                    freshMeta = fresh.metas[0];
                  }

                  if (freshMeta) {
                    return {
                      ...currentMeta,
                      // Override CONFIG fields only
                      reconoceEsfuerzo: freshMeta.reconoceEsfuerzo,
                      permiteOver: freshMeta.permiteOver,
                      // toleranca: freshMeta.tolerancia, // Optional
                      reglaCierre: freshMeta.reglaCierre,
                      unidad: freshMeta.unidad,
                      operador: freshMeta.operador,
                      umbralPeriodos: freshMeta.umbralPeriodos,
                      target: freshMeta.esperado ?? freshMeta.target // Ensure target is synced too? dangerous if custom
                    };
                  }
                  return currentMeta;
                });

                // Recalculate Objective Progress using the strict rules
                // We use calculateObjectiveProgress from existing imports
                const strictProgress = calculateObjectiveProgress({ ...obj, metas: mergedMetas }, obj.hitos);

                return {
                  ...obj,
                  metas: mergedMetas,
                  progreso: strictProgress // Override raw progress
                };
              });

            } catch (err) {
              console.warn("Hydration failed, using snapshots", err);
            }
          }

          setDashEmpleadoData(normalized);
        }
      } catch (e) {
        console.error("dashEmpleado error:", e);
      } finally {
        setLoadingDash(false);
      }
    })();
  }, [selectedEmpleadoId, anio]);

  // Cargar Feedbacks
  useEffect(() => {
    (async () => {
      if (!selectedEmpleadoId || activeTab !== "feedback") return;
      try {
        setLoadingFeedbacks(true);
        const res = await api(`/feedbacks/empleado/${selectedEmpleadoId}?year=${anio}`);
        setFeedbacks(res || []);
      } catch (e) {
        console.error("Error loading feedbacks", e);
      } finally {
        setLoadingFeedbacks(false);
      }
    })();
  }, [selectedEmpleadoId, anio, activeTab]);

  // Helper para cargar evaluación de un item específico
  const loadItemEvaluacion = async (item, p) => {
    if (!selectedEmpleadoId || !item || !p) return;
    try {
      setSavingItems(prev => ({ ...prev, [item._id]: true })); // Show loading state

      // 1. Traer plantilla full para asegurar metas y CONFIGURACIÓN (reconoceEsfuerzo, etc)
      let plantillaFull = item;
      const metaSample = item.metas?.[0];
      const seemsIncomplete = metaSample && metaSample.reconoceEsfuerzo === undefined;

      if (!item.metas || item.metas.length === 0 || seemsIncomplete) {
        try {
          plantillaFull = await api(`/templates/${item._id}`);
          if (!plantillaFull) plantillaFull = item; // Fallback
        } catch (e) { console.error("Error loading template full", e); }
      }

      // 2. Traer evaluación existente
      const resp = await api(`/evaluaciones?empleado=${selectedEmpleadoId}&plantillaId=${item._id}&periodo=${p}`);
      const arr = Array.isArray(resp) ? resp : resp?.items || [];
      const ev = arr[0] || null;

      // 3. Construir localHito
      let localHito;
      let comentarioManager = "";

      if (ev) {
        // Hydrate
        const baseMetas = plantillaFull.metas || [];
        const resultados = ev.metasResultados || [];

        // Merge metas
        // Merge metas: ONLY keep metas that exist in the template (baseMetas)
        const map = new Map();
        // 1. Index results by key for fast lookup
        const resultsMap = new Map();
        resultados.forEach(r => resultsMap.set(metaKey(r), r));

        // 2. Iterate over TEMPLATE metas and merge with result if exists
        baseMetas.forEach(m => {
          const key = metaKey(m);
          const result = resultsMap.get(key) || {};
          // Merge: Template takes precedence for definition, Result takes precedence for values
          map.set(key, {
            ...m,
            ...result,
            // Ensure critical definition fields come from Template if missing in result (or to override)
            _id: m._id, // Keep template ID structure if possible, or result ID? Usually template ID is source of truth.
            metaId: m.metaId || m._id,
            nombre: m.nombre,
            unidad: m.unidad,
            esperado: m.esperado ?? m.target ?? m.meta, // Template value
            // Result values
            resultado: result.resultado ?? null,
            cumple: result.cumple ?? false,
            modoAcumulacion: m.modoAcumulacion ?? (m.acumulativa ? "acumulativo" : "periodo"),
            umbralPeriodos: m.umbralPeriodos || 0,
            reglaCierre: m.reglaCierre || "promedio",
            reconoceEsfuerzo: m.reconoceEsfuerzo ?? false,
            permiteOver: m.permiteOver ?? false
          });
        });

        const metas = deepCloneMetas(Array.from(map.values()));

        // Calculate actual using ACCUMULATED values if applicable
        let calculatedActual = null;
        if (metas.length > 0) {
          const metasForCalc = metas.map(m => {
            if (m.modoAcumulacion === "acumulativo") {
              return { ...m, resultado: getAccumulatedValue(item, m.metaId || m._id, p, m.resultado) };
            }
            return m;
          });
          calculatedActual = calcularResultadoGlobal(metasForCalc);
        }

        localHito = {
          periodo: p,
          fecha: ev.fecha,
          estado: ev.estado,
          metas,
          actual: ev.actual ?? calculatedActual,
          comentario: ev.comentario ?? "",
          escala: ev.escala ?? null
        };
        comentarioManager = ev.comentarioManager ?? "";
      } else {
        // Blank
        localHito = {
          periodo: p,
          fecha: null,
          estado: "MANAGER_DRAFT",
          metas: deepCloneMetas(plantillaFull.metas || []).map(m => ({ ...m, resultado: null, cumple: false })),
          actual: null,
          comentario: "",
          escala: null
        };
      }

      setEvaluacionData(prev => ({
        ...prev,
        [item._id]: { localHito, comentarioManager }
      }));

    } catch (e) {
      console.error("Error loading item evaluation", e);
      toast.error("Error al cargar datos del objetivo");
    } finally {
      setSavingItems(prev => ({ ...prev, [item._id]: false })); // Clear loading
    }
  };

  const toggleExpand = (item) => {
    const isExpanded = !!expandedItems[item._id];
    setExpandedItems(prev => ({ ...prev, [item._id]: !isExpanded }));

    if (!isExpanded && !evaluacionData[item._id]) {
      // 🔹 Fix: Ensure the Global Period exists in this Objective's Hitos (Timeline)
      // If not (e.g. Global is Q1 but Obj is Semestral S1), fall back to first hito.
      const hasGlobal = item.hitos?.some(h => h.periodo === periodoGlobal);
      const p = hasGlobal ? periodoGlobal : item.hitos?.[0]?.periodo;

      if (p) loadItemEvaluacion(item, p);
    }
  };

  const handleUpdateLocalHito = (itemId, updater) => {
    setEvaluacionData(prev => {
      const current = prev[itemId];
      if (!current) return prev;
      const newLocalHito = typeof updater === 'function' ? updater(current.localHito) : updater;

      // Recalcular actual si es objetivo
      let newActual = newLocalHito.actual;
      if (newLocalHito.metas && newLocalHito.metas.length > 0) {
        // Find full item object to calculate accumulated values
        const itemObj = dashEmpleadoData?.objetivos?.find(o => o._id === itemId);

        let metasForCalc = newLocalHito.metas;
        if (itemObj) {
          metasForCalc = newLocalHito.metas.map(m => {
            if (m.modoAcumulacion === "acumulativo") {
              const accVal = getAccumulatedValue(itemObj, m.metaId || m._id, newLocalHito.periodo, m.resultado);
              return {
                ...m,
                resultado: accVal
              };
            }
            return m;
          });
        }
        newActual = calcularResultadoGlobal(metasForCalc);
      }

      return {
        ...prev,
        [itemId]: {
          ...current,
          localHito: { ...newLocalHito, actual: newActual }
        }
      };
    });
  };

  const handleSaveItem = async (item, action = "draft") => {
    const data = evaluacionData[item._id];
    if (!data || !data.localHito) return;

    const { localHito, comentarioManager } = data;
    const periodoEval = localHito.periodo;
    const isApt = item._tipo === "aptitud" || item.tipo === "aptitud";

    if (isApt) {
      const escala = Number(localHito.escala);
      if (!escala || escala < 1 || escala > 5) {
        toast.error("Seleccioná una escala (1-5)");
        return;
      }
    }

    // [SECURITY] Prevent saving future periods if not in Testing Mode
    // [SECURITY] Prevent saving future periods if not in Testing Mode
    const hitoDate = localHito.fecha || (item.hitos?.find(h => h.periodo === periodoEval)?.fecha);
    if (!isTestingMode && hitoDate) {
      const now = new Date();
      const target = new Date(hitoDate);
      if (now < target) {
        toast.error("No se puede editar un periodo futuro (Activa Modo Admin)");
        return;
      }
    }

    try {
      setSavingItems(prev => ({ ...prev, [item._id]: true }));

      const actualToSend = isApt ? (Number(localHito.escala) * 20) : (Number(localHito.actual) || 0);

      const body = {
        empleado: selectedEmpleadoId,
        plantillaId: item._id,
        year: anio, // Use context year (cycle) instead of period calendar year to ensure visibility in dashboard
        periodo: periodoEval,
        actual: actualToSend,
        comentario: localHito.comentario,
        comentarioManager: comentarioManager,
        ...(isApt ? { escala: Number(localHito.escala), metasResultados: [] } : { metasResultados: dedupeMetas(localHito.metas) }),
        estado: "MANAGER_DRAFT"
      };



      await api("/evaluaciones", { method: "POST", body });
      await api(`/evaluaciones/${selectedEmpleadoId}/${item._id}/${periodoEval}`, { method: "PUT", body });

      if (action === "toEmployee") {
        const evals = await api(`/evaluaciones?plantillaId=${item._id}&periodo=${periodoEval}&empleado=${selectedEmpleadoId}`);
        const target = Array.isArray(evals) ? evals[0] : evals?.items?.[0];
        if (target) {
          await api(`/evaluaciones/${target._id}/submit-to-employee`, { method: "POST" });
          toast.success("Enviado al colaborador");
        }
      } else {
        toast.success("Borrador guardado");
      }

      const res = await dashEmpleado(selectedEmpleadoId, anio);
      if (res) {
        setDashEmpleadoData(res);

        // --- FIX FRONTEND TIMELINE REFRESH ---
        // Find the updated item in the newly fetched dashboard data.
        const updatedItemObj = res.objetivos?.find(o => o._id === item._id)
          || res.aptitudes?.find(a => a._id === item._id);

        if (updatedItemObj) {
          setSelectedItem({ type: isApt ? 'competencia' : 'objetivo', id: item._id, data: updatedItemObj });
        }
      }

    } catch (e) {
      console.error(e);
      toast.error("Error al guardar");
    } finally {
      setSavingItems(prev => ({ ...prev, [item._id]: false }));
    }
  };

  const handleRecalculate = async (item) => {
    if (!confirm("¿Recalcular todas las evaluaciones de este objetivo con las reglas actuales?")) return;
    try {
      setSavingItems(prev => ({ ...prev, [item._id]: true }));
      await api("/evaluaciones/recalculate", {
        method: "POST",
        body: {
          plantillaId: item._id,
          year: anio,
          empleadoId: selectedEmpleadoId
        }
      });
      toast.success("Reglas actualizadas y evaluaciones recalculadas");

      // Reload dashboard
      const res = await dashEmpleado(selectedEmpleadoId, anio);
      if (res) setDashEmpleadoData(res);

      // Reload current item if open
      if (evaluacionData[item._id]?.localHito) {
        loadItemEvaluacion(item, evaluacionData[item._id].localHito.periodo);
      }

    } catch (e) {
      console.error(e);
      toast.error("Error al recalcular");
    } finally {
      setSavingItems(prev => ({ ...prev, [item._id]: false }));
    }
  };

  const handleSaveFeedback = async (periodo, comentario, estado) => {
    // [SECURITY] Check if future
    if (!isTestingMode) {
      const timeline = [
        { id: "Q1", date: `${anio}-12-01` },      // Start of Q1 (Dec of selected year)
        { id: "Q2", date: `${anio + 1}-03-01` },  // Start of Q2 (Mar next year)
        { id: "Q3", date: `${anio + 1}-06-01` },  // Start of Q3 (Jun next year)
        { id: "FINAL", date: `${anio + 1}-09-01` } // Start of Final (Sep next year)
      ];
      const item = timeline.find(t => t.id === periodo);
      if (item) {
        const startDate = new Date(item.date);

        // Allow editing if we are within the "En Curso" window (3 months before check-in)
        const periodStart = new Date(startDate);
        periodStart.setMonth(periodStart.getMonth() - 3);

        const now = new Date();
        if (now < periodStart) {
          toast.error("No se puede editar un feedback futuro (Activa Modo Admin)");
          return;
        }
      }
    }

    try {
      const saved = await api("/feedbacks", {
        method: "POST",
        body: {
          empleado: selectedEmpleadoId,
          year: anio,
          periodo,
          comentario,
          estado,
          // Snapshot of scores at the moment of saving
          scores: resumenEmpleado ? {
            obj: resumenEmpleado.objetivos.score,
            comp: resumenEmpleado.aptitudes.score,
            global: resumenEmpleado.global
          } : null
        }
      });
      toast.success(`Feedback ${periodo} guardado`);
      // Recargar
      const res = await api(`/feedbacks/empleado/${selectedEmpleadoId}?year=${anio}`);
      setFeedbacks(res || []);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Error al guardar feedback");
    }
  };

  const handleFeedbackChange = (periodo, val) => {
    setFeedbacks(prev => {
      const idx = prev.findIndex(f => f.periodo === periodo);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], comentario: val };
        return copy;
      } else {
        return [...prev, { periodo, comentario: val, estado: "DRAFT" }];
      }
    });
  };

  const calculatePeriodScore = (periodoStr) => {
    if (!dashEmpleadoData) return 0;
    if (periodoStr === "FINAL") return buildResumenEmpleado(dashEmpleadoData)?.global || 0;
    return 0;
  };

  const resumenEmpleado = useMemo(() => buildResumenEmpleado(dashEmpleadoData), [dashEmpleadoData]);
  const empleadoNombreCompleto = empleadoInfo ? `${empleadoInfo.apellido} ${empleadoInfo.nombre}` : "Colaborador";

  // DEBUG FINAL REPORT
  console.log("FINAL REPORT DEBUG:", {
    evals: dashEmpleadoData?.evaluaciones?.map(e => e.periodo),
    feedbacks: dashEmpleadoData?.feedbacks?.map(f => f.periodo),
    hasStart: dashEmpleadoData?.evaluaciones?.some(e => e.periodo === "FINAL"),
    hasFeed: dashEmpleadoData?.feedbacks?.some(f => f.periodo === "FINAL")
  });

  return (

    <div className={`min-h-screen pb-20 transition-colors duration-500 ${empleadoInfo ? (isTestingMode ? 'bg-indigo-50/50' : 'bg-slate-50') : 'bg-slate-50'}`}>
      {/* HEADER */}
      <div className={`sticky top-0 z-30 backdrop-blur-md border-b transition-all duration-300 ${isTestingMode
        ? "bg-gradient-to-r from-indigo-50/95 via-white/95 to-indigo-50/95 border-indigo-200"
        : "bg-gradient-to-r from-slate-50/95 via-white/95 to-blue-50/95 border-slate-200"
        }`}>
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-start gap-4">
              <Button variant="ghost" size="sm" onClick={() => state?.from === "seguimiento" ? navigate("/seguimiento") : navigate(-1)} className={isTestingMode ? "text-indigo-600 hover:text-indigo-800 hover:bg-indigo-200/50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}>
                {state?.from === "seguimiento" ? "← Volver al Gantt" : "← Volver"}
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                  {empleadoNombreCompleto}
                  <Badge variant="outline" className="text-slate-500 border-slate-300 font-normal">
                    {anio}
                  </Badge>
                </h1>

                <p className={isTestingMode ? "text-xs text-indigo-500 font-medium" : "text-xs text-slate-500"}>{isTestingMode ? "Modo Admin Activo" : "Sala de Evaluación"}</p>
              </div>

              {/* (Button Removed from Left Side) */}
            </div>

            {/* TABS NAVIGATION */}
            <div className="flex-1 flex justify-center">
              <div className={`flex p-1 rounded-lg border ${isTestingMode
                ? "bg-indigo-50 border-indigo-200"
                : "bg-slate-100 border-slate-200"
                }`}>
                <button
                  onClick={() => setActiveTab("evaluacion")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "evaluacion"
                    ? "bg-blue-600 text-white shadow-sm"
                    : isTestingMode ? "text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100" : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                    }`}
                >
                  <BarChart3 className="w-4 h-4 inline-block mr-2" />
                  Evaluación de Objetivos
                </button>
                <button
                  onClick={() => setActiveTab("feedback")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "feedback"
                    ? "bg-blue-600 text-white shadow-sm"
                    : isTestingMode ? "text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100" : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                    }`}
                >
                  <MessageSquare className="w-4 h-4 inline-block mr-2" />
                  Feedback Trimestral
                </button>
              </div>
            </div>

            {/* FINAL REPORT BUTTON (RIGHT SIDE placement) */}
            {(dashEmpleadoData?.evaluaciones?.some(e => e.periodo === "FINAL") || dashEmpleadoData?.feedbacks?.some(f => f.periodo === "FINAL")) && (
              <div className="hidden lg:block mr-4">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md border-0"
                  onClick={() => setShowFinalReport(true)}
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Reporte Final
                </Button>
              </div>
            )}

            {/* GLOBAL & OPTIONS */}
            <div className="flex items-center gap-4">


              {/* HELP GUIDE */}
              <ReferenceRulesDialog />

              {/* TESTING MODE TOGGLE (Only Directors) */}
              {esDirector && (
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-2 cursor-pointer border px-3 py-1.5 rounded-lg transition-colors ${isTestingMode
                    ? "bg-white border-indigo-200 shadow-sm"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                    <input
                      type="checkbox"
                      className="accent-indigo-500 w-4 h-4"
                      checked={isTestingMode}
                      onChange={(e) => setIsTestingMode(e.target.checked)}
                    />
                    <span className={`text-xs font-bold uppercase tracking-wider ${isTestingMode ? 'text-indigo-600' : 'text-slate-600'}`}>
                      Modo Admin
                    </span>
                  </label>
                  {isTestingMode && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-indigo-600 h-8"
                      onClick={() => setShowDebugDialog(true)}
                    >
                      Ver Cálculo
                    </Button>
                  )}
                </div>
              )}

              <div className={`flex items-stretch rounded-xl border shadow-sm overflow-hidden divide-x divide-slate-100 ${isTestingMode
                ? "border-indigo-200"
                : "border-slate-200"
                }`}>
                {/* Objectives (Pale Blue) */}
                <div className={`flex flex-col justify-center px-6 py-2 ${isTestingMode ? "bg-indigo-50/50" : "bg-blue-50/50"}`}>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 text-right">Obj.</div>
                  <div className={`text-sm font-bold leading-none text-right ${isTestingMode ? "text-indigo-700" : "text-blue-700"}`}>
                    {resumenEmpleado?.objetivos?.score !== undefined ? Math.round(resumenEmpleado.objetivos.score) : "-"}%
                  </div>
                </div>

                {/* Competencies (Pale Slate/Purple) */}
                <div className="flex flex-col justify-center px-6 py-2 bg-slate-50/80">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 text-right">Comp.</div>
                  <div className="text-sm font-bold text-slate-700 leading-none text-right">
                    {resumenEmpleado?.aptitudes?.score !== undefined ? Math.round(resumenEmpleado.aptitudes.score) : "-"}%
                  </div>
                </div>

                {/* Global (Pale Emerald - Distinct but Light) */}
                <div className={`flex flex-col justify-center px-8 py-2 relative overflow-hidden group ${isTestingMode ? "bg-indigo-100/30" : "bg-emerald-50/50"}`}>
                  {/* Subtle top decoration line */}
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${isTestingMode ? "bg-indigo-300" : "bg-emerald-300"}`}></div>

                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 text-right ${isTestingMode ? "text-indigo-500" : "text-emerald-600"}`}>Global</div>
                  <div className={`text-2xl font-black leading-none tracking-tight text-right ${isTestingMode ? "text-indigo-700" : "text-emerald-700"}`}>
                    {resumenEmpleado?.global !== undefined ? Math.round(resumenEmpleado.global) : "-"}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-[1600px] mx-auto px-6 py-8 min-h-screen">

          {/* TAB: EVALUACION */}
          {activeTab === "evaluacion" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300 items-start">

              {/* === LEFT SIDEBAR: Navigation === */}
              <div className="lg:col-span-4 flex flex-col gap-4 sticky top-24">

                {/* 1. OBJECTIVES LIST */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-3.5 h-3.5" /> Objetivos
                    </h3>
                    <Badge variant="secondary" className="bg-white border-slate-200 text-slate-500 text-[9px]">{dashEmpleadoData?.objetivos?.length || 0}</Badge>
                  </div>

                  <div className="divide-y divide-slate-50">
                    {dashEmpleadoData?.objetivos?.map((obj) => {
                      const isSelected = selectedItem?.id === obj._id;
                      const bucketCfg = bucketConfig(obj.bucket || "futuro");

                      return (
                        <div
                          key={obj._id}
                          onClick={() => setSelectedItem({ type: 'objetivo', id: obj._id, data: obj })}
                          className={`p-3 cursor-pointer transition-all border-l-4 group relative overflow-hidden
                             ${isSelected ? 'bg-blue-50/40 border-l-blue-500' : 'bg-white border-l-transparent hover:bg-slate-50 hover:border-l-slate-200'}
                           `}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-bold leading-tight line-clamp-2 ${isSelected ? 'text-blue-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                {obj.nombre}
                              </div>
                            </div>
                            {bucketCfg.label !== "En curso" && (
                              <Badge variant="outline" className={`shrink-0 text-[8px] px-1.5 h-4 ${bucketCfg.badgeClass} border-0`}>
                                {bucketCfg.chip}
                              </Badge>
                            )}
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/50 -mx-3 -mb-3 border-t border-slate-50 mt-2">
                            <div className="flex flex-col items-center justify-center py-2">
                              <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Peso</span>
                              <span className="text-xs font-bold text-slate-600">{obj.peso}%</span>
                            </div>
                            <div className="flex flex-col items-center justify-center py-2 bg-blue-50/30">
                              <span className="text-[8px] text-blue-400 uppercase font-black tracking-widest">Pond.</span>
                              <span className="text-xs font-bold text-blue-700">{((obj.peso * obj.progreso) / 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex flex-col items-center justify-center py-2 px-1">
                              <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Logro</span>
                              <div className="flex flex-col items-center">
                                <span className={`text-xs font-black ${obj.progreso >= 100 ? 'text-emerald-600' : 'text-slate-700'} mb-0.5`}>{Math.round(obj.progreso)}%</span>
                                {/* Centered Pill Progress Bar */}
                                <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${obj.progreso >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, obj.progreso)}%` }}></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(!dashEmpleadoData?.objetivos || dashEmpleadoData.objetivos.length === 0) && (
                      <div className="p-4 text-center text-xs text-slate-400 italic">No hay objetivos asignados.</div>
                    )}
                  </div>
                </div>

                {/* 2. COMPETENCIES LIST */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Lightbulb className="w-3.5 h-3.5" /> Competencias
                    </h3>
                    <Badge variant="secondary" className="bg-white border-slate-200 text-slate-500 text-[9px]">{dashEmpleadoData?.aptitudes?.length || 0}</Badge>
                  </div>

                  <div className="divide-y divide-slate-50">
                    {dashEmpleadoData?.aptitudes?.map((apt) => {
                      const isSelected = selectedItem?.id === apt._id;

                      return (
                        <div
                          key={apt._id}
                          onClick={() => setSelectedItem({ type: 'competencia', id: apt._id, data: apt })}
                          className={`p-3 cursor-pointer transition-all border-l-4 group relative overflow-hidden
                             ${isSelected ? 'bg-orange-50/50 border-l-orange-300' : 'bg-white border-l-transparent hover:bg-slate-50 hover:border-l-slate-200'}
                           `}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-bold leading-tight ${isSelected ? 'text-orange-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                {apt.nombre}
                              </div>
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/30 -mx-3 -mb-3 border-t border-slate-50 mt-2">
                            <div className="flex flex-col items-center justify-center py-2">
                              <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Peso</span>
                              <span className="text-xs font-bold text-slate-600">{apt.peso || 0}%</span>
                            </div>
                            <div className="flex flex-col items-center justify-center py-2 bg-orange-50/20">
                              <span className="text-[8px] text-orange-300 uppercase font-black tracking-widest">Pond.</span>
                              <span className="text-xs font-bold text-orange-500">{((apt.peso || 0) * apt.puntuacion / 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex flex-col items-center justify-center py-2 px-1">
                              <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Logro</span>
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-orange-500 mb-0.5">{Math.round(apt.puntuacion)}%</span>
                                {/* Centered Pill Progress Bar */}
                                <div className="w-14 h-1.5 bg-orange-50 rounded-full overflow-hidden border border-orange-100">
                                  <div className="h-full rounded-full bg-orange-300" style={{ width: `${Math.min(100, apt.puntuacion)}%` }}></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(!dashEmpleadoData?.aptitudes || dashEmpleadoData.aptitudes.length === 0) && (
                      <div className="p-4 text-center text-xs text-slate-400 italic">No hay competencias asignadas.</div>
                    )}
                  </div>
                </div>

              </div>

              {/* === RIGHT MAIN CONTENT: Detail View === */}
              <div className="lg:col-span-8">
                {selectedItem ? (
                  <Card className="border-0 shadow-md ring-1 ring-slate-100 bg-white overflow-hidden min-h-[600px]">
                    {/* -- Header -- */}
                    <div className="px-6 py-5 border-b border-slate-100 bg-white sticky top-0 z-10">
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2 rounded-lg ${selectedItem.type === 'objetivo' ? 'bg-blue-50/50 text-blue-600' : 'bg-indigo-50/50 text-indigo-600'}`}>
                          {selectedItem.type === 'objetivo' ? <Target className="w-6 h-6" /> : <Lightbulb className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[9px] uppercase tracking-wide px-2 py-0">
                              {selectedItem.type === 'objetivo' ? 'Objetivo Estratégico' : 'Competencia'}
                            </Badge>
                            {selectedItem.data.frecuencia && (
                              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[9px] uppercase tracking-wide px-2 py-0">
                                {selectedItem.data.frecuencia}
                              </Badge>
                            )}
                          </div>
                          <h2 className="text-lg font-bold text-slate-800 leading-snug mb-2">{selectedItem.data.nombre}</h2>
                          <p className="text-sm text-slate-600 leading-relaxed w-full">
                            {selectedItem.data.descripcion || "Sin descripción definida."}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* -- Content Body -- */}
                    <CardContent className="p-0 bg-slate-50/30">
                      {(() => {
                        const item = selectedItem.data;
                        const data = evaluacionData[item._id];
                        const localHito = data?.localHito;
                        const isObj = selectedItem.type === 'objetivo';

                        // TIMELINE
                        if (item.hitos && item.hitos.length > 0) {
                          return (
                            <>
                              <div className="bg-slate-50 border-b border-slate-200 px-6 py-6 flex flex-col items-center">
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-4 w-full text-center">Cronograma de Evaluación</div>
                                <div className="flex items-center justify-center gap-3 w-full overflow-x-auto py-4 relative z-0 hide-scrollbar">
                                  {/* Connector Line (Manual CSS for simplicity) */}
                                  <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-200 -z-10 hidden sm:block min-w-[600px]"></div>

                                  {item.hitos.map((h) => {
                                    const status = getSmartHitoStatus(h);
                                    const colorClass = getHitoColorClass(status);
                                    const isSelected = localHito?.periodo === h.periodo;
                                    const isSelectable = status === "vencido" || status === "por_vencer" || status === "evaluado";
                                    const isLoading = savingItems[item._id] && !localHito;

                                    // Calculate what to display in the period chip
                                    let hitoDisplay = h.actual;

                                    if (isObj && h.actual !== null) {
                                      const isUmbral = item.metas?.some(m => m.reglaCierre === 'umbral_periodos');

                                      if (isUmbral) {
                                        // For umbral: recalculate progress with binary-per-period logic
                                        // using only hitos up to and including this hito's period
                                        const hitoOrder = (hPeriodo) => {
                                          if (!hPeriodo) return 0;
                                          const monthMap = { 'M09': 1, 'M10': 2, 'M11': 3, 'M12': 4, 'M01': 5, 'M02': 6, 'M03': 7, 'M04': 8, 'M05': 9, 'M06': 10, 'M07': 11, 'M08': 12 };
                                          const suffix = hPeriodo.replace(/^\d{4}/, '');
                                          return monthMap[suffix] || 0;
                                        };
                                        const maxOrder = hitoOrder(h.periodo);
                                        const hitosUpTo = item.hitos?.filter(hh => hh.periodo && hitoOrder(hh.periodo) <= maxOrder) || [];
                                        hitoDisplay = hitosUpTo.length > 0
                                          ? calculateObjectiveProgress(item, hitosUpTo)
                                          : null;
                                      } else {
                                        // Non-umbral: existing acum logic
                                        const acumMeta = item.metas?.find(m => m.modoAcumulacion === "acumulativo" || m.acumulativa);
                                        if (acumMeta) {
                                          const metaId = acumMeta.metaId || acumMeta._id;
                                          const hitoResult = h.metas?.find(m => String(m.metaId || m._id) === String(metaId))?.resultado;
                                          const acumVal = getAccumulatedValue(item, metaId, h.periodo, hitoResult);
                                          const target = Number(acumMeta.esperado || 0);
                                          if (target > 0) {
                                            hitoDisplay = Math.round((acumVal / target) * 100);
                                          }
                                        } else {
                                          // Use live recalculation to retroactively fix older periods evaluated during the < bug
                                          hitoDisplay = calculateObjectiveProgress(item, [h]);
                                        }
                                      }
                                    }

                                    return (
                                      <div
                                        key={h.periodo}
                                        onClick={() => (isSelectable || (isTestingMode && puedeVer)) && !savingItems[item._id] && loadItemEvaluacion(item, h.periodo)}
                                        className={`flex flex-col items-center justify-center h-14 w-16 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none bg-white
                                                    ${colorClass} 
                                                    ${isSelected ? 'ring-4 ring-blue-100 border-blue-500 shadow-md scale-110 z-10' : 'opacity-80 hover:opacity-100 hover:scale-105 hover:shadow-sm'} 
                                                    ${(isSelectable || (isTestingMode && puedeVer)) ? '' : 'cursor-not-allowed opacity-40 grayscale'}
                                                    ${isLoading && isSelected ? 'animate-pulse' : ''}`}
                                      >
                                        <span className="text-[9px] font-black uppercase leading-none mb-1 text-slate-600">{h.periodo}</span>
                                        <span className={`text-sm font-black leading-none ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                                          {hitoDisplay !== null && hitoDisplay !== undefined
                                            ? (isObj ? `${typeof hitoDisplay === 'number' ? Number(hitoDisplay).toFixed(1) : hitoDisplay}%` : hitoDisplay)
                                            : "-"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Legend */}
                                <div className="flex items-center gap-3 mt-6 justify-center w-full">
                                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300"></div><span className="text-[10px] text-slate-500 font-bold">Evaluado</span></div>
                                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300"></div><span className="text-[10px] text-slate-500 font-bold">Por Vencer</span></div>
                                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-300"></div><span className="text-[10px] text-slate-500 font-bold">Vencido</span></div>
                                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200"></div><span className="text-[10px] text-slate-400 font-medium">Futuro</span></div>
                                </div>
                              </div>

                              {/* RESULT VIEW */}
                              {localHito ? (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                                  {isObj ? (
                                    /* --- OBJECTIVE EVALUATION --- */
                                    <>
                                      <div className="p-8">
                                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                          <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                              <Target className="w-4 h-4 text-blue-500" /> Resultados del Periodo: {localHito.periodo}
                                            </h3>
                                          </div>

                                          <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wider border-b border-slate-100">
                                              <tr>
                                                <th className="px-6 py-3 w-[40%]">Variable / Meta</th>
                                                <th className="px-6 py-3 w-[20%]">Config</th>
                                                <th className="px-6 py-3 text-right w-[15%]">Objetivo</th>
                                                <th className="px-6 py-3 text-right w-[25%]">Resultado</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                              {localHito.metas.map((meta, idx) => {
                                                const isAcumulativo = meta.modoAcumulacion === "acumulativo";
                                                const valorEvaluado = isAcumulativo
                                                  ? getAccumulatedValue(item, meta.metaId || meta._id, localHito.periodo, meta.resultado)
                                                  : meta.resultado;
                                                const cumple = evaluarCumple(valorEvaluado, meta.esperado, meta.operador, meta.unidad);

                                                // Resolve Umbral (Threshold) value looking at overrides
                                                const metaDef = item.metas?.[idx];
                                                let effectiveUmbral = meta.umbralPeriodos;
                                                if (!effectiveUmbral && meta.config?.umbral) effectiveUmbral = meta.config.umbral;
                                                if (!effectiveUmbral && metaDef?.umbralPeriodos) effectiveUmbral = metaDef.umbralPeriodos;
                                                if (!effectiveUmbral && metaDef?.config?.umbral) effectiveUmbral = metaDef.config.umbral;
                                                if (!effectiveUmbral && item.umbralPeriodos) effectiveUmbral = item.umbralPeriodos;
                                                if (!effectiveUmbral && item.config?.umbral) effectiveUmbral = item.config.umbral;

                                                return (
                                                  <React.Fragment key={idx}>
                                                    <tr className="group hover:bg-slate-50/80 transition-colors">
                                                      <td className="px-6 py-4 align-top">
                                                        <div className="font-bold text-slate-700 text-sm leading-tight">{meta.nombre}</div>
                                                        <div className="text-[11px] text-slate-400 font-medium mt-1">{meta.unidad}</div>
                                                      </td>
                                                      <td className="px-6 py-4 align-top">
                                                        <div className="flex flex-wrap gap-1.5">
                                                          {meta.reglaCierre === "promedio" && (
                                                            <div title="Promedio: El resultado anual será el promedio de todos los periodos evaluados." className="cursor-help flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                                              Avg
                                                            </div>
                                                          )}
                                                          {meta.reglaCierre === "cierre_unico" && (
                                                            <div title="Cierre Único: El resultado anual será el valor del último periodo." className="cursor-help flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                                              Final
                                                            </div>
                                                          )}
                                                          {meta.reglaCierre === "umbral_periodos" && (
                                                            <div title={`Umbral: Requiere cumplir la meta en al menos ${effectiveUmbral} periodos para aprobar el año.`} className="cursor-help flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                                              Umbral: {effectiveUmbral ?? '?'}
                                                            </div>
                                                          )}
                                                          {isAcumulativo && (
                                                            <div title="Acumulativo: El valor real se suma al del periodo anterior." className="cursor-help flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-100">
                                                              Acum
                                                            </div>
                                                          )}
                                                          {meta.reconoceEsfuerzo && (
                                                            <div title="Esfuerzo: Si no se alcanza la meta, se otorga un puntaje parcial proporcional al logro." className="cursor-help flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                                                              Esfuerzo
                                                            </div>
                                                          )}
                                                        </div>
                                                      </td>
                                                      <td className="px-6 py-4 align-top text-right">
                                                        <div className="inline-block px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold text-slate-600">
                                                          {meta.operador} {Number(meta.esperado).toLocaleString()}
                                                        </div>
                                                      </td>
                                                      <td className="px-6 py-4 align-middle text-right bg-slate-50/30">
                                                        <div className="flex items-center justify-end gap-3">
                                                          {meta.unidad === "Cumple/No Cumple" ? (
                                                            <label className={`flex items-center justify-end gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all border ${meta.resultado ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                                              <span className={`text-[10px] font-bold uppercase ${meta.resultado ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                                {meta.resultado ? "SÍ" : "NO"}
                                                              </span>
                                                              <input
                                                                type="checkbox"
                                                                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300"
                                                                checked={!!meta.resultado}
                                                                onChange={(e) => {
                                                                  const val = e.target.checked;
                                                                  handleUpdateLocalHito(item._id, (prev) => {
                                                                    const metas = [...prev.metas];
                                                                    metas[idx] = { ...metas[idx], resultado: val, cumple: val };
                                                                    return { ...prev, metas };
                                                                  });
                                                                }}
                                                              />
                                                            </label>
                                                          ) : (
                                                            <div className="relative">
                                                              <div className="flex items-center gap-2">
                                                                <Input
                                                                  type="number"
                                                                  className={`h-11 w-full min-w-[120px] text-lg font-bold bg-white text-right pr-3 shadow-sm transition-all
                                                                                ${cumple ? 'border-emerald-300 text-emerald-700 ring-2 ring-emerald-50' : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}
                                                                                ${valorEvaluado !== null && !cumple ? 'border-amber-300 text-amber-700' : ''}
                                                                              `}
                                                                  placeholder="-"
                                                                  disabled={!puedeEditarObjetivo(item, localHito)}
                                                                  value={meta.resultado ?? ""}
                                                                  onChange={(e) => {
                                                                    const val = e.target.value === "" ? null : Number(e.target.value);
                                                                    handleUpdateLocalHito(item._id, (prev) => ({
                                                                      ...prev,
                                                                      metas: prev.metas.map((m, i) => i === idx ? { ...m, resultado: val } : m)
                                                                    }));
                                                                  }}
                                                                />
                                                                {valorEvaluado !== null && (
                                                                  cumple
                                                                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                                                    : <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                                                                )}
                                                              </div>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </td>
                                                    </tr>

                                                    {/* META DETAILS ACCORDION (Native Details/Summary for simplicity inside loop) */}
                                                    <tr className="border-b border-t-0 border-slate-100 bg-white group-hover:bg-slate-50/80 transition-colors">
                                                      <td colSpan={4} className="p-0">
                                                        <details className="w-full group/details">
                                                          <summary className="w-full text-left bg-transparent text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-6 py-2 cursor-pointer hover:text-indigo-500 transition-colors flex items-center gap-2 list-none marker:hidden">
                                                            <span className="group-open/details:hidden">▼ Ver configuración de la meta</span>
                                                            <span className="hidden group-open/details:inline">▲ Ocultar configuración</span>
                                                          </summary>
                                                          <div className="px-6 pb-4 pt-2 -mt-1 bg-white border-t border-slate-50">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 text-xs">
                                                              {/* Dirección */}
                                                              <div>
                                                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dirección</span>
                                                                <span className="font-medium text-slate-700">
                                                                  {meta.operador === "<=" || meta.operador === "<" ? "Minimizar (menor es mejor)" : "Maximizar (mayor es mejor)"}
                                                                </span>
                                                              </div>
                                                              {/* Acumulación */}
                                                              <div>
                                                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Acumulación</span>
                                                                <span className="font-medium text-slate-700">
                                                                  {isAcumulativo ? "Acumulativo (suma período a período)" : "Por período (evaluación independiente)"}
                                                                </span>
                                                              </div>
                                                              {/* Regla de cierre */}
                                                              <div>
                                                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Regla de cierre anual</span>
                                                                <span className="font-medium text-slate-700">
                                                                  {meta.reglaCierre === "umbral_periodos"
                                                                    ? `Umbral: ${effectiveUmbral} hitos cumplidos`
                                                                    : meta.reglaCierre === "cierre_unico"
                                                                      ? "Cierre Único (valor del último periodo)"
                                                                      : "Promedio de los valores"}
                                                                </span>
                                                              </div>
                                                              {/* Esfuerzo */}
                                                              <div>
                                                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Progreso Parcial</span>
                                                                <span className={`font-medium ${meta.reconoceEsfuerzo ? 'text-amber-600' : 'text-slate-500'}`}>
                                                                  {meta.reconoceEsfuerzo ? "Sí (reconoce esfuerzo)" : "No (Todo o Nada)"}
                                                                </span>
                                                              </div>
                                                              {/* Tolerancia */}
                                                              {(metaDef?.tolerancia > 0 || meta.tolerancia > 0) && (
                                                                <div>
                                                                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tolerancia</span>
                                                                  <span className="font-medium text-slate-700">
                                                                    ±{metaDef?.tolerancia || meta.tolerancia} {meta.unidad}
                                                                  </span>
                                                                </div>
                                                              )}
                                                              {/* Sobre-cumplimiento */}
                                                              <div>
                                                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sobre-cumplimiento</span>
                                                                <span className={`font-medium ${meta.permiteOver ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                  {meta.permiteOver ? "Permitido (Puede superar 100%)" : "Tope en 100%"}
                                                                </span>
                                                              </div>
                                                            </div>
                                                          </div>
                                                        </details>
                                                      </td>
                                                    </tr>
                                                  </React.Fragment>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    /* --- COMPETENCY EVALUATION --- */
                                    <div className="p-8">
                                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                                        <div>
                                          <label className="text-xs font-bold text-slate-700 mb-3 block flex justify-between">
                                            <span>Nivel de Competencia Alcanzado</span>
                                            <span className="text-slate-400 font-normal text-[10px]">Selecciona una opción (1-5)</span>
                                          </label>
                                          <div className="grid grid-cols-5 gap-4">
                                            {[1, 2, 3, 4, 5].map((val) => (
                                              <button
                                                key={val}
                                                onClick={() => handleUpdateLocalHito(item._id, (prev) => ({ ...prev, escala: val }))}
                                                className={`h-14 rounded-xl border-2 font-black text-2xl transition-all duration-200 relative overflow-hidden group/btn 
                                    ${localHito.escala === val
                                                    ? "border-indigo-500 bg-indigo-50 text-indigo-600 shadow-md ring-2 ring-indigo-200 ring-offset-2 scale-105"
                                                    : "border-slate-100 bg-white text-slate-300 hover:border-indigo-200 hover:text-indigo-400 hover:shadow-sm"}`}
                                              >
                                                <span className="relative z-10">{val}</span>
                                                {localHito.escala === val && <div className="absolute inset-0 bg-indigo-100/50 animate-pulse"></div>}
                                              </button>
                                            ))}
                                          </div>
                                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1 uppercase tracking-wide">
                                            <span>Nivel Bajo</span>
                                            <span>Nivel Excelente</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* --- COMMON FOOTER (Comments & Actions) --- */}
                                  <div className="bg-slate-50 border-t border-slate-200 p-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                      <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                          Comentarios y Justificación (Interno)
                                        </label>
                                        <textarea
                                          className="w-full h-32 rounded-xl border-slate-200 p-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-y placeholder:text-slate-300 bg-white shadow-sm"
                                          placeholder="Escriba aquí sus observaciones..."
                                          value={localHito.comentario}
                                          onChange={(e) => handleUpdateLocalHito(item._id, (prev) => ({ ...prev, comentario: e.target.value }))}
                                        />
                                        {data.comentarioManager && (
                                          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 mt-2">
                                            <div className="mt-0.5"><MessageSquare className="w-4 h-4 text-blue-400" /></div>
                                            <div>
                                              <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">Feedback Anterior</div>
                                              <p className="text-sm text-blue-800 italic">"{data.comentarioManager}"</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-col justify-start gap-3">
                                        {/* Score Big Display */}
                                        {isObj ? (
                                          <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                                              Score Estimado
                                            </label>
                                            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-end justify-center relative overflow-hidden min-h-[8rem]">
                                              {(() => {
                                                const scoreInfo = getRunningScore(item, localHito);

                                                // --- Info contextual según configuración de la meta ---

                                                // ACUM: mostrar total acumulado vs target
                                                const acumMeta = item.metas?.find(m => m.modoAcumulacion === "acumulativo" || m.acumulativa);
                                                let acumInfo = null;
                                                if (acumMeta && localHito) {
                                                  const metaId = acumMeta.metaId || acumMeta._id;
                                                  const currentResult = localHito.metas?.find(m => String(m.metaId || m._id) === String(metaId))?.resultado;
                                                  const acumVal = getAccumulatedValue(item, metaId, localHito.periodo, currentResult);
                                                  const target = Number(acumMeta.esperado || 0);
                                                  acumInfo = { acumVal: Number(acumVal).toFixed(1), target, unidad: acumMeta.unidad || "" };
                                                }

                                                // UMBRAL: contar cuántos períodos cumplidos de los requeridos
                                                const umbralMeta = item.metas?.find(m => m.reglaCierre === "umbral_periodos");
                                                let umbralInfo = null;
                                                if (umbralMeta && localHito) {
                                                  const metaId = umbralMeta.metaId || umbralMeta._id;
                                                  const required = Number(umbralMeta.umbralPeriodos || item.umbralPeriodos || item.metas?.length || 1);
                                                  const target = Number(umbralMeta.esperado || 0);
                                                  // Contar hitos ya evaluados donde cumple la meta (incluyendo el actual)
                                                  const allHitos = item.hitos || [];
                                                  const currentPeriod = localHito.periodo;
                                                  const periodOrder = allHitos.map(h => h.periodo).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                                                  const currentIdx = periodOrder.indexOf(currentPeriod);
                                                  let cumplidos = 0;
                                                  let evaluados = 0;
                                                  for (const h of allHitos) {
                                                    const hIdx = periodOrder.indexOf(h.periodo);
                                                    if (hIdx > currentIdx) continue;
                                                    // Valor real del período (para el actual, tomar del localHito)
                                                    let val = null;
                                                    if (h.periodo === currentPeriod) {
                                                      val = localHito.metas?.find(m => String(m.metaId || m._id) === String(metaId))?.resultado;
                                                    } else {
                                                      val = h.metas?.find(m => String(m.metaId || m._id) === String(metaId))?.resultado;
                                                    }
                                                    if (val !== null && val !== undefined) {
                                                      evaluados++;
                                                      const op = umbralMeta.operador || ">=";
                                                      const tol = Number(umbralMeta.tolerancia || 0);
                                                      const v = Number(val);
                                                      let passed = false;
                                                      if (op === ">=") passed = v >= (target - tol);
                                                      else if (op === ">") passed = v > (target - tol);
                                                      else if (op === "<=") passed = v <= (target + tol);
                                                      else if (op === "<") passed = v < (target + tol);
                                                      else if (op === "=" || op === "==" || op === "===") passed = Math.abs(v - target) <= tol;
                                                      if (passed) cumplidos++;
                                                    }
                                                  }
                                                  const metReq = cumplidos >= required;
                                                  umbralInfo = { cumplidos, required, evaluados, metReq };
                                                }

                                                return (
                                                  <>
                                                    <div className={`text-4xl font-black tracking-tight ${scoreInfo.isPendingThreshold ? "text-amber-500" : "text-slate-800"}`}>
                                                      {Number(scoreInfo.value).toFixed(1)}
                                                      <span className="text-xl text-slate-300 ml-1">%</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-medium mt-1">{scoreInfo.label}</div>
                                                    {acumInfo && (
                                                      <div className="text-[10px] text-purple-500 font-bold mt-1 flex items-center gap-1">
                                                        <span>Acumulado:</span>
                                                        <span className="font-black">{acumInfo.acumVal}</span>
                                                        <span className="text-purple-300">/</span>
                                                        <span>{acumInfo.target} {acumInfo.unidad}</span>
                                                      </div>
                                                    )}
                                                    {umbralInfo && (
                                                      <div className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${umbralInfo.metReq ? "text-emerald-500" : "text-amber-500"}`}>
                                                        <span className="font-black">{umbralInfo.cumplidos}</span>
                                                        <span className="font-normal">de</span>
                                                        <span className="font-black">{umbralInfo.required}</span>
                                                        <span className="font-normal">períodos cumplidos</span>
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        ) : (
                                          /* Competency Score View */
                                          <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                                              Score Calculado
                                            </label>
                                            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-end justify-center h-32">
                                              <div className="text-4xl font-black text-indigo-600 tracking-tight">
                                                {localHito.escala ? Math.round(localHito.escala * 20) : 0}<span className="text-xl text-indigo-300 ml-1">%</span>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                        <div className="flex items-center justify-end gap-3 pt-2 mt-auto">
                                          {isTestingMode && (
                                            <Button variant="ghost" size="sm" className="text-rose-400 hover:bg-rose-50" onClick={() => handleDeleteEvaluacion(item, localHito.periodo)}>
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          )}

                                          {isObj && (
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-blue-600" onClick={() => handleRecalculate(item)} disabled={savingItems[item._id]}>
                                              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${savingItems[item._id] ? "animate-spin" : ""}`} /> Recalcular
                                            </Button>
                                          )}

                                          <Button className="bg-slate-900 text-white shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all w-32" onClick={() => handleSaveItem(item, "draft")} disabled={savingItems[item._id]}>
                                            {savingItems[item._id] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                            Guardar
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div >
                              ) : (
                                /* --- EMPTY STATE (No Period Selected) --- */
                                <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 bg-slate-50">
                                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <Calendar className="w-8 h-8 text-slate-300" />
                                  </div>
                                  <h3 className="text-sm font-bold text-slate-500">Selecciona un periodo</h3>
                                  <p className="text-xs text-slate-400 mt-1 max-w-xs text-center">Haz clic en el cronograma de arriba para cargar o iniciar una evaluación.</p>
                                </div>
                              )}
                            </>
                          );
                        }
                        return <div className="p-8 text-center text-slate-400">Este ítem no tiene hitos configurados.</div>;
                      })()}
                    </CardContent>
                  </Card>
                ) : (
                  /* --- EMPTY STATE (No Selection) --- */
                  <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <Target className="w-12 h-12 mb-4 opacity-50" />
                    <p className="font-medium text-slate-400">Selecciona un objetivo o competencia para evaluar</p>
                  </div>
                )}
              </div>
            </div >

          )
          }

          {/* TAB: FEEDBACK */}
          {
            activeTab === "feedback" && (
              <div className="animate-in fade-in duration-300 space-y-8">
                {/* TIMELINE */}
                <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20"></div>
                  <h3 className="text-sm font-bold text-slate-700 mb-8 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" /> Cronograma de Feedback {anio}
                  </h3>
                  <div className="relative flex items-center justify-between px-4 md:px-12">
                    {/* Connecting Line */}
                    <div className="absolute left-0 right-0 top-3 h-0.5 bg-slate-200 -z-0 mx-8 md:mx-16"></div>

                    {[
                      { id: "Q1", label: "Noviembre", sub: "Inicio", date: `${anio}-12-01` },
                      { id: "Q2", label: "Febrero", sub: "Seguimiento", date: `${anio + 1}-03-01` },
                      { id: "Q3", label: "Mayo", sub: "Seguimiento", date: `${anio + 1}-06-01` },
                      { id: "FINAL", label: "Agosto", sub: "Cierre Anual", date: `${anio + 1}-09-01` }
                    ].map((p, idx) => {
                      const fb = feedbacks.find(f => f.periodo === p.id);
                      const getFeedStatus = () => {
                        // 1. Explicit Status
                        if (fb?.estado === "SENT" || fb?.estado === "PENDING_HR" || fb?.estado === "CLOSED") {
                          return { label: "Enviado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                        }

                        // 2. Dates
                        const now = new Date();
                        // Get period deadline and start
                        const tlItem = [
                          { id: "Q1", date: `${anio - 1}-12-01` },
                          { id: "Q2", date: `${anio}-03-01` },
                          { id: "Q3", date: `${anio}-06-01` },
                          { id: "FINAL", date: `${anio}-09-01` }
                        ].find(t => t.id === p.id);

                        if (!tlItem) return { label: "Desconocido", className: "bg-slate-50 text-slate-500" };

                        const startDate = new Date(tlItem.date);
                        const deadline = new Date(tlItem.date);
                        deadline.setDate(deadline.getDate() + 9); // 10 days window

                        if (now > deadline) return { label: "Vencido", className: "bg-rose-50 text-rose-600 border-rose-200" };
                        if (now >= startDate && now <= deadline) return { label: "Habilitado", className: "bg-blue-50 text-blue-700 border-blue-200" };

                        // Check "En Curso" (In Progress / Current Period)
                        // If we are BEFORE the start date, but AFTER the previous period end (roughly -3 months)
                        const periodStart = new Date(startDate);
                        periodStart.setMonth(periodStart.getMonth() - 3);

                        if (now >= periodStart && now < startDate) return { label: "En Curso", className: "bg-indigo-50 text-indigo-700 border-indigo-200" };

                        return { label: "Futuro", className: "bg-slate-50 text-slate-400 border-slate-200" };
                      };
                      const statusInfo = getFeedStatus();
                      const isDone = statusInfo.label === "Enviado";

                      const isFinal = p.id === "FINAL";
                      return (
                        <div key={p.id} className="relative z-10 flex flex-col items-center group">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 shadow-sm ${isDone ? 'bg-emerald-500 border-emerald-500 scale-110' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                            {isDone && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <div className="mt-3 text-center">
                            <div className={`text-sm font-bold ${isFinal ? 'text-blue-700' : 'text-slate-700'}`}>{p.label}</div>
                            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{p.sub}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>


                {/* CARDS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  {[
                    { id: "Q1", title: "Feedback Noviembre", subtitle: "Primer Trimestre" },
                    { id: "Q2", title: "Feedback Febrero", subtitle: "Segundo Trimestre" },
                    { id: "Q3", title: "Feedback Mayo", subtitle: "Tercer Trimestre" },
                    { id: "FINAL", title: "Cierre Anual (Agosto)", subtitle: "Evaluación Final", isFinal: true }
                  ].map((conf) => {
                    const periodo = conf.id;
                    const fb = feedbacks.find(f => f.periodo === periodo); // don't default here, need check existance
                    const isFinal = conf.isFinal;
                    const isExpanded = !!expandedFeedback[periodo];

                    // Status Logic similar to MiDesempeno (Enviado, Vencido, Habilitado, En Curso, Futuro)
                    const getFeedStatus = () => {
                      // 1. Explicit Status
                      if (fb?.estado === "SENT" || fb?.estado === "PENDING_HR" || fb?.estado === "CLOSED") {
                        return { label: "Enviado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                      }

                      // 2. Dates
                      const now = new Date();
                      // Get period deadline and start
                      const tlItem = [
                        { id: "Q1", date: `${anio}-12-01` },
                        { id: "Q2", date: `${anio + 1}-03-01` },
                        { id: "Q3", date: `${anio + 1}-06-01` },
                        { id: "FINAL", date: `${anio + 1}-09-01` }
                      ].find(t => t.id === periodo);

                      if (!tlItem) return { label: "Desconocido", className: "bg-slate-50 text-slate-500" };

                      const startDate = new Date(tlItem.date);
                      const deadline = new Date(tlItem.date);
                      deadline.setDate(deadline.getDate() + 9); // 10 days window

                      if (now > deadline) return { label: "Vencido", className: "bg-rose-50 text-rose-600 border-rose-200" };
                      if (now >= startDate && now <= deadline) return { label: "Habilitado", className: "bg-blue-50 text-blue-700 border-blue-200" };

                      // Check "En Curso" (In Progress / Current Period)
                      // If we are BEFORE the start date, but AFTER the previous period end (roughly -3 months)
                      const periodStart = new Date(startDate);
                      periodStart.setMonth(periodStart.getMonth() - 3);

                      if (now >= periodStart && now < startDate) return { label: "En Curso", className: "bg-indigo-50 text-indigo-700 border-indigo-200" };

                      return { label: "Futuro", className: "bg-slate-50 text-slate-400 border-slate-200" };
                    };

                    const statusInfo = getFeedStatus();
                    const localFbData = fb || { comentario: "", estado: "DRAFT" };
                    const isLoading = loadingFeedbacks; // Use general loading state or specialized?


                    // Función local para calcular breakdown del periodo
                    const getBreakdown = (p) => {
                      if (!dashEmpleadoData) return { objetivos: 0, competencias: 0, global: 0, detailsObj: [], detailsComp: [] };

                      // Helper to convert period to a comparable month index (1-12) based on Fiscal Year (Sep-Aug)
                      const getPeriodMonth = (periodStr) => {
                        if (!periodStr) return 0;

                        // Handle Feedback Periods (Q1, Q2, etc.)
                        if (periodStr === "Q1") return 3;   // Sep-Nov
                        if (periodStr === "Q2") return 6;   // Dec-Feb
                        if (periodStr === "Q3") return 9;   // Mar-May
                        if (periodStr === "FINAL") return 12; // Jun-Aug

                        const suffix = periodStr.slice(4); // Remove year "2025"

                        // Handle Hito Periods (M01, Q1, S1, etc.)
                        if (suffix.startsWith("M")) {
                          const m = parseInt(suffix.slice(1));
                          // Map calendar month to fiscal month (Sep=1 ... Aug=12)
                          return m >= 9 ? m - 8 : m + 4;
                        }
                        if (suffix.startsWith("Q")) {
                          const q = parseInt(suffix.slice(1));
                          // Assuming Q1=Sep-Nov (1), Q2=Dec-Feb (2), Q3=Mar-May (3), Q4=Jun-Aug (4)
                          return q * 3;
                        }
                        if (suffix.startsWith("S")) {
                          const s = parseInt(suffix.slice(1));
                          return s * 6;
                        }
                        if (suffix === "FINAL") return 12;

                        return 12;
                      };

                      const feedbackLimit = getPeriodMonth(p);
                      const previousLimit = feedbackLimit - 3; // Assuming 3-month windows

                      // Check if there is ANY evaluation in the specific window of this feedback
                      const hasDataInPeriod = (
                        dashEmpleadoData.objetivos?.some(obj =>
                          obj.hitos?.some(h => {
                            const m = getPeriodMonth(h.periodo);
                            return m > previousLimit && m <= feedbackLimit && h.actual !== null && h.actual !== undefined;
                          })
                        ) ||
                        dashEmpleadoData.aptitudes?.some(apt =>
                          apt.hitos?.some(h => {
                            const m = getPeriodMonth(h.periodo);
                            return m > previousLimit && m <= feedbackLimit && h.actual !== null && h.actual !== undefined;
                          })
                        )
                      );

                      if (!hasDataInPeriod) {
                        return { objetivos: null, competencias: null, global: null, detailsObj: [], detailsComp: [] };
                      }

                      // Objetivos
                      let totalObjScore = 0;
                      let totalObjBaseWeight = 0;
                      const detailsObj = [];

                      dashEmpleadoData.objetivos?.forEach(obj => {
                        // Filter hitos up to the feedback period
                        const relevantHitosOriginal = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];

                        // 🔹 RECALCULATE SCORES for 'Logro' calculation (Fix Stale Data 8 vs 8%)
                        // Enhanced robustness to ensure we pick up the correct values
                        const relevantHitos = relevantHitosOriginal.map(h => {
                          let recalcActual = h.actual;

                          // Ensure we have definitions and results
                          if (obj.metas && obj.metas.length > 0 && h.metas && h.metas.length > 0) {
                            const mDef = obj.metas[0]; // Primary definition

                            // Find result matching this meta (by ID or fallback to index 0)
                            const mRes = h.metas.find(m => (m.metaId && m.metaId === mDef.metaId) || (m._id && m._id === mDef._id)) || h.metas[0];

                            // Extract Target robustly
                            const targetVal = mDef.esperado ?? mDef.target;

                            if (mRes && mRes.resultado !== null && mRes.resultado !== undefined && targetVal !== undefined && targetVal !== null) {
                              // Use the definition's target and config (Fresh Logic)
                              const calculated = calculatePeriodCompliance(mRes.resultado, targetVal, mDef);

                              // Only override if calculation was valid number
                              if (typeof calculated === 'number' && !isNaN(calculated)) {
                                recalcActual = calculated;
                              }
                            }
                          }
                          return { ...h, actual: recalcActual };
                        });

                        // Recalculate progress based on RECALCULATED hitos
                        const peso = Number(obj.peso || 0);
                        totalObjBaseWeight += peso;

                        // Use Shared Utility
                        const hitosValidos = relevantHitos.filter(h => h.actual != null) || [];
                        const progreso = calculateObjectiveProgress(obj, hitosValidos);

                        totalObjScore += calculateWeightedScore(progreso, peso);

                        // Weighted contribution for details (score * weight / 100)
                        const weightedScore = (progreso * peso) / 100;

                        // Calculate Running Score Info (Estimación Cierre context)
                        const tempObj = { ...obj, hitos: relevantHitos };
                        const lastHito = relevantHitos.length > 0 ? relevantHitos[relevantHitos.length - 1] : {};
                        const runningInfo = getRunningScore(tempObj, lastHito);

                        // Extract Meta Info for display
                        const metaDef = obj.metas?.[0] || {};
                        const metaTarget = metaDef.esperado ?? metaDef.target ?? 0;
                        const metaOp = metaDef.operador || "=";
                        const metaUnit = metaDef.unidad || "";

                        detailsObj.push({
                          nombre: obj.nombre,
                          score: weightedScore,
                          rawScore: progreso,
                          peso: peso,
                          // New fields for display
                          runningValue: runningInfo.value,
                          runningIsPending: runningInfo.isPendingThreshold,
                          runningDecimals: runningInfo.decimals,
                          // Meta Info
                          metaTarget,
                          metaOp,
                          metaUnit
                        });
                      });
                      const scoreObjRaw = totalObjScore; // Already correct scale (sum of weighted scores)
                      const scoreObj = scoreObjRaw * 0.7; // Weighted contribution (Max 70)

                      // Competencias
                      let totalCompScore = 0;
                      let compCount = 0;
                      const detailsComp = [];

                      dashEmpleadoData.aptitudes?.forEach(apt => {
                        // Filter hitos up to the feedback period
                        const relevantHitos = apt.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];

                        // Recalculate score based on relevant hitos (ignoring nulls)
                        let score = 0;
                        const puntuaciones = relevantHitos
                          .map(h => h.actual)
                          .filter(val => val !== null && val !== undefined);

                        if (puntuaciones.length > 0) {
                          score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
                        }

                        totalCompScore += score;
                        compCount++;

                        // For simple average, we just show the score. 
                        detailsComp.push({ nombre: apt.nombre, score: score, rawScore: score });
                      });
                      const scoreCompRaw = compCount > 0 ? (totalCompScore / compCount) : 0;
                      const scoreComp = scoreCompRaw * 0.3; // Weighted contribution (Max 30)

                      // Global
                      const global = scoreObj + scoreComp;

                      return { objetivos: scoreObj, competencias: scoreComp, global, detailsObj, detailsComp };
                    };

                    const breakdown = getBreakdown(periodo);
                    const scoreDisplay = breakdown.global;

                    return (
                      <Card key={periodo} className={`flex flex-col transition-all hover:shadow-md ${isFinal ? "border-blue-200 ring-1 ring-blue-50 bg-blue-50/10" : "border-slate-200"}`}>
                        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className={`font-normal ${statusInfo.className}`}>
                              {statusInfo.label}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED" ? "bg-emerald-500" : "bg-amber-400"}`}></div>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => toggleFeedbackDetail(periodo)}>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                          <CardTitle className={`text-base font-bold ${isFinal ? "text-blue-700" : "text-slate-800"}`}>
                            {conf.title}
                          </CardTitle>
                          <p className="text-xs text-slate-500 font-medium">
                            {conf.subtitle}
                          </p>
                        </CardHeader>

                        <CardContent className="flex-1 flex flex-col gap-4 pt-4">
                          {isFinal && (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-blue-800 font-bold uppercase tracking-wider">Score Final</div>
                                <div className="text-2xl font-black text-blue-600">{Math.round(scoreDisplay)}%</div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <div className="flex-1 bg-white/60 border border-blue-200 rounded px-2 py-1 flex justify-between">
                                  <span className="text-blue-700 font-medium">Obj</span>
                                  <span className="font-bold text-blue-700">{Math.round(breakdown.objetivos)}%</span>
                                </div>
                                <div className="flex-1 bg-white/60 border border-blue-200 rounded px-2 py-1 flex justify-between">
                                  <span className="text-blue-700 font-medium">Comp</span>
                                  <span className="font-bold text-blue-700">{Math.round(breakdown.competencias)}%</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {!isFinal && (
                            <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-medium">Score Parcial:</span>
                                <span className="text-sm font-bold text-slate-700">{Math.round(scoreDisplay)}%</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <div className="flex-1 bg-white border rounded px-2 py-1 flex justify-between">
                                  <span className="text-slate-500">Obj</span>
                                  <span className="font-bold text-blue-600">{Math.round(breakdown.objetivos)}%</span>
                                </div>
                                <div className="flex-1 bg-white border rounded px-2 py-1 flex justify-between">
                                  <span className="text-slate-500">Comp</span>
                                  <span className="font-bold text-amber-600">{Math.round(breakdown.competencias)}%</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* DETALLE EXPANDIBLE */}
                          {isExpanded && (
                            <div className="animate-in slide-in-from-top-2 duration-200 border-t pt-3 space-y-3">
                              {breakdown.detailsObj.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1">
                                    <Target className="w-3 h-3" /> Objetivos
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[9px] text-slate-400 font-medium border-b border-slate-100 pb-1 mb-1 px-1">
                                      <span>Nombre</span>
                                      <div className="flex gap-2">
                                        <span className="w-8 text-center">Peso</span>
                                        <span className="w-8 text-center">Logro</span>
                                        <span className="w-8 text-right">Pond.</span>
                                      </div>
                                    </div>
                                    {breakdown.detailsObj.map((d, i) => (
                                      <div key={i} className="flex justify-between items-start text-xs text-slate-600 px-1 py-1.5 hover:bg-slate-50 rounded border-b border-slate-50 last:border-0">
                                        <div className="flex-1 min-w-0 pr-2">
                                          <div className="font-medium text-slate-700 leading-snug break-words">
                                            {d.nombre}
                                          </div>
                                          {/* Subtitle with Meta info ONLY - Removed Running Value */}
                                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap leading-tight">
                                            <span>
                                              Meta: <span className="font-semibold text-slate-500">{d.metaOp} {d.metaTarget} {d.metaUnit}</span>
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex gap-2 pt-0.5 shrink-0">
                                          <span className="w-8 text-center text-slate-400 text-[10px]">{d.peso}%</span>
                                          <span className={`w-8 text-center font-medium ${d.rawScore >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                            {d.rawScore !== null ? `${Math.round(d.rawScore)}%` : "-"}
                                          </span>

                                          <span className="w-8 text-right font-bold text-blue-600 bg-blue-50 rounded px-1 h-fit">
                                            {d.score !== null ? `${d.score.toFixed(1)}%` : "-"}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {breakdown.detailsComp.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold text-amber-600 uppercase mb-1 flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3" /> Competencias
                                  </div>
                                  <div className="space-y-1">
                                    {breakdown.detailsComp.map((d, i) => (
                                      <div key={i} className="flex justify-between text-xs text-slate-600">
                                        <span className="truncate max-w-[140px]">{d.nombre}</span>
                                        <span className="font-semibold">{d.score !== null ? `${Math.round(d.score)}%` : "-"}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {breakdown.detailsObj.length === 0 && breakdown.detailsComp.length === 0 && (
                                <div className="text-xs text-slate-400 text-center italic">Sin datos evaluados</div>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col h-full justify-between">
                            {/* TOP: Input */}
                            <div className="flex-1 space-y-4">
                              <textarea
                                className="w-full h-32 rounded-lg border-slate-200 bg-slate-50/50 p-3 text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none resize-none placeholder:text-slate-400 text-slate-700"
                                placeholder={isFinal ? "Conclusión final del desempeño..." : "Feedback trimestral sobre avance de objetivos..."}
                                value={localFbData.comentario || ""}
                                onChange={(e) => handleFeedbackChange(periodo, e.target.value)}
                                disabled={(statusInfo.label === "Futuro" && !isTestingMode) || localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED"}
                              />
                            </div>

                            {/* BOTTOM: Stepper & Actions */}
                            <div className="mt-4 space-y-4">
                              {/* FLOW STEPPER */}
                              <div className="pt-2">
                                <div className="flex items-center justify-between relative px-2">
                                  <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-slate-100 -z-0"></div>
                                  {[
                                    { label: "Borrador", status: "DRAFT" },
                                    { label: "Enviado", status: "SENT" },
                                    { label: "RRHH", status: "PENDING_HR" },
                                    { label: "Finalizado", status: "CLOSED" }
                                  ].map((step, idx) => {
                                    const order = { "DRAFT": 0, "SENT": 1, "PENDING_HR": 2, "CLOSED": 3 };
                                    const currentStep = order[localFbData.estado] ?? 0;
                                    const isActive = idx <= currentStep;
                                    const isCurrent = idx === currentStep;

                                    const icons = {
                                      "DRAFT": FileEdit,
                                      "SENT": Send,
                                      "PENDING_HR": Users,
                                      "CLOSED": CheckCircle
                                    };
                                    const Icon = icons[step.status] || FileEdit;

                                    return (
                                      <div key={idx} className="relative z-10 flex flex-col items-center group">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${isActive ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-110' : 'bg-white border-slate-200 text-slate-300'}`}>
                                          <Icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className={`text-[9px] mt-1.5 font-medium transition-colors ${isCurrent ? 'text-blue-700' : 'text-slate-400'}`}>{step.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* FOOTER ACTIONS - SIMPLIFIED */}
                              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                <div className="text-[10px] text-slate-400">
                                  <span className="font-semibold text-slate-500">Habilitado:</span> <br />
                                  {(() => {
                                    const tlItem = [
                                      { id: "Q1", date: `${anio}-12-01` },
                                      { id: "Q2", date: `${anio + 1}-03-01` },
                                      { id: "Q3", date: `${anio + 1}-06-01` },
                                      { id: "FINAL", date: `${anio + 1}-09-01` }
                                    ].find(t => t.id === periodo);

                                    if (!tlItem) return <span className="text-slate-300">-</span>;

                                    const startDate = new Date(tlItem.date);
                                    const deadline = new Date(tlItem.date);
                                    deadline.setDate(deadline.getDate() + 9);

                                    const fmt = (d) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
                                    return `${fmt(startDate)} - ${fmt(deadline)}`;
                                  })()}
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={localFbData.estado !== "DRAFT" ? "opacity-50" : ""}
                                    onClick={() => handleSaveFeedback(periodo, localFbData.comentario, "DRAFT")}
                                    disabled={localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED" || (statusInfo.label === "Futuro" && !isTestingMode)}
                                  >
                                    <Save className="w-3 h-3 mr-1" /> Guardar
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
                                    onClick={() => handleSaveFeedback(periodo, localFbData.comentario, "SENT")}
                                    disabled={localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED" || (!localFbData.comentario && localFbData.estado === "DRAFT") || (statusInfo.label === "Futuro" && !isTestingMode)}
                                  >
                                    <Send className="w-3 h-3 mr-1" /> Enviar
                                  </Button>
                                </div>
                              </div>


                              {/* [TESTING] Delete Button INSIDE CARD */}
                              {isTestingMode && fb && fb._id && (
                                <div className="mt-4 pt-4 border-t border-rose-100 flex justify-end bg-rose-50/30 p-2 rounded-lg">
                                  <Button
                                    variant="ghost"
                                    className="text-rose-600 hover:bg-rose-100 h-7 text-xs"
                                    onClick={() => handleDeleteFeedback(fb._id)}
                                  >
                                    <Trash2 className="w-3 h-3 mr-2" /> Borrar Feedback
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )
          }
        </div >
      </div >

      {/* Reporte Final Modal */}
      < ReporteFinal
        isOpen={showFinalReport}
        onClose={() => setShowFinalReport(false)
        }
        data={dashEmpleadoData}
        empleado={dashEmpleadoData?.empleado}
        anio={anio}
      />

      <Dialog open={showDebugDialog} onOpenChange={setShowDebugDialog}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Desglose de Cálculo (En Vivo)</DialogTitle>
            <DialogDescription>
              Detalle de cómo se llega al puntaje global actual.
            </DialogDescription>
          </DialogHeader>

          {resumenEmpleado?.debug && (
            <div className="space-y-6 py-4">

              <div className="space-y-6">
                {/* SECTION 2: OBJECTIVES DETAIL */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-500" /> DETALLE OBJETIVOS
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium w-[20%]">Nombre</th>
                          <th className="px-2 py-2 text-center font-medium w-[10%]">Cálculo</th>
                          <th className="px-2 py-2 text-center font-medium w-[10%]">Peso</th>
                          <th className="px-2 py-2 text-center font-medium w-[10%]">Progreso</th>
                          <th className="px-2 py-2 text-center font-medium w-[15%]">Contrib. (Peso*Prog)</th>
                          <th className="px-2 py-2 text-center font-medium text-[10%]">Hitos</th>
                          <th className="px-2 py-2 text-left font-medium text-[10px] w-[35%]">Valores (Real / Meta)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumenEmpleado.debug.objetivos.map((o, i) => (
                          <React.Fragment key={i}>
                            <tr className="bg-slate-50/50">
                              <td className="px-2 py-1.5 font-semibold text-slate-800" colSpan={1} title={o.nombre}>
                                {o.nombre}
                              </td>
                              <td className="px-2 py-1.5 text-center text-xs text-slate-500">
                                {o.metodoCalculo}
                              </td>
                              <td className="px-2 py-1.5 text-center text-slate-500">{o.peso ? `${o.peso}%` : '-'}</td>
                              <td className={`px-2 py-1.5 text-center font-bold ${o.progreso > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                {Math.round(o.progreso)}%
                              </td>
                              <td className="px-2 py-1.5 text-center font-bold text-blue-600 bg-blue-50/30">
                                {o.scoreContrib.toFixed(1)}%
                              </td>
                              <td className="px-2 py-1.5 text-center text-slate-400 text-[10px]" colSpan={2}>
                                {o.hitosEvaluados}/{o.hitosTotal} Evaluaciones
                              </td>
                            </tr>
                            {/* Metas Detail Sub-rows - SECTIONAL LAYOUT */}
                            {o.metasDetails?.map((m, idx) => {
                              return (
                                <React.Fragment key={`${i}-m-${idx}`}>
                                  <tr className="bg-slate-50/40 hover:bg-slate-50 border-b border-slate-200/60">
                                    {/* SECTION 1: META INFO */}
                                    <td className="pl-6 py-3 pr-4 border-l-[6px] border-slate-300 w-[30%] align-top">
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-start gap-2">
                                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></div>
                                          <span className="text-sm font-semibold text-slate-800 leading-tight">{m.nombre}</span>
                                        </div>
                                        <div className="pl-3.5">
                                          <Badge variant="outline" className="h-5 bg-white border-slate-300 text-slate-600 font-normal">
                                            Meta: {m.config.operador || '>='} {m.config.target} {m.config.unidad}
                                          </Badge>
                                        </div>
                                      </div>
                                    </td>

                                    {/* SECTION 2: CONFIGURATION */}
                                    <td colSpan={2} className="px-4 py-3 border-l border-slate-200/60 w-[20%] align-top bg-slate-100/30">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                          <span>Peso:</span>
                                          <span className="font-bold text-slate-700">{m.peso ? `${m.peso}%` : 'Equitativo'}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 hover:bg-slate-200 text-[10px] justify-center">
                                              {m.config.regla}
                                            </Badge>
                                            {m.config.regla === 'umbral_periodos' && m.config.umbral > 0 && (
                                              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1 rounded border border-slate-200">
                                                Min: {m.config.umbral}
                                              </span>
                                            )}
                                          </div>
                                          {m.config.acum && <span className="text-[9px] text-center text-slate-400 font-bold tracking-wider uppercase">Acumulativo</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {m.config.esfuerzo && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 font-medium">Esfuerzo</span>}
                                          {m.config.over && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium">Permite Over</span>}
                                        </div>
                                      </div>
                                    </td>

                                    {/* SECTION 3: RESULTS (BREAKDOWN) */}
                                    <td colSpan={4} className="px-4 py-3 border-l border-slate-200/60 w-[50%] align-center bg-white">
                                      <div className="grid grid-cols-4 gap-3 w-full">
                                        {/* Using Grid to enforce alignment and wrapping into rows if needed */}
                                        {m.breakdown?.map((b, bix) => (
                                          <div key={bix} className="flex flex-col border border-slate-200 rounded-md overflow-hidden shadow-sm">
                                            <div className="bg-slate-50 border-b border-slate-100 px-2 py-1 text-center">
                                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{b.period}</span>
                                            </div>
                                            <div className="bg-white px-2 py-1.5 text-center">
                                              <span className="text-sm font-bold text-slate-800">{Number(b.val).toLocaleString()}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t font-bold text-xs">
                        <tr>
                          <td colSpan={3} className="px-2 py-2 text-right text-slate-600">TOTAL OBJETIVOS:</td>
                          <td className="px-2 py-2 text-center text-blue-700 bg-blue-100/50">
                            {resumenEmpleado.debug.objetivos.reduce((a, b) => a + (b.scoreContrib || 0), 0).toFixed(1)}%
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* SECTION 3: COMPETENCIES DETAIL */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" /> DETALLE COMPETENCIAS
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">Nombre</th>
                          <th className="px-2 py-2 text-center font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumenEmpleado.debug.aptitudes.map((a, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 truncate max-w-[300px]" title={a.nombre}>{a.nombre}</td>
                            <td className={`px-2 py-1.5 text-center font-bold ${a.score > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                              {Math.round(a.score)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t font-bold text-xs">
                        <tr>
                          <td className="px-2 py-2 text-right text-slate-600">TOTAL COMPETENCIAS:</td>
                          <td className="px-2 py-2 text-center text-indigo-700 bg-indigo-100/50">
                            {resumenEmpleado.debug.aptitudes.reduce((a, b) => a + (b.score || 0), 0) > 0
                              ? Math.round(resumenEmpleado.debug.aptitudes.reduce((a, b) => a + b.score, 0) / resumenEmpleado.debug.aptitudes.length)
                              : 0}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* SECTION 4: GLOBAL CALCULATION */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-emerald-600" /> RESUMEN FINAL (PONDERADO)
                </h3>
                <div className="border rounded-lg overflow-hidden bg-slate-50/50">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs uppercase text-slate-500">Concepto</th>
                        <th className="px-4 py-2 text-center text-xs uppercase text-slate-500">Puntaje</th>
                        <th className="px-4 py-2 text-center text-xs uppercase text-slate-500">Peso</th>
                        <th className="px-4 py-2 text-right text-xs uppercase text-slate-500">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="px-4 py-2 font-medium text-slate-700">Objetivos</td>
                        <td className="px-4 py-2 text-center text-slate-600">
                          {(resumenEmpleado.objetivos.rawScore || 0).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-center text-slate-500">70%</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">
                          {(resumenEmpleado.objetivos.score || 0).toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-slate-700">Competencias</td>
                        <td className="px-4 py-2 text-center text-slate-600">
                          {(resumenEmpleado.aptitudes.rawScore || 0).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-center text-slate-500">30%</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">
                          {(resumenEmpleado.aptitudes.score || 0).toFixed(1)}
                        </td>
                      </tr>
                      <tr className="bg-slate-100 border-t-2 border-slate-200">
                        <td colSpan={3} className="px-4 py-3 text-right font-black text-slate-800">GLOBAL:</td>
                        <td className="px-4 py-3 text-right font-black text-xl text-emerald-600">
                          {Math.round(resumenEmpleado.global)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}

