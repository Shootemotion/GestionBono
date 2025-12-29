import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertCircle
} from "lucide-react";
import { ReporteFinal } from "@/components/ReporteFinal";

/* ===================== Constantes y helpers ===================== */

const ESTADOS = [
  { code: "NO_ENVIADOS", label: "No enviados", color: "bg-slate-100 text-slate-700", ring: "ring-slate-300" },
  { code: "PENDING_EMPLOYEE", label: "Enviados", color: "bg-amber-100 text-amber-800", ring: "ring-amber-300" },
  { code: "PENDING_HR", label: "En RRHH", color: "bg-blue-100 text-blue-800", ring: "ring-blue-300" },
  { code: "CLOSED", label: "Cerrados", color: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-300" },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

  // Calculate Objective Score
  const pesosObj = objetivos.map((o) => Number(o.peso ?? 0));
  const pesosBaseObj = objetivos.map((o) => Number(o.pesoBase ?? o.peso ?? 0));
  const progObj = objetivos.map((o) => Number(o.progreso ?? 0));

  const totalBasePesoObj = pesosBaseObj.reduce((a, b) => a + b, 0) || 0;



  const scoreObjRaw = totalBasePesoObj > 0
    ? pesosObj.reduce((acc, p, i) => {
      const obj = objetivos[i];
      const hasPermiteOver = obj.metas?.some(m => m.permiteOver) || obj.hitos?.some(h => h.metas?.some(m => m.permiteOver));
      const rawScore = progObj[i] || 0;
      const effectiveScore = hasPermiteOver ? rawScore : Math.min(rawScore, 100);
      return acc + p * effectiveScore;
    }, 0) / 100 // Always normalize to 100 base
    : 0;

  const scoreObj = scoreObjRaw; // Already weighted by reduce logic above? No, reduce logic uses weights.
  // Wait, the reduce logic is: Sum(Weight * Score) / Sum(BaseWeight).
  // This IS the weighted average.
  // So scoreObjRaw IS the final Objective Score (0-100+).

  // Calculate Aptitude Score
  const pesosApt = aptitudes.map((a) => Number(a.peso ?? 0));
  const pesosBaseApt = aptitudes.map((a) => Number(a.pesoBase ?? a.peso ?? 0));
  const progApt = aptitudes.map((a) => Number(a.puntuacion ?? a.score ?? 0));

  const scoreApt = progApt.length
    ? progApt.reduce((a, b) => a + b, 0) / progApt.length
    : 0;

  // Global Score (70/30)
  const scoreObjWeighted = scoreObj * 0.7;
  const scoreAptWeighted = scoreApt * 0.3;
  const global = scoreObjWeighted + scoreAptWeighted;

  return {
    objetivos: { cantidad: objetivos.length, peso: totalBasePesoObj, score: scoreObjWeighted, rawScore: scoreObj },
    aptitudes: { cantidad: aptitudes.length, score: scoreAptWeighted, rawScore: scoreApt },
    global,
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

  const [anio] = useState(state?.anio ?? Number(String(periodo || new Date().getFullYear()).slice(0, 4)));
  const [selectedEmpleadoId] = useState(empleadoId || state?.empleado?._id || state?.empleadosDelItem?.[0]?._id || user?.empleado?._id || null);
  const [empleadoInfo, setEmpleadoInfo] = useState(state?.empleado || state?.empleadosDelItem?.[0] || user?.empleado || null);

  const [dashEmpleadoData, setDashEmpleadoData] = useState(null);
  const [loadingDash, setLoadingDash] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState(plantillaId === "feedback-global" ? "feedback" : "evaluacion"); // "evaluacion" | "feedback"

  // Estado local para items expandidos y sus datos de evaluación
  const [expandedItems, setExpandedItems] = useState({}); // { [itemId]: boolean }
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

  // Cargar Dashboard
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

      // 1. Traer plantilla full para asegurar metas
      let plantillaFull = item;
      if (!item.metas || item.metas.length === 0) {
        try {
          plantillaFull = await api(`/templates/${item._id}`);
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
      const p = periodoGlobal || item.hitos?.[0]?.periodo;
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
      if (res) setDashEmpleadoData(res);

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
        { id: "Q1", date: `${anio - 1}-12-01` },
        { id: "Q2", date: `${anio}-03-01` },
        { id: "Q3", date: `${anio}-06-01` },
        { id: "FINAL", date: `${anio}-09-01` }
      ];
      const item = timeline.find(t => t.id === periodo);
      if (item) {
        const startDate = new Date(item.date);
        const now = new Date();
        if (now < startDate) {
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
                <h1 className={`text-xl font-bold flex items-center gap-2 ${isTestingMode ? "text-slate-900" : "text-slate-800"}`}>
                  {empleadoNombreCompleto}
                  <Badge variant="outline" className={isTestingMode ? "text-indigo-600 border-indigo-300 bg-white/50 font-normal" : "text-slate-500 border-slate-300 font-normal"}>
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

              {/* TESTING MODE TOGGLE (Only Directors) */}
              {esDirector && (
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
              <div className="space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-blue-700 border-b pb-2">
                  <Target className="w-5 h-5" /> Objetivos
                </h2>
                {dashEmpleadoData?.objetivos?.map((obj) => {
                  const isExpanded = !!expandedItems[obj._id];
                  const data = evaluacionData[obj._id];
                  const localHito = data?.localHito;
                  const bucketCfg = bucketConfig(obj.bucket || "futuro");

                  return (
                    <Card key={obj._id} className={`border-0 shadow-sm ring-1 ring-slate-100 bg-white transition-all overflow-hidden mb-4 ${isExpanded ? 'ring-2 ring-blue-500/20 shadow-md' : 'hover:shadow-md hover:ring-blue-500/10'}`}>
                      <CardHeader className="py-2 px-3 cursor-pointer bg-white hover:bg-slate-50/50 transition-colors" onClick={() => toggleExpand(obj)}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {/* Title & Badge */}
                          <div className="flex items-start gap-3">
                            <Badge variant="secondary" className={`${bucketCfg.badgeClass} text-[10px] px-2 shrink-0 whitespace-nowrap mt-0.5`}>
                              {bucketCfg.chip}
                            </Badge>
                            <span className="text-sm font-bold text-slate-700 leading-snug">{obj.nombre}</span>
                          </div>

                          {/* Metrics Grid */}
                          <div className="flex items-center gap-3 shrink-0 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                            {/* Peso */}
                            <div className="flex flex-col items-center px-2 border-r border-slate-200/60">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Peso</span>
                              <span className="text-xs font-bold text-slate-600">{obj.peso}%</span>
                            </div>

                            {/* Progreso Real */}
                            <div className="flex flex-col items-center px-2 border-r border-slate-200/60">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Progreso</span>
                              <span className={`text-xs font-bold ${obj.progreso >= 100 ? "text-emerald-600" : "text-blue-600"}`}>
                                {Math.round(obj.progreso)}%
                              </span>
                            </div>

                            {/* Ponderado */}
                            <div className="flex flex-col items-center px-1">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Ponderado</span>
                              <span className="text-xs font-black text-slate-800">
                                {Math.round((obj.progreso * obj.peso) / 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="p-0 border-t border-slate-100">
                          {/* SECTION 1: TIMELINE */}
                          {obj.hitos && obj.hitos.length > 0 && (
                            <div className="bg-slate-50 border-b-4 border-slate-100/50 p-5">
                              <label className="text-[9px] text-slate-400 font-bold uppercase mb-3 block tracking-wide flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Cronograma
                              </label>
                              <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar mask-gradient-r">
                                {obj.hitos.map((h) => {
                                  const status = getSmartHitoStatus(h);
                                  const colorClass = getHitoColorClass(status);
                                  const isSelected = localHito?.periodo === h.periodo;
                                  const isSelectable = status === "vencido" || status === "por_vencer" || status === "evaluado";
                                  const isLoading = savingItems[obj._id] && !localHito;

                                  return (
                                    <div
                                      key={h.periodo}
                                      onClick={() => (isSelectable || (isTestingMode && puedeVer)) && !savingItems[obj._id] && loadItemEvaluacion(obj, h.periodo)}
                                      className={`flex flex-col items-center justify-center py-1.5 px-3 min-w-[42px] shrink-0 rounded border transition-all duration-200 relative ${colorClass} 
                                      ${isSelected ? 'ring-1 ring-blue-400 shadow-sm scale-105 z-10' : ''} 
                                      ${(isSelectable || (isTestingMode && puedeVer)) && !savingItems[obj._id] ? 'cursor-pointer hover:shadow-sm hover:-translate-y-0.5' : 'opacity-40 grayscale cursor-not-allowed'}
                                      ${isLoading && isSelected ? 'animate-pulse' : ''}`}
                                    >
                                      <span className="text-[8px] font-black uppercase tracking-tight leading-none mb-0.5">{h.periodo}</span>
                                      <span className="text-[10px] font-bold leading-none">{h.actual !== null ? `${Math.round(h.actual)}%` : "-"}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* CENTRALLY ALIGNED LEGEND */}
                              <div className="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-slate-200/50 w-full opacity-80">
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-100 border border-emerald-300"></div><span className="text-[9px] text-slate-500 font-medium">Evaluado</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-100 border border-amber-300"></div><span className="text-[9px] text-slate-500 font-medium">Por Vencer</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-100 border border-rose-300"></div><span className="text-[9px] text-slate-500 font-medium">Vencido</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-50 border border-blue-200"></div><span className="text-[9px] text-slate-500 font-medium">Futuro</span></div>
                              </div>
                            </div>
                          )}

                          {localHito ? (
                            <div className="animate-in fade-in duration-300">
                              {/* SECTION 2: CONTEXT (Header + Score) */}
                              <div className="p-5 border-b-4 border-slate-100/50 bg-white">
                                <div className="flex flex-col sm:flex-row gap-6">
                                  {/* Left: Description & Meta Data */}
                                  <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] px-2 uppercase tracking-wide">
                                        {obj.frecuencia || "Objetivo"}
                                      </Badge>
                                      {obj.proceso && (
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200 text-[9px] px-2 font-medium">
                                          {obj.proceso}
                                        </Badge>
                                      )}
                                      <span className="text-xs font-bold text-slate-700">{localHito.periodo}</span>
                                    </div>

                                    <div className="text-sm text-slate-600 leading-relaxed border-l-2 border-slate-200 pl-3">
                                      {obj.descripcion || <span className="italic text-slate-400">Sin descripción</span>}
                                    </div>
                                  </div>

                                  {/* Right: Score Box */}
                                  <div className="shrink-0 flex items-center justify-center">
                                    <div className={`flex flex-col items-center justify-center w-28 h-20 rounded-xl border-2 ${isTestingMode ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                                      <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Score Hito</span>
                                      <span className={`text-2xl font-black ${Number(localHito.actual) >= 100 ? "text-emerald-500" : "text-slate-800"}`}>
                                        {Number(localHito.actual).toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* SECTION 3: METAS */}
                              <div className="p-5 border-b-4 border-slate-100/50 bg-white">
                                <div className="mb-4 flex items-center gap-2">
                                  <Target className="w-3 h-3 text-slate-400" />
                                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Metas</span>
                                </div>
                                <div className="space-y-4">
                                  {localHito.metas.map((meta, idx) => {
                                    const isAcumulativo = meta.modoAcumulacion === "acumulativo";
                                    const valorEvaluado = isAcumulativo
                                      ? getAccumulatedValue(obj, meta.metaId || meta._id, localHito.periodo, meta.resultado)
                                      : meta.resultado;

                                    const cumple = evaluarCumple(valorEvaluado, meta.esperado, meta.operador, meta.unidad);

                                    return (
                                      <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-3 group">
                                        <div className="flex justify-between items-start gap-4">
                                          <div className="flex-1 space-y-1">
                                            <div className="font-bold text-sm text-slate-800 leading-snug col-span-1 group-hover:text-blue-700 transition-colors">
                                              {meta.nombre}
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-[10px] items-center mt-3">
                                              {/* Target Chip */}
                                              <div className="flex items-center bg-slate-100 text-slate-700 px-2 py-1 rounded-md border border-slate-200 font-medium">
                                                <span className="text-slate-400 mr-1.5 uppercase text-[9px] tracking-wider font-bold">Meta:</span>
                                                <span className="font-mono text-xs">{meta.operador} {meta.esperado} {meta.unidad}</span>
                                              </div>

                                              {/* Badges Layout */}
                                              <div className="flex gap-1.5 flex-wrap">
                                                {/* Peso - MOVED HERE */}
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold shadow-sm">
                                                  {meta.pesoMeta || 100}%
                                                </span>

                                                {/* Tolerancia - MOVED HERE */}
                                                {meta.tolerancia > 0 && (
                                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold shadow-sm">
                                                    Tol: {meta.tolerancia}%
                                                  </span>
                                                )}

                                                {/* Closure Rule */}
                                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-semibold shadow-sm">
                                                  {getCierreLabel(meta)}
                                                </span>

                                                {/* Accumulative */}
                                                {isAcumulativo && (
                                                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 font-semibold shadow-sm flex items-center gap-1">
                                                    <RefreshCw className="w-3 h-3" /> Acum.
                                                  </span>
                                                )}

                                                {/* Over */}
                                                {meta.permiteOver && (
                                                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 font-semibold shadow-sm">
                                                    Over
                                                  </span>
                                                )}
                                                {/* Effort Recognition */}
                                                {meta.reconoceEsfuerzo && (
                                                  <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded border border-sky-100 font-semibold shadow-sm flex items-center gap-1">
                                                    <Lightbulb className="w-3 h-3" /> Esfuerzo
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="w-32 min-w-[120px]">
                                            <label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block">Resultado</label>
                                            {meta.unidad === "Cumple/No Cumple" ? (
                                              <label className={`flex items-center gap-2 p-1.5 rounded border-2 cursor-pointer transition-all ${meta.resultado ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                                                <input
                                                  type="checkbox"
                                                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300"
                                                  checked={!!meta.resultado}
                                                  onChange={(e) => {
                                                    const val = e.target.checked;
                                                    handleUpdateLocalHito(obj._id, (prev) => {
                                                      const metas = [...prev.metas];
                                                      metas[idx] = { ...metas[idx], resultado: val, cumple: val };
                                                      return { ...prev, metas };
                                                    });
                                                  }}
                                                />
                                                <span className={`text-xs font-bold ${meta.resultado ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                  {meta.resultado ? "Cumple" : "No"}
                                                </span>
                                              </label>
                                            ) : (
                                              <div className="relative">
                                                <Input
                                                  type="number"
                                                  className={`h-8 pl-2 pr-6 text-sm font-semibold border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-slate-700 ${meta.resultado === null || meta.resultado === "" || meta.resultado === undefined ? "bg-yellow-50" : "bg-white"}`}
                                                  placeholder="0.00"
                                                  value={meta.resultado ?? ""}
                                                  onChange={(e) => {
                                                    const val = e.target.value === "" ? null : Number(e.target.value);
                                                    handleUpdateLocalHito(obj._id, (prev) => {
                                                      const metas = [...prev.metas];
                                                      metas[idx] = { ...metas[idx], resultado: val };
                                                      return { ...prev, metas };
                                                    });
                                                  }}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {meta.resultado !== null && (
                                          <div className={`mt-1 flex items-center gap-2 text-[10px] font-medium px-2 py-1.5 rounded border ${cumple ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-100'}`}>
                                            <span className="text-sm">{cumple ? "✔" : "✘"}</span>
                                            <div className="flex-1">
                                              {cumple ? "Cumple Obj." : (isAcumulativo ? `Progreso: ${valorEvaluado} / ${meta.esperado}` : "No alcanza")}
                                              {isAcumulativo && (
                                                <span className="opacity-80 ml-1">
                                                  (Acumulado: <b>{valorEvaluado}</b>)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Comentarios y Acciones */}
                              <div className="p-5 bg-slate-50/50">
                                <div className="mb-3 flex items-center gap-2">
                                  <MessageSquare className="w-3 h-3 text-slate-400" />
                                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cierre & Feedback</span>
                                </div>
                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Comentario</label>
                                  <textarea
                                    className={`w-full h-20 rounded border-slate-200 p-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none resize-none ${!localHito.comentario ? "bg-yellow-50" : "bg-white"}`}
                                    placeholder="Justificación..."
                                    value={localHito.comentario}
                                    onChange={(e) => handleUpdateLocalHito(obj._id, (prev) => ({ ...prev, comentario: e.target.value }))}
                                  />
                                </div>
                                {data.comentarioManager && (
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Feedback Anterior</label>
                                    <p className="text-xs text-slate-600 italic line-clamp-2">"{data.comentarioManager}"</p>
                                  </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRecalculate(obj)} disabled={savingItems[obj._id]}>
                                    <RefreshCw className={`w-3 h-3 mr-1 ${savingItems[obj._id] ? "animate-spin" : ""}`} /> Recalcular
                                  </Button>
                                  <Button size="sm" className="h-7 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200" onClick={() => handleSaveItem(obj, "draft")} disabled={savingItems[obj._id]}>
                                    <Save className="w-3 h-3 mr-1" /> Guardar
                                  </Button>
                                </div>
                              </div>

                              {/* [TESTING] Delete Button */}
                              {isTestingMode && (
                                <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end px-4 pb-4">
                                  <Button
                                    variant="outline"
                                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                                    onClick={() => handleDeleteEvaluacion(obj, localHito.periodo)}
                                  >

                                    <Trash2 className="w-4 h-4 mr-2" /> Borrar Evaluación (Admin)
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-400">
                              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                              <p className="text-xs">Seleccioná un hito para evaluar</p>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-blue-700 border-b pb-2">
                  <Lightbulb className="w-5 h-5" /> Competencias
                </h2>
                {dashEmpleadoData?.aptitudes?.map((apt) => {
                  const isExpanded = !!expandedItems[apt._id];
                  const data = evaluacionData[apt._id];
                  const localHito = data?.localHito;

                  return (
                    <Card key={apt._id} className={`border-0 shadow-sm ring-1 ring-slate-100 transition-all overflow-hidden mb-4 group ${isExpanded ? 'ring-2 ring-blue-500/20 shadow-md bg-white' : 'hover:shadow-md bg-white hover:bg-slate-50/50'}`}>
                      <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => toggleExpand(apt)}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 flex items-start gap-3">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] px-2 shrink-0 whitespace-nowrap mt-0.5">
                              Competencia
                            </Badge>
                            <span className="text-sm font-bold text-slate-700 leading-snug">{apt.nombre}</span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                            <div className="flex flex-col items-center px-1">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Score</span>
                              <span className="text-sm font-black text-slate-700 leading-none">{Math.round(apt.puntuacion)}%</span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-4 px-4 bg-slate-50/30 border-t border-slate-100">
                          {/* Milestone Selector (Added for Competencias) */}
                          {apt.hitos && apt.hitos.length > 0 && (
                            <div className="mb-4 mt-4">
                              <label className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded inline-block font-bold uppercase mb-2 tracking-wide">Cronograma de Hitos</label>
                              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                                {apt.hitos.map((h) => {
                                  const status = getSmartHitoStatus(h);
                                  const colorClass = getHitoColorClass(status);
                                  const isSelected = localHito?.periodo === h.periodo;
                                  const isSelectable = status === "vencido" || status === "por_vencer" || status === "evaluado";
                                  const isLoading = savingItems[apt._id] && !localHito;

                                  return (
                                    <div
                                      key={h.periodo}
                                      onClick={() => (isSelectable || (isTestingMode && puedeVer)) && !savingItems[apt._id] && loadItemEvaluacion(apt, h.periodo)}
                                      className={`flex flex-col items-center justify-center py-1.5 px-1 rounded border transition-all duration-200 relative ${colorClass} 
                                      ${isSelected ? 'ring-2 ring-offset-1 ring-blue-500 shadow-sm scale-105 z-10' : ''}   
                                      ${(isSelectable || (isTestingMode && puedeVer)) && !savingItems[apt._id] ? 'cursor-pointer hover:shadow-sm hover:-translate-y-0.5' : 'opacity-40 grayscale cursor-not-allowed'}
                                      ${isLoading && isSelected ? 'animate-pulse' : ''}`}
                                    >
                                      <span className="text-[9px] font-black uppercase tracking-tight">{h.periodo}</span>
                                      <span className="text-[10px] font-semibold mt-0">{h.actual !== null ? `${Math.round(h.actual)}%` : "-"}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Legend */}
                              <div className="flex items-center gap-3 mt-2 justify-end">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-100 border border-emerald-200"></div><span className="text-[9px] text-slate-400 font-medium">Evaluado</span></div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-amber-100 border border-amber-200"></div><span className="text-[9px] text-slate-400 font-medium">Por Vencer</span></div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-rose-100 border border-rose-200"></div><span className="text-[9px] text-slate-400 font-medium">Vencido</span></div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-blue-50 border border-blue-200"></div><span className="text-[9px] text-slate-400 font-medium">Futuro</span></div>
                              </div>
                            </div>

                          )}

                          {localHito ? (
                            <div className="space-y-4 mt-4 animate-in slide-in-from-top-4 duration-300">
                              {/* Evaluation Header */}
                              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl shadow-sm border mb-6 ${isTestingMode
                                ? "bg-gradient-to-br from-indigo-50 to-white text-slate-800 border-indigo-100 shadow-indigo-100"
                                : "bg-white border-slate-200 shadow-sm"
                                }`}>
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[9px] px-2">
                                      Competencia
                                    </Badge>
                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{localHito.periodo}</span>
                                  </div>
                                  {apt.descripcion ? (
                                    <div className="text-sm text-slate-600 leading-relaxed border-l-2 border-slate-200 pl-3">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Descripción</span>
                                      {apt.descripcion}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-slate-400 italic">Sin descripción</p>
                                  )}
                                </div>

                                <div className={`flex items-center gap-3 pl-6 pr-6 py-3 rounded-xl border backdrop-blur-sm self-stretch sm:self-auto flex-col sm:flex-row justify-center min-w-[140px] ${isTestingMode
                                  ? "bg-white/50 border-indigo-100"
                                  : "bg-slate-50 border-slate-100"
                                  }`}>
                                  <div className="text-center sm:text-right">
                                    <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isTestingMode ? "text-indigo-400" : "text-slate-500"}`}>Nivel</div>
                                    <div className={`text-3xl font-black ${Number(localHito.actual) >= 100
                                      ? "text-emerald-500"
                                      : isTestingMode ? "text-indigo-600" : "text-slate-800"
                                      }`}>
                                      {localHito.escala ? `${localHito.escala}/5` : "-"}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
                                <div>
                                  <label className="text-xs font-bold text-slate-700 mb-2 block flex justify-between">
                                    <span>Nivel de Competencia</span>
                                    <span className="text-slate-400 font-normal text-[10px]">Selecciona opción</span>
                                  </label>
                                  <div className="grid grid-cols-5 gap-2">
                                    {[1, 2, 3, 4, 5].map((val) => (
                                      <button
                                        key={val}
                                        onClick={() => handleUpdateLocalHito(apt._id, (prev) => ({ ...prev, escala: val }))}
                                        className={`h-9 rounded-lg border-2 font-black text-lg transition-all duration-200 relative overflow-hidden group/btn ${localHito.escala === val ? "border-blue-500 bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-200 ring-offset-1" : "border-slate-100 bg-white text-slate-300 hover:border-blue-200 hover:text-blue-400"}`}
                                      >
                                        <span className="relative z-10">{val}</span>
                                        {localHito.escala === val && <div className="absolute inset-0 bg-blue-100/50 animate-pulse"></div>}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex justify-between text-[9px] font-semibold text-slate-400 mt-1 px-1 uppercase tracking-wide">
                                    <span>Bajo</span>
                                    <span>Excelente</span>
                                  </div>
                                </div>

                                <div className="border-t border-slate-100 pt-3">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Comentario</label>
                                  <textarea
                                    className={`w-full h-20 rounded-lg border-slate-200 p-2 text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none resize-none placeholder:text-slate-400 ${!localHito.comentario ? "bg-yellow-50" : "bg-white"}`}
                                    placeholder="Justifica..."
                                    value={localHito.comentario}
                                    onChange={(e) => handleUpdateLocalHito(apt._id, (prev) => ({ ...prev, comentario: e.target.value }))}
                                  />
                                </div>

                                <div className="flex justify-end pt-1">
                                  <Button size="sm" className="h-8 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-sm" onClick={() => handleSaveItem(apt, "draft")} disabled={savingItems[apt._id]}>
                                    <Save className="w-3 h-3 mr-1" /> Guardar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-300 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="font-medium text-xs text-slate-500">Seleccioná un hito para evaluar</p>
                            </div>
                          )}
                        </CardContent>
                      )
                      }
                    </Card>
                  );
                })}
              </div>
            </div>
          )
          }

          {/* TAB: FEEDBACK */}
          {activeTab === "feedback" && (
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
                      const relevantHitos = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];

                      // Recalculate progress based on relevant hitos
                      let score = 0;
                      if (relevantHitos.length > 0) {
                        const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
                        const progresos = relevantHitos.map(h => h.actual ?? 0);

                        score = isCumulative
                          ? Math.max(...progresos, 0)
                          : Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length);
                      }

                      const hasPermiteOver = obj.metas?.some(m => m.permiteOver) || obj.hitos?.some(h => h.metas?.some(m => m.permiteOver));
                      const effectiveScore = hasPermiteOver ? score : Math.min(score, 100);

                      totalObjScore += effectiveScore * (obj.peso || 0);
                      totalObjBaseWeight += (obj.pesoBase || obj.peso || 0);

                      // Weighted contribution for details (score * weight / 100)
                      const weightedScore = (effectiveScore * (obj.peso || 0)) / 100;
                      detailsObj.push({ nombre: obj.nombre, score: weightedScore, rawScore: effectiveScore });
                    });
                    const scoreObjRaw = totalObjScore / 100; // Always normalize to 100 base
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
                                  {breakdown.detailsObj.map((d, i) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600">
                                      <span className="truncate max-w-[140px]">{d.nombre}</span>
                                      <span className="font-semibold">{d.score !== null ? `${Math.round(d.score)}%` : "-"}</span>
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
                                  disabled={localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED"}
                                >
                                  <Save className="w-3 h-3 mr-1" /> Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
                                  onClick={() => handleSaveFeedback(periodo, localFbData.comentario, "SENT")}
                                  disabled={localFbData.estado === "SENT" || localFbData.estado === "PENDING_HR" || localFbData.estado === "CLOSED" || (!localFbData.comentario && localFbData.estado === "DRAFT")}
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
        </div>
      </div>

      {/* Reporte Final Modal */}
      <ReporteFinal
        isOpen={showFinalReport}
        onClose={() => setShowFinalReport(false)}
        data={dashEmpleadoData}
        empleado={dashEmpleadoData?.empleado}
        anio={anio}
      />
    </div>
  );
}

