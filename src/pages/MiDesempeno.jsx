import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTour } from "@/hooks/useTour";
import { dashEmpleado } from "@/lib/dashboard";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { API_ORIGIN } from "@/lib/api";

function initialsFromUser(user) {
  const base =
    user?.fullName ||
    (user?.apellido ? `${user.apellido} ${user.nombre ?? ""}` : user?.email) ||
    "";
  return (
    base
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "US"
  );
}

function fotoSrc(empleado) {
  const url = empleado?.fotoUrl;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base =
    typeof API_ORIGIN === "string" && API_ORIGIN
      ? API_ORIGIN
      : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
}
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Lock,
  Calendar,
  UserCircle2,
  Target,
  Lightbulb,
  ChevronDown,
  HelpCircle,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  FileSignature,
  FileEdit,
  Send,
  Users,
  CheckCircle,
  Activity,
  Info,
  Handshake,
  TrendingUp,
  BarChart3,
  Hourglass,
  Trophy,
  Megaphone,
  Settings2,
  Zap,
  CircleCheck,
  CircleAlert,
  Cpu
} from "lucide-react";
import { ReporteFinal } from "@/components/ReporteFinal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, AreaChart, Area } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,

  DialogTrigger,
} from "@/components/ui/dialog";
import { calculateObjectiveProgress, calculateWeightedScore, calculateCompetencyProgress } from "@/utils/calculos";

// === UI helpers ===
const StatusBadge = ({ status }) => {
  const styles = {
    "SENT": "bg-blue-50 text-blue-700 border-blue-200",
    "REALIZADO": "bg-blue-50 text-blue-700 border-blue-200",
    "PENDING_HR": "bg-purple-50 text-purple-700 border-purple-200",
    "ACKNOWLEDGED": "bg-purple-50 text-purple-700 border-purple-200", // Legacy support
    "CLOSED": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "SYSTEM_CLOSED": "bg-slate-100 text-slate-600 border-slate-300",
    "PENDIENTE": "bg-amber-50 text-amber-700 border-amber-200",
    "DRAFT": "bg-amber-50 text-amber-700 border-amber-200",
    "VENCIDO": "bg-rose-50 text-rose-700 border-rose-200",
    "FUTURO": "bg-slate-50 text-slate-400 border-slate-200",
    "ACTUAL": "bg-blue-50 text-blue-700 border-blue-200"
  };

  const labels = {
    "SENT": "Enviado al empleado",
    "REALIZADO": "Enviado al empleado",
    "PENDING_HR": "Enviado a RRHH",
    "ACKNOWLEDGED": "Enviado a RRHH", // Legacy support
    "CLOSED": "Finalizado",
    "SYSTEM_CLOSED": "Cerrado por Sistema",
    "PENDIENTE": "Borrador",
    "DRAFT": "Borrador",
    "VENCIDO": "Vencido",
    "FUTURO": "Futuro",
    "ACTUAL": "En Curso"
  };

  return (
    <Badge variant="outline" className={`${styles[status] || styles["PENDIENTE"]} font-medium`}>
      {labels[status] || "Pendiente"}
    </Badge>
  );
};



function getCierreLabel(meta) {
  const rule = meta.reglaCierre || "promedio";
  if (rule === "promedio") return "Promedio";
  if (rule === "cierre_unico") return "Cierre Único";
  if (rule === "umbral_periodos") return `Umbral (${meta.umbralPeriodos || "?"} per.)`;
  return rule.charAt(0).toUpperCase() + rule.slice(1);
}

// === Objective Card Component (Refined) ===
const ObjectiveCard = ({ obj, currentPeriod, expanded, onToggle }) => {
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);

  useEffect(() => {
    setSelectedPeriod(currentPeriod);
  }, [currentPeriod]);

  // Find current hito for the selected period
  const currentHito = obj.hitos?.find(h => h.periodo === selectedPeriod);
  const hasResult = currentHito?.actual !== null && currentHito?.actual !== undefined;

  // Helper for hito status color
  const getHitoColorClass = (h) => {
    if (h.actual !== null) return "bg-emerald-50 border-emerald-200 text-emerald-700";
    if (h.periodo === currentPeriod) return "bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-300";
    return "bg-slate-50 border-slate-100 text-slate-400";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Card Header (Clickable for Expand/Collapse) */}
      <div
        className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-normal flex items-center gap-1">
                <Hourglass className="w-3 h-3" /> {obj.frecuencia || "Anual"}
              </Badge>
              <span>Peso: <span className="font-bold text-slate-700">{obj.peso}%</span></span>
            </div>
            <h4 className="font-bold text-slate-800 text-base leading-tight">{obj.nombre}</h4>
          </div>
          <div className="text-right min-w-[80px] flex flex-col items-end">
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-black ${obj.progreso > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                {Math.round(obj.progreso)}%
              </div>
              {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Resultado</div>
          </div>
        </div>

        {/* Cronograma de Hitos (Always Visible or Collapsible? User said "objetivos deberian poder colapzar") 
            Let's keep the header visible and collapse the details below.
        */}
      </div>

      {/* Collapsible Content */}
      {expanded && (
        <div className="px-5 pb-5 animate-in slide-in-from-top-2">
          {/* Cronograma de Hitos (Boxes) */}
          <div className="mb-6 border-t border-slate-100 pt-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-wider">Cronograma de Hitos</label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {obj.hitos?.map((h) => {
                const colorClass = getHitoColorClass(h);
                const isSelected = h.periodo === selectedPeriod;
                // Compute the real % score for this hito using the same logic as EvaluacionFlujo
                const hitoScore = h.actual !== null && h.actual !== undefined
                  ? (() => {
                    const prog = calculateObjectiveProgress(obj, [h]);
                    return prog !== null && prog !== undefined ? Math.round(prog) : Math.round(h.actual);
                  })()
                  : null;
                return (
                  <div
                    key={h.periodo}
                    onClick={(e) => { e.stopPropagation(); setSelectedPeriod(h.periodo); }}
                    className={`flex flex-col items-center justify-center p-2 rounded border min-w-[70px] transition-all cursor-pointer ${colorClass} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <span className="text-[10px] font-bold uppercase">{h.periodo}</span>
                    <span className="text-xs font-semibold">{hitoScore !== null ? `${hitoScore}%` : "-"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Period Evaluation Box */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Evaluando Período:</span>
                <Badge className="bg-slate-900 text-white hover:bg-slate-800">{selectedPeriod}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Score Hito:</span>
                <span className={`text-lg font-bold ${hasResult ? 'text-emerald-600' : 'text-slate-300'}`}>
                  {hasResult ? (() => {
                    const prog = calculateObjectiveProgress(obj, [currentHito]);
                    return `${Number(prog ?? currentHito.actual).toFixed(1)}%`;
                  })() : "0%"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Metas / KPI */}
              {/* Metas / KPI */}
              <div className="space-y-3">
                {currentHito?.metas?.map((meta, idx) => {
                  const isAcumulativo = obj.metas?.[idx]?.modoAcumulacion === "acumulativo";
                  let valorEvaluado = meta.resultado;

                  if (isAcumulativo) {
                    const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];
                    const currentIdx = periodOrder.indexOf(selectedPeriod);
                    if (currentIdx !== -1) {
                      valorEvaluado = obj.hitos?.reduce((acc, h) => {
                        const hIdx = periodOrder.indexOf(h.periodo);
                        if (hIdx !== -1 && hIdx <= currentIdx) {
                          const m = h.metas?.find(m => (m.metaId === meta.metaId || m._id === meta._id)); // Robust ID check
                          return acc + Number(m?.resultado || 0);
                        }
                        return acc;
                      }, 0);
                    }
                  }

                  return (
                    <div key={idx} className="pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="text-sm text-slate-700 font-medium mb-1">{meta.nombre || "Meta sin descripción"}</div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 items-center">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-semibold">
                          Meta: {meta.esperado !== null ? meta.esperado : "N/A"} {meta.unidad}
                        </span>

                        {/* Closure Rule - ALWAYS VISIBLE */}
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-semibold">
                          {getCierreLabel(meta)}
                        </span>

                        {isAcumulativo && (
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 font-semibold">
                            Acumulativo
                          </span>
                        )}

                        {meta.permiteOver && (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 font-semibold">
                            Over
                          </span>
                        )}

                        {meta.reconoceEsfuerzo && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-semibold">Reconoce Esfuerzo</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(!currentHito?.metas || currentHito.metas.length === 0) && (
                  <div className="text-sm text-slate-400 italic">Sin metas definidas para este hito.</div>
                )}
              </div>

              {/* Result Input Display (Read Only - Shows RAW VALUE now) */}
              <div className="flex justify-end">
                <div className="w-32">
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Resultado Final</label>
                  <div className="h-9 w-full rounded border border-slate-200 bg-slate-50 flex items-center px-3 text-sm text-slate-600 font-bold">
                    {(() => {
                      // Find the primary meta result to display as "The Value"
                      // Assuming single-meta per objective is the dominant pattern for this view
                      const primaryMeta = currentHito?.metas?.[0];
                      if (primaryMeta && primaryMeta.resultado !== null) {
                        const rawVal = Number(primaryMeta.resultado);
                        const displayVal = Number.isInteger(rawVal) ? rawVal : rawVal.toFixed(1);
                        return `${displayVal} ${primaryMeta.unidad || ""}`;
                      }
                      // Fallback to actual score if no meta result found (legacy)
                      // But label clearly if it is a score
                      return hasResult ? `${Number(currentHito.actual).toFixed(1)}%` : "—";
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Evaluator Comment */}
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Comentario del Evaluador</label>
            <p className="text-sm text-slate-600 italic leading-relaxed">
              {currentHito?.comentario || "Sin comentarios."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default function MiDesempeno() {
  const { user } = useAuth();
  const empleadoNombre = user?.empleado?.nombre || user?.empleadoId?.nombre || user?.nombre || "Colaborador";
  const empleadoId = user?.empleado?._id || user?.empleadoId?._id || user?.empleadoId || user?._id;

  const avatarSrc = useMemo(() => fotoSrc(user?.empleado), [user?.empleado?.fotoUrl]);

  const [data, setData] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState({}); // { [id]: boolean }

  // Refs for scrolling
  const sectionFeedbackRef = useRef(null);
  const sectionDetailsRef = useRef(null);
  const sectionValidationRef = useRef(null);

  // Estado local para comentarios/ack antes de guardar
  const [localComment, setLocalComment] = useState("");
  const [localAck, setLocalAck] = useState(null);
  const [localReason, setLocalReason] = useState(""); // Motivo de desacuerdo

  // New State for Redesign
  const [activeTab, setActiveTab] = useState("obj"); // "obj" | "comp"
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [viewPeriod, setViewPeriod] = useState(null); // For chart interaction
  const [showGraph, setShowGraph] = useState(false); // Collapsible graph state
  const [showFinalReport, setShowFinalReport] = useState(false);
  const [globalAvisos, setGlobalAvisos] = useState([]);

  // TOUR CONFIG
  const tourSteps = useMemo(() => [
    { element: '#tour-kpi-summary', popover: { title: 'Resumen de Resultados', description: 'Aquí podés ver rápidamente tu puntaje general, desglosado por Objetivos (70%) y Competencias (30%).' } },
    { element: '#tour-avisos-section', popover: { title: 'Avisos y Novedades', description: 'Este panel te notificará sobre fechas límite, alertas de acción y comunicaciones importantes de RRHH.' } },
    { element: '#tour-tabs-sections', popover: { title: 'Secciones', description: 'Navegá entre tus Objetivos y Competencias para ver el detalle de cada evaluación.' } },
    { element: '#tour-sidebar-nav', popover: { title: 'Navegación Rápida', description: 'Usá este menú para saltar rápidamente a los resultados, detalles de objetivos o la sección de conformidad.' } },
    { element: '#tour-feedback-status', popover: { title: 'Comentarios del Líder', description: 'Revisá el estado de tu feedback actual y los comentarios dejados por tu evaluador.' } },
    { element: '#tour-feedback-timeline', popover: { title: 'Línea de Tiempo', description: 'Hacé clic en los periodos (Q1, Q2...) para ver tu evolución y las fechas límite de cada etapa.' } },
    { element: '#tour-conformidad-section', popover: { title: 'Tu Conformidad', description: 'Aquí podés dar tu conformidad o indicar desacuerdo con la evaluación. También podés dejar comentarios finales para RRHH.' } },
    { element: '#tour-flow-status', popover: { title: 'Estado del Flujo', description: 'Visualizá en qué etapa se encuentra tu evaluación dentro del proceso formal de la compañía.' } }
  ], []);

  const { startTour } = useTour(tourSteps);

  // Year Selection Logic
  const [selectedYear, setSelectedYear] = useState(() => {
    return getCurrentFiscalYear();
  });



  // 1. Cargar Dashboard (Objetivos/Aptitudes)
  const fetchDash = useCallback(async () => {
    if (!empleadoId) return;
    try {
      setLoading(true);
      const res = await dashEmpleado(empleadoId, selectedYear);
      if (res) {
        const normalized = { ...res };
        if (normalized.objetivos?.items && !Array.isArray(normalized.objetivos)) {
          normalized.objetivos = normalized.objetivos.items;
        }
        if (normalized.aptitudes?.items && !Array.isArray(normalized.aptitudes)) {
          normalized.aptitudes = normalized.aptitudes.items;
        }
        setData(normalized);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }, [empleadoId, selectedYear]);

  // 2. Cargar Feedbacks
  const fetchFeedbacks = useCallback(async () => {
    if (!empleadoId) return;
    try {
      const res = await api(`/feedbacks/empleado/${empleadoId}?year=${selectedYear}`);
      const fetched = Array.isArray(res) ? res : [];



      // Generar lista completa de 4 periodos para asegurar que siempre se vean
      const periods = ["Q1", "Q2", "Q3", "FINAL"];

      const fullList = periods.map(p => {
        const found = fetched.find(f => f.periodo === p);
        if (found) return found;

        // Si no existe, crear placeholder
        return {
          _id: `placeholder-${p}`,

          periodo: p,
          year: selectedYear,
          estado: "PENDIENTE",
          comentario: "",
          isPlaceholder: true
        };
      });

      setFeedbacks(fullList);

      // Seleccionar el primero si no hay selección
      if (fullList.length > 0 && !selectedFeedback) {
        // Intentar seleccionar el más reciente que no sea placeholder, o el primero
        const lastReal = [...fullList].reverse().find(f => !f.isPlaceholder);
        setSelectedFeedback(lastReal || fullList[0]);
      }
    } catch (err) {
      console.error("Error fetching feedbacks:", err);
    }
  }, [empleadoId, selectedFeedback, selectedYear]);

  useEffect(() => {
    fetchDash();
    fetchFeedbacks();
    // Fetch Active Avisos
    api(`/avisos/my`).then(res => {
      if (Array.isArray(res)) setGlobalAvisos(res);
    }).catch(err => console.error("Error loading avisos", err));
  }, [fetchDash, fetchFeedbacks, selectedYear]);

  // Sincronizar estado local al cambiar selección
  useEffect(() => {
    if (selectedFeedback) {
      setLocalComment(selectedFeedback.comentarioEmpleado || "");
      setLocalAck(selectedFeedback.empleadoAck?.estado || null);
      setLocalReason(selectedFeedback.motivoDesacuerdo || "");
    }
  }, [selectedFeedback]);



  // Helper to convert period to a comparable month index (1-12) based on Fiscal Year (Sep-Aug)
  const getPeriodMonth = useCallback((periodStr) => {
    if (!periodStr) return 0;
    if (periodStr === "Q1") return 3;   // Sep-Nov
    if (periodStr === "Q2") return 6;   // Dec-Feb
    if (periodStr === "Q3") return 9;   // Mar-May
    if (periodStr === "FINAL") return 12; // Jun-Aug

    let suffix = periodStr;
    if (periodStr.length > 4 && !isNaN(periodStr.slice(0, 4))) {
      suffix = periodStr.slice(4);
    }

    if (suffix.startsWith("M")) {
      const m = parseInt(suffix.slice(1));
      return m >= 9 ? m - 8 : m + 4;
    }
    if (suffix.startsWith("Q")) {
      const q = parseInt(suffix.slice(1));
      return q * 3;
    }
    if (suffix.startsWith("S")) {
      const s = parseInt(suffix.slice(1));
      return s * 6;
    }
    if (suffix === "FINAL" || suffix.endsWith("FINAL")) return 12;
    return 12;
  }, []);

  // Calcular resultados para el periodo seleccionado (USANDO LOGICA MANAGER)
  const periodResults = useMemo(() => {
    if (!data || !selectedFeedback) return { objetivos: [], aptitudes: [], scores: { obj: 0, comp: 0, global: 0 } };
    const p = selectedFeedback.periodo;

    const feedbackLimit = getPeriodMonth(p);
    const previousLimit = feedbackLimit - 3;

    // Objetivos
    let totalObjScore = 0;
    let totalObjWeight = 0;
    let maxActiveObjWeight = 0;
    const timeFraction = Math.min(feedbackLimit / 12, 1);
    const objetivos = [];

    data.objetivos?.forEach(obj => {
      const relevantHitos = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
      let score = 0;
      let hitoActual = null;

      // Find hito specifically for this feedback period to display in the card
      const hitoPeriodo = obj.hitos?.find(h => {
        if (!h.periodo) return false;
        if (h.periodo === p) return true;
        if (h.periodo.endsWith(p)) return true;
        if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
        return false;
      });

      if (relevantHitos.length > 0) {
        // Use Shared Utility for consistent calculation (supports Umbral, Esfuerzo, etc.)
        score = calculateObjectiveProgress(obj, relevantHitos);

        // Max Weight is FULL weight (Annual Potential), regardless of period
        // This avoids "Result > Max" if user is over-performing in Q1
        maxActiveObjWeight += (obj.peso || 0);
      }

      // calculateObjectiveProgress already handles PermiteOver and limits, 
      // but ensure we respect the global expected range if needed.
      // Actually, effectiveScore is just 'score' now.
      const effectiveScore = score;

      totalObjScore += effectiveScore * (obj.peso || 0);
      totalObjWeight += (obj.peso || 0); // Should sum to 100 ideally

      objetivos.push({
        ...obj,
        hitoActual: hitoPeriodo, // For display in card
        scorePeriodo: effectiveScore, // Calculated score up to this period (Weighted by PermiteOver)
        rawScore: score // The raw progress (0-100+) for display
      });
    });

    const scoreObjRaw = totalObjWeight > 0 ? (totalObjScore / totalObjWeight) : 0; // Normalize by actual weight sum
    const scoreObj = scoreObjRaw * 0.7; // Weighted contribution (Max 70)

    // Competencias (Centralizado y Ponderado)
    const aptitudes = [];
    data.aptitudes?.forEach(apt => {
        const relevantHitos = apt.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
        let score = 0;
        const puntuaciones = relevantHitos.map(h => h.actual).filter(val => val !== null && val !== undefined);
        if (puntuaciones.length > 0) {
            score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
        }
        const hitoPeriodo = apt.hitos?.find(h => h.periodo === p);
        aptitudes.push({ ...apt, hitoActual: hitoPeriodo, scorePeriodo: score });
    });

    const scoreCompRaw = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, feedbackLimit);
    const scoreComp = scoreCompRaw * 0.3; // Weighted contribution (Max 30)

    const global = scoreObj + scoreComp;

    // Adjust for display (0-100 scale for individual sections)
    // User wants WEIGHTED scores to match Manager View (e.g. 58% + 24% = 82%)
    const displayObj = scoreObj;
    const displayComp = scoreComp;
    const displayGlobal = global;

    // Calculate Max Possible (Context for user)
    // For Objectives: Sum of weights of ACTIVE objectives * 70 (Max Contribution) / 100 (Total Weight Base)
    // For Competencies: If there are ANY active competencies, Max is 30 (since it's an average).
    // For Objectives: Sum of weights of ACTIVE objectives * 70 (Max Contribution) / 100 (Total Weight Base)
    // For Cumulative objectives, Max Contribution is weighted by time passed (e.g. Q1 = 25% of annual).
    const maxObj = (maxActiveObjWeight / 100) * 70;
    const maxComp = aptitudes.length > 0 ? 30 : 0; // Fixed 30% potential if any data exists

    // Expected Scores Calculation
    let expectedObjScore = 0;

    data.objetivos?.forEach(obj => {
      const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
      const factor = isCumulative ? timeFraction : 1;

      expectedObjScore += (obj.peso || 0) * factor;
    });

    // Normalize Expected to 70% scale
    // If total active weight is less than 100, this might need adjustment, but assuming 100% weight distribution:
    const expectedObjDisplay = (expectedObjScore / 100) * 70;

    // Competencies: Expected is always 100% (perform at level) => 30% weighted
    const expectedCompDisplay = aptitudes.length > 0 ? 30 : 0;

    return {
      objetivos,
      aptitudes,
      scores: {
        obj: displayObj,
        comp: displayComp,
        global: displayGlobal
      },
      maxScores: {
        obj: maxObj,
        comp: maxComp,
        global: maxObj + maxComp
      },
      expectedScores: { // [NEW] For "Esperado" reference
        obj: expectedObjDisplay,
        comp: expectedCompDisplay,
        global: expectedObjDisplay + expectedCompDisplay
      },
      sparklineData: (() => {
        // Generate historical data for sparklines
        const timeline = ["Q1", "Q2", "Q3", "FINAL"];
        return timeline.map(tPeriod => {
          const limit = getPeriodMonth(tPeriod);
          // limit must be <= current feedback limit to show history up to this point? 
          // Or show FULL history available? User probably wants to see evolution.
          // Let's show full available history from 'data'.

          const relevantLimit = getPeriodMonth(tPeriod);

          // Calc Obj
          let tObjScore = 0;
          let tObjWeight = 0;
          data.objetivos?.forEach(o => {
            const rh = o.hitos?.filter(h => getPeriodMonth(h.periodo) <= relevantLimit) || [];
            if (rh.length > 0) {
              const prog = calculateObjectiveProgress(o, rh);
              tObjScore += calculateWeightedScore(prog, o.peso || 0);
            }
          });
          const rawObj = tObjScore;

          // Calc Comp (Weighted)
          const rawComp = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, relevantLimit);

          return {
            name: tPeriod === "FINAL" ? "Fin" : tPeriod,
            obj: rawObj * 0.7, // As weighted
            comp: rawComp * 0.3,
            global: (rawObj * 0.7) + (rawComp * 0.3)
          };
        });
      })()
    };


  }, [data, selectedFeedback, getPeriodMonth]);

  // Auto-select first item when results change
  useEffect(() => {
    if (periodResults) {
      if (activeTab === "obj" && periodResults.objetivos.length > 0) {
        if (!selectedItemId || !periodResults.objetivos.find(o => o._id === selectedItemId)) {
          setSelectedItemId(periodResults.objetivos[0]._id);
        }
      } else if (activeTab === "comp" && periodResults.aptitudes.length > 0) {
        if (!selectedItemId || !periodResults.aptitudes.find(a => a._id === selectedItemId)) {
          setSelectedItemId(periodResults.aptitudes[0]._id);
        }
      }
    }
  }, [periodResults, activeTab]);

  // Reset viewPeriod when item changes
  useEffect(() => {
    setViewPeriod(null);
  }, [selectedItemId, activeTab, selectedFeedback]);

  // Guardar respuesta (Ack/Comment)
  const handleSaveResponse = async () => {
    if (!selectedFeedback) return;

    // Validar comentario obligatorio si está en desacuerdo
    if (localAck === "CONTEST") {
      if (!localComment.trim()) {
        toast.error("Para indicar desacuerdo, es obligatorio ingresar un comentario justificativo.");
        return;
      }
      if (!localReason) {
        toast.error("Por favor, seleccioná un motivo de desacuerdo.");
        return;
      }
    }

    if (!window.confirm("¿Seguro desea enviar su devolución? Una vez enviada no podrá modificarla.")) return;
    try {
      const payload = {
        empleado: empleadoId,
        year: selectedFeedback.year,
        periodo: selectedFeedback.periodo,
        estado: selectedFeedback.estado === "SENT" ? "PENDING_HR" : selectedFeedback.estado,
        comentario: selectedFeedback.comentario,
        comentarioEmpleado: localComment,
        empleadoAck: {
          estado: localAck,
          fecha: new Date()
        },
        motivoDesacuerdo: localAck === "CONTEST" ? localReason : null
      };

      await api("/feedbacks", {
        method: "POST",
        body: payload
      });

      toast.success("Respuesta enviada a RRHH correctamente.");
      fetchFeedbacks();
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar respuesta.");
    }
  };

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollToSection = (ref) => {
    const yOffset = -100; // Offset for sticky header
    const element = ref.current;
    if (element) {
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const renderDetailView = () => {
    const item = activeTab === 'obj'
      ? periodResults.objetivos.find(o => o._id === selectedItemId)
      : periodResults.aptitudes.find(a => a._id === selectedItemId);

    if (!item) return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Target className="w-12 h-12 mb-4 opacity-20" />
        <p>Seleccioná un ítem para ver el detalle.</p>
      </div>
    );

    // Determine Display Period and Active Months for Highlighting
    const isMonthly = item.frecuencia?.toLowerCase().includes("mensual");
    let displayPeriod = viewPeriod;
    let activeMonths = [];

    // Map Quarters to Months (Fiscal Year: Sep-Aug)
    const periodMonthsMap = {
      "Q1": ["M09", "M10", "M11"],
      "Q2": ["M12", "M01", "M02"],
      "Q3": ["M03", "M04", "M05"],
      "FINAL": ["M06", "M07", "M08"]
    };

    if (!displayPeriod) {
      if (isMonthly && (selectedFeedback.periodo.startsWith("Q") || selectedFeedback.periodo === "FINAL")) {
        // Handle "2025Q1" -> "Q1"
        let suffix = selectedFeedback.periodo;
        if (suffix.length > 4 && /^\d{4}/.test(suffix)) {
          suffix = suffix.slice(4);
        }

        const targetMonths = periodMonthsMap[suffix] || [];

        // Identify the BEST hito to show:
        // Default to the END of the quarter (Standard expectation) 
        const qMapEnd = { "Q1": "M11", "Q2": "M02", "Q3": "M05", "FINAL": "M08" };
        displayPeriod = qMapEnd[suffix] || "M11";

        // Try to find if we have a specific hito in this quarter that is LATEST?
        const relevantHitos = item.hitos?.filter(h => {
          if (!h.periodo) return false;
          return targetMonths.some(m => h.periodo.endsWith(m));
        });

        if (relevantHitos && relevantHitos.length > 0) {
          relevantHitos.sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo));
          displayPeriod = relevantHitos[relevantHitos.length - 1].periodo;
        }

        // Highlight ALL months in the quarter
        activeMonths = targetMonths;
      } else {
        displayPeriod = selectedFeedback.periodo;
        activeMonths = [selectedFeedback.periodo];
      }
    } else {
      // If user clicked a specific month/period
      activeMonths = [displayPeriod];
    }

    // Find the Hito for the Display Period (for the Detail Card below)
    const displayHito = item.hitos?.find(h => {
      if (!h.periodo) return false;
      if (h.periodo === displayPeriod) return true;
      if (h.periodo.endsWith(displayPeriod)) return true;
      if (displayPeriod === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
      return false;
    });

    // Prepare Graph Data
    const periods = isMonthly
      ? ["M09", "M10", "M11", "M12", "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"]
      : ["Q1", "Q2", "Q3", "FINAL"];

    const maxScore = activeTab === 'obj' ? (item.peso || 100) : 100;

    const graphData = periods.map(p => {
      // Determine if this is the currently viewed period (or part of the active range)
      const isSelected = activeMonths.some(m => p === m || p.endsWith(m));

      // Check visibility relative to the specific period's feedback
      let feedbackPeriod = p;
      if (isMonthly) {
        feedbackPeriod = Object.keys(periodMonthsMap).find(key => periodMonthsMap[key].some(m => p.endsWith(m))) || p;
      }

      const periodFeedback = feedbacks.find(f => f.periodo === feedbackPeriod || f.periodo.endsWith(feedbackPeriod));
      const isVisible = periodFeedback && ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(periodFeedback.estado);

      // Determine Relevant Hitos for this point in time (Cumulative Evolution)
      let rawScore = 0;
      let weightedScore = 0;

      if (activeTab === 'obj') {
        const limitByPeriod = getPeriodMonth(p);
        const relevantHitos = item.hitos?.filter(h => getPeriodMonth(h.periodo) <= limitByPeriod) || [];

        if (relevantHitos.length > 0) {
          // Calculate status AS OF this period
          const prog = calculateObjectiveProgress(item, relevantHitos);

          // For display, we want the Weighted Score (Contribution to Global)
          // maxScore is item.peso
          weightedScore = calculateWeightedScore(prog, item.peso || 0);

          // Raw Score is the % achievement (0-100+)
          rawScore = prog;
        }
      } else {
        // Competencies: Keep per-period or implement running average?
        // Defaulting to "Per Period" raw value for now as it's more standard for competencies
        // But to be safe vs "Evolution", a running average might be better?
        // Let's keep it simple: Per period value (Raw).
        // If the user wants Evolution of Average, we'd need running avg.
        // Current behavior was: find hito for p.
        const h = item.hitos?.find(h => {
          if (!h.periodo) return false;
          if (h.periodo === p) return true;
          if (h.periodo.endsWith(p)) return true;
          if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
          return false;
        });
        rawScore = h?.actual ?? 0;
        weightedScore = rawScore; // Competencies don't scale by weight in the chart usually (0-100 scale)
      }

      // If NOT visible, show 0? Or show partial if we want?
      // User requirement: "no me carga el resultado" implies visibility check.

      return {
        name: p,
        score: isVisible ? weightedScore : 0,
        rawScore: isVisible ? rawScore : 0,
        meta: maxScore,
        isCurrent: isSelected,
        isVisible
      };
    });



    // Check global visibility inside renderDetailView
    const showScores = ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(selectedFeedback?.estado);
    const metaLabel = activeTab === 'obj' ? `Meta: ${maxScore}%` : `Meta: ${maxScore}%`;

    // Recalculate progress using the UPDATED logic (important for umbral: binary per period, no partial credit within period)
    // Pass only hitos up to and including displayPeriod for an accurate "as of this period" snapshot.
    const hitosUpToDisplay = item.hitos?.filter(h => h.periodo && getPeriodMonth(h.periodo) <= getPeriodMonth(displayPeriod)) || [];
    const recalcProgress = showScores && activeTab === 'obj' && hitosUpToDisplay.length > 0
      ? calculateObjectiveProgress(item, hitosUpToDisplay)
      : null;

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header - Clean & Simple */}
        <div>
          <h2 className="font-heading text-lg font-bold text-zinc-800">{item.nombre}</h2>
          {item.descripcion && <p className="text-sm text-zinc-500 mt-1 font-medium">{item.descripcion}</p>}
        </div>

        {/* Flattened Detail View */}
        <div className="space-y-6">
          {/* Section Header */}
          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
            <div>
              <h4 className="font-bold text-zinc-700 flex items-center gap-2 text-base">
                <Calendar className="w-5 h-5 text-zinc-400" />
                <span>
                  Detalle {displayPeriod}
                  {isMonthly && (
                    <span className="text-sm font-normal text-zinc-500 ml-2">
                      ({(() => {
                        if (!displayPeriod.includes('M')) return selectedFeedback?.periodo;
                        const m = parseInt(displayPeriod.split('M')[1]);
                        if (m >= 9 && m <= 11) return "Q1";
                        if (m === 12 || m <= 2) return "Q2";
                        if (m >= 3 && m <= 5) return "Q3";
                        return "FINAL";
                      })()})
                    </span>
                  )}
                </span>
              </h4>
              <div className="text-xs text-zinc-500 mt-1">Desglose de objetivos y resultados</div>
            </div>

            {showScores ? (
              <div className="flex flex-col items-end">
                <span className="text-3xl font-extrabold text-zinc-800 tracking-tight">
                  {recalcProgress !== null
                    ? Number(recalcProgress).toFixed(1)
                    : (typeof displayHito?.actual === 'number' ? Number(displayHito.actual).toFixed(1) : (displayHito?.actual ?? 0))
                  }%
                </span>
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mt-1">Cumplimiento Acumulado</span>
              </div>
            ) : (
              <span className="text-2xl text-zinc-600 font-bold">--</span>
            )}
          </div>

          {/* Metas List - DIRECT CARDS (No nested containers) */}
          <div className="space-y-6">
            {activeTab === 'obj' && item.metas?.length > 0 ? (
              item.metas.map((metaDef, idx) => {
                // Try to find the result in the displayHito
                const metaResult = displayHito?.metas?.find(m => (m.metaId === metaDef._id || m._id === metaDef._id || m.nombre === metaDef.nombre));

                // Fallback to metaDef info if result not found
                const isAcumulativo = metaDef?.modoAcumulacion === "acumulativo";

                let valorEvaluado = metaResult?.resultado;

                // Calculate Cumulative if needed and not present
                if (isAcumulativo) {
                  const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];
                  const currentIdx = periodOrder.indexOf(displayPeriod);

                  if (currentIdx !== -1) {
                    valorEvaluado = item.hitos?.reduce((acc, h) => {
                      const hIdx = periodOrder.indexOf(h.periodo);
                      if (hIdx !== -1 && hIdx <= currentIdx) {
                        const m = h.metas?.find(m => (m.metaId === metaDef._id || m._id === metaDef._id || m.nombre === metaDef.nombre));
                        return acc + Number(m?.resultado || 0);
                      }
                      return acc;
                    }, 0);
                  }
                }
                const target = metaResult?.esperado ?? metaDef?.target ?? 0;
                const isLessBetter = metaDef?.operador === '<=' || metaDef?.operador === '<';

                // Compliance Calculation respects Operator
                let rawCompliance = 0;
                if (target > 0) {
                  if (isLessBetter) {
                    // For <=, Lower is Better. 
                    // If value is 0, compliance is infinite/max? Let's cap?
                    // Standard Formula: (Target / Value) * 100?
                    // Or linear interp? 
                    // Usually for tickets: Target 30. Value 15.
                    // 15 is 100% of 15? No.
                    // Value 30 is 100%. Value 0 is 200%?
                    // Let's use: ((Target - (Value - Target)) / Target) * 100? No.
                    // Simple inversion: (Target / (Value || 1)) * 100.
                    // If Value <= Target, Compliance >= 100%.
                    rawCompliance = valorEvaluado > 0 ? (target / valorEvaluado) * 100 : 100; // If 0 tickets, 100% (or more)
                    if (valorEvaluado === 0) rawCompliance = 100; // Treat 0 as perfect compliance?
                  } else {
                    // >= (Default)
                    rawCompliance = (valorEvaluado / target) * 100;
                  }
                }

                const clampedCompliance = Math.min(Math.max(rawCompliance, 0), 100);
                const isSuccess = isLessBetter ? (valorEvaluado <= target) : (valorEvaluado >= target);

                return (
                  <div key={idx} className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all">

                    {/* ── HEADER ─────────────────────────────────────────────── */}
                    <div className="flex justify-between items-center px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Target className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-800">{metaDef?.nombre}</h3>
                      </div>
                      <span className="text-[10px] bg-blue-50 border border-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0 ml-4 whitespace-nowrap">
                        {getCierreLabel(metaDef)}
                      </span>
                    </div>

                    {/* ── BODY: Config | Result ───────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">

                      {/* LEFT: Config table */}
                      <div className="lg:col-span-2 p-5">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.12em] mb-3">Configuración de evaluación</p>

                        {/* Uniform rows */}
                        <table className="w-full text-xs border-collapse">
                          <tbody>
                            {/* Meta / Objetivo */}
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold w-28 align-top text-[11px]">Objetivo</td>
                              <td className={`py-1.5 font-bold text-[11px] ${isLessBetter ? 'text-amber-600' : 'text-emerald-700'}`}>
                                {metaDef?.operador || ">="} {target} <span className="text-zinc-400 font-medium">{metaDef?.unidad || "puntos"}</span>
                              </td>
                            </tr>

                            {/* Dirección */}
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Dirección</td>
                              <td className="py-1.5 text-zinc-700 font-medium text-[11px]">
                                {isLessBetter ? "Minimizar (menor es mejor)" : "Maximizar (mayor es mejor)"}
                              </td>
                            </tr>

                            {/* Acumulación */}
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Acumulación</td>
                              <td className="py-1.5 text-zinc-700 font-medium text-[11px]">
                                {metaDef?.modoAcumulacion === "acumulativo" ? "Acumulativo (suma período a período)" : "Por período (evaluación independiente)"}
                              </td>
                            </tr>

                            {/* Regla de cierre */}
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold w-28 align-top text-[11px]">Regla cierre</td>
                              <td className="py-1.5 text-zinc-700 font-medium text-[11px]">
                                {metaDef?.reglaCierre === "umbral_periodos"
                                  ? `Umbral: cumplir ${metaDef.umbralPeriodos || "?"} de ${item.hitos?.length || "?"} períodos`
                                  : metaDef?.reglaCierre === "cierre_unico"
                                    ? "Cierre único (se evalúa al final)"
                                    : "Promedio de todos los períodos"}
                              </td>
                            </tr>

                            {/* Tolerancia (solo si > 0) */}
                            {(metaDef?.tolerancia ?? 0) > 0 && (
                              <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                                <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Tolerancia</td>
                                <td className="py-1.5 text-zinc-700 font-medium text-[11px]">±{metaDef.tolerancia} {metaDef?.unidad || ""}</td>
                              </tr>
                            )}

                            {/* Esfuerzo parcial */}
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Esfuerzo parcial</td>
                              <td className={`py-1.5 font-medium text-[11px] ${metaDef?.reconoceEsfuerzo ? 'text-amber-600' : 'text-zinc-500'}`}>
                                {metaDef?.reconoceEsfuerzo
                                  ? metaDef?.reglaCierre === "umbral_periodos"
                                    ? "Sí (por cantidad de períodos cumplidos, no por avance interno)"
                                    : "Sí (se valora el progreso parcial)"
                                  : "No (todo o nada)"}
                              </td>
                            </tr>

                            {/* Cap */}
                            <tr>
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Tope máximo</td>
                              <td className={`py-1.5 font-medium text-[11px] ${metaDef?.permiteOver ? 'text-emerald-600' : 'text-zinc-500'}`}>
                                {metaDef?.permiteOver ? "Puede superar 100% (over compliance)" : "Tope en 100%"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* RIGHT: Result — stacked */}
                      <div className="lg:col-span-1 flex flex-col divide-y divide-zinc-200 border-l border-zinc-200">

                        {/* Result value */}
                        <div className="p-5 flex-1 flex flex-col justify-center">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.12em] mb-3">
                            Resultado obtenido
                            <span className="normal-case font-normal text-zinc-300 ml-1">({displayPeriod})</span>
                          </p>

                          {showScores ? (
                            <div className="flex flex-col gap-1.5">
                              <div className={`text-4xl font-black tracking-tighter leading-none ${isSuccess ? 'text-emerald-500' : 'text-zinc-800'}`}>
                                {valorEvaluado ?? "--"}
                                {metaDef?.unidad && <span className="text-base font-semibold text-zinc-400 ml-1">{metaDef.unidad}</span>}
                              </div>
                              <div className={`inline-flex items-center gap-1 text-[11px] font-bold ${isSuccess ? 'text-emerald-600' : 'text-orange-500'}`}>
                                {isSuccess
                                  ? <><CircleCheck className="w-3 h-3" /> Meta alcanzada</>
                                  : <><CircleAlert className="w-3 h-3" /> Debajo de la meta</>
                                }
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 text-zinc-300 py-4">
                              <Hourglass className="w-6 h-6 opacity-50" />
                              <span className="text-xs font-medium italic">Aún no disponible</span>
                            </div>
                          )}
                        </div>

                        {/* Progress */}
                        {showScores && (
                          <div className="px-5 py-4">
                            <div className="flex justify-between text-[9px] font-black uppercase text-zinc-400 tracking-wider mb-2">
                              <span>Cumplimiento del período</span>
                              <span className={isSuccess ? 'text-emerald-600' : 'text-orange-500'}>{Math.round(clampedCompliance)}%</span>
                            </div>
                            <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${isSuccess ? 'bg-emerald-500' : 'bg-orange-400'}`}
                                style={{ width: `${clampedCompliance}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-1.5">
                              {isSuccess
                                ? `✓ Alcanzó la meta de ${target} ${metaDef?.unidad || ''}`
                                : `Faltan ${Math.round(Math.abs(target - (valorEvaluado ?? 0)))} ${metaDef?.unidad || ''} para la meta`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── PERÍODO EVALUADO ────────────────────────────────────── */}
                    {showScores && (
                      <div className="border-t border-zinc-100 px-5 py-4 bg-zinc-50/40">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> Período Evaluado — seleccioná un mes para ver detalle
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const feedbackLimitMonth = getPeriodMonth(selectedFeedback.periodo);
                            const historyHitos = item.hitos
                              ?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimitMonth)
                              .sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo)) || [];

                            if (historyHitos.length === 0) return <span className="text-[10px] text-zinc-400 italic">Sin historial previo.</span>;

                            return historyHitos.map((h, hIdx) => {
                              const hMeta = h.metas?.find(m => m.metaId === metaDef?._id || m._id === metaDef?._id || m.nombre === metaDef?.nombre);
                              const hVal = hMeta?.resultado;
                              const isCurrentH = h.periodo === displayPeriod;
                              const displayVal = hVal !== undefined && hVal !== null ? hVal : "–";
                              const metOk = typeof displayVal === 'number' && (isLessBetter ? displayVal <= target : displayVal >= target);

                              return (
                                <button
                                  key={hIdx}
                                  onClick={() => setViewPeriod(h.periodo)}
                                  title={`Período ${h.periodo}: ${displayVal} ${metaDef?.unidad || ''}`}
                                  className={`flex flex-col items-center justify-center min-w-[52px] px-2.5 py-2 rounded-lg border-2 transition-all text-center
                                    ${isCurrentH
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:shadow-sm'
                                    }`}
                                >
                                  <span className={`text-[8px] font-bold uppercase tracking-wider mb-0.5 ${isCurrentH ? 'text-blue-200' : 'text-zinc-400'}`}>
                                    {h.periodo.replace(/^\d{4}/, '')}
                                  </span>
                                  <span className={`text-xs font-black leading-none
                                    ${isCurrentH ? 'text-white' : metOk ? 'text-emerald-600' : (typeof displayVal === 'number' ? 'text-orange-500' : 'text-zinc-400')}`}>
                                    {displayVal}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : activeTab === 'comp' || activeTab !== 'obj' ? (
              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all mb-6">
                <div className="border-t border-zinc-100 px-5 py-4 bg-zinc-50/40">
                  <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Historial de Evaluaciones
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const feedbackLimitMonth = getPeriodMonth(selectedFeedback.periodo);
                      const historyHitos = item.hitos
                        ?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimitMonth)
                        .sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo)) || [];

                      if (historyHitos.length === 0) return <span className="text-[10px] text-zinc-400 italic">Sin historial previo.</span>;

                      return historyHitos.map((h, hIdx) => {
                        const hVal = h.actual;
                        const isCurrentH = h.periodo === displayPeriod;
                        const displayVal = hVal !== undefined && hVal !== null ? Number(hVal).toFixed(1) : "–";
                        const metOk = typeof hVal === 'number' && hVal >= 60; // Assuming 60% is a basic pass status for styling

                        return (
                          <button
                            key={hIdx}
                            onClick={() => setViewPeriod(h.periodo)}
                            title={`Período ${h.periodo}: ${displayVal}%`}
                            className={`flex flex-col items-center justify-center min-w-[52px] px-2.5 py-2 rounded-lg border-2 transition-all text-center
                              ${isCurrentH
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:shadow-sm'
                              }`}
                          >
                            <span className={`text-[8px] font-bold uppercase tracking-wider mb-0.5 ${isCurrentH ? 'text-indigo-200' : 'text-zinc-400'}`}>
                              {h.periodo.replace(/^\d{4}/, '')}
                            </span>
                            <span className={`text-xs font-black leading-none
                              ${isCurrentH ? 'text-white' : metOk ? 'text-emerald-600' : (typeof hVal === 'number' ? 'text-orange-500' : 'text-zinc-400')}`}>
                              {displayVal}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-400 italic text-sm">
                No hay metas detalladas para este hito.
              </div>
            )}
          </div>
        </div>

        {/* Comments */}
        {/* Evolution Graph (Moved to Bottom) */}
        <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setShowGraph(!showGraph)}
            className="w-full flex items-center justify-between p-4 text-xs font-semibold text-slate-500 uppercase hover:bg-slate-100 transition-colors"
          >
            <span>Evolución Anual vs Meta</span>
            {showGraph ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showGraph && (
            <div className="h-48 w-full p-4 pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={graphData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onClick={(data) => {
                    if (data && data.activeLabel) {
                      setViewPeriod(data.activeLabel);
                    }
                  }}
                >
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis hide domain={[0, maxScore]} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                    formatter={(value, name, entry) => {
                      return [
                        entry.payload.isVisible ? `${Math.round(value)}%` : '--',
                        name === 'score' ? 'Resultado Ponderado' : metaLabel
                      ];
                    }}
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <ReferenceLine
                    y={maxScore}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    label={{
                      position: 'right',
                      value: `${maxScore}%`,
                      fill: '#10b981',
                      fontSize: 9
                    }}
                  />
                  <Bar dataKey="score" radius={[2, 2, 0, 0]} maxBarSize={30} style={{ cursor: 'pointer' }}>
                    {graphData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isCurrent ? (activeTab === 'obj' ? '#2563eb' : '#d97706') : '#cbd5e1'}
                        className="transition-all duration-300 hover:opacity-80"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    );
  };

  if (!user) return <div className="p-6 text-center">Iniciá sesión.</div>;

  const timelineItems = useMemo(() => [
    {
      id: "Q1",
      label: "Noviembre",
      sub: "Inicio",
      date: `${selectedYear}-11-01`,
      actionMonth: "Diciembre",
      deadlines: { manager: "10-12", employee: "15-12", hr: "30-12" }
    },
    {
      id: "Q2",
      label: "Febrero",
      sub: "Seguimiento",
      date: `${selectedYear + 1}-02-01`,
      actionMonth: "Marzo",
      deadlines: { manager: "10-03", employee: "15-03", hr: "30-03" }
    },
    {
      id: "Q3",
      label: "Mayo",
      sub: "Seguimiento",
      date: `${selectedYear + 1}-05-01`,
      actionMonth: "Junio",
      deadlines: { manager: "10-06", employee: "15-06", hr: "30-06" }
    },
    {
      id: "FINAL",
      label: "Agosto",
      sub: "Cierre Anual",
      date: `${selectedYear + 1}-08-30`,
      actionMonth: "Septiembre",
      deadlines: { manager: "10-09", employee: "15-09", hr: "30-09" }
    }
  ], [selectedYear]);

  const evaluatorName = (() => {
    const creator = selectedFeedback?.creadoPor;
    if (!creator) return "Evaluador no asignado";

    // 1. Try linked employee (most accurate)
    if (creator.empleado?.nombre) {
      return `${creator.empleado.nombre} ${creator.empleado.apellido || ""}`.trim();
    }
    // 2. Try user name
    if (creator.nombre) {
      return `${creator.nombre} ${creator.apellido || ""}`.trim();
    }
    // 3. Try email
    if (creator.email) return creator.email;

    return "Evaluador no asignado";
  })();

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header Negro */}
      <div className="bg-slate-900 text-white pt-12 pb-24 px-4 md:px-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600 rounded-full blur-3xl opacity-20 -translate-x-1/2 translate-y-1/2"></div>

        <div className="max-w-[80%] mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row justify-between items-end gap-6 mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
              {/* Avatar with Gradient Ring */}
              <div className="relative group shrink-0">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative h-20 w-20 rounded-full overflow-hidden border-4 border-slate-900 bg-slate-800">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={empleadoNombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-slate-400 bg-slate-800">
                      {initialsFromUser(user)}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-3xl font-bold tracking-tight">Hola, {empleadoNombre}</h1>
                  <Button variant="outline" size="sm" onClick={startTour} className="gap-2 bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full h-8 px-4 text-xs">
                    <HelpCircle className="w-3.5 h-3.5" /> Tutorial
                  </Button>
                </div>
                <p className="text-slate-400 text-lg">Seguimiento de evaluaciones y feedback continuo</p>
              </div>
            </div>

            {/* HEADER METRICS & YEAR SELECTOR */}
            <div className="flex flex-col gap-4 items-end">

              {/* REPORT BUTTON */}
              {(feedbacks.some(f => f.periodo === "FINAL" && !f.isPlaceholder) || data?.evaluaciones?.some(e => e.periodo === "FINAL")) && (
                <div className="mb-0">
                  <Button
                    size="sm"
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-lg backdrop-blur-sm"
                    onClick={() => setShowFinalReport(true)}
                  >
                    <Trophy className="w-4 h-4 mr-2 text-yellow-300" />
                    Ver Resultado Anual
                  </Button>
                </div>
              )}

              {/* Year Selector */}
              <div className="flex items-center justify-end gap-3 text-white mb-2">
                <button
                  onClick={() => setSelectedYear(y => y - 1)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  title="Año anterior"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-black leading-none">{selectedYear}</div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Año Fiscal</div>
                </div>
                <button
                  onClick={() => setSelectedYear(y => y + 1)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  title="Siguiente año"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Glass Metrics Cards */}
              <div className="flex gap-3">
                {/* Card 1: Status */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-3 min-w-[140px] flex flex-col items-center justify-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Estado Actual</div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedFeedback?.estado === 'CLOSED' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]'}`} />
                    <span className="text-sm font-bold text-white">
                      {selectedFeedback?.estado === 'SENT' ? 'En Curso' :
                        selectedFeedback?.estado === 'PENDING_HR' ? 'En Revisión' :
                          selectedFeedback?.estado === 'CLOSED' ? 'Finalizado' : 'Pendiente'}
                    </span>
                  </div>
                </div>

                {/* Card 2: Next Action */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-3 min-w-[140px] flex flex-col items-center justify-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Próxima Acción</div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {selectedFeedback?.estado === 'SENT' ? (
                      <> <FileEdit className="w-3.5 h-3.5 text-amber-400" /> <span>Completar</span> </>
                    ) : selectedFeedback?.estado === 'PENDING_HR' ? (
                      <> <Hourglass className="w-3.5 h-3.5 text-slate-400" /> <span>Esperar RRHH</span> </>
                    ) : selectedFeedback?.estado === 'CLOSED' ? (
                      <> <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> <span>Revisar</span> </>
                    ) : (
                      <> <Calendar className="w-3.5 h-3.5 text-slate-400" /> <span>Programado</span> </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[80%] mx-auto px-4 md:px-8 -mt-16 relative z-20">
        {!loading && (!data || (!data.objetivos?.length && !data.aptitudes?.length)) ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Calendar className="w-10 h-10 text-slate-300" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">No hay Evaluaciones generadas para este Periodo</h2>
            <p className="text-slate-500 max-w-md mx-auto">
              No se encontraron objetivos ni competencias asignadas para el año fiscal seleccionado ({selectedYear}).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-8">

            {/* LEFT SIDEBAR: Navigation Only */}
            <div className="hidden lg:block space-y-2 sticky top-24 h-fit">
              <div id="tour-sidebar-nav" className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Panel de Navegación
                </h3>
                <div className="space-y-1">
                  <button
                    onClick={() => scrollToSection(sectionFeedbackRef)}
                    className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium text-sm"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Resultado Feedback
                  </button>
                  <button
                    onClick={() => scrollToSection(sectionDetailsRef)}
                    className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium text-sm"
                  >
                    <ListChecks className="w-4 h-4" />
                    Objetivos y Competencias
                  </button>
                  <button
                    onClick={() => scrollToSection(sectionValidationRef)}
                    className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium text-sm"
                  >
                    <FileSignature className="w-4 h-4" />
                    Conformidad
                  </button>
                </div>
              </div>


              {/* VERTICAL FLOW STATUS (Redesigned) */}
              {selectedFeedback && !selectedFeedback.isPlaceholder && (
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 shadow-sm transition-all animate-in slide-in-from-left-2 mt-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      Estado del Proceso
                    </div>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black tracking-wide">
                      {selectedFeedback.periodo}
                    </span>
                  </h3>

                  <div className="relative pl-1">
                    {/* Vertical Line */}
                    <div className="absolute left-[14px] top-3 bottom-4 w-0.5 bg-slate-100 -z-0"></div>

                    <div className="space-y-8 relative z-10">
                      {[
                        { label: "Borrador Inicia", status: "DRAFT", date: selectedFeedback.createdAt, icon: FileEdit, deadlineKey: "manager" },
                        { label: "Enviado a Vos", status: "SENT", date: selectedFeedback.submittedToEmployeeAt, icon: Send, deadlineKey: "employee" },
                        { label: "Tu Respuesta", status: "PENDING_HR", date: selectedFeedback.empleadoAck?.fecha, icon: Users, deadlineKey: "employee" },
                        { label: "Cierre Final", status: "CLOSED", date: selectedFeedback.closedAt, icon: CheckCircle, deadlineKey: null }
                      ].map((step, idx) => {
                        const order = { "DRAFT": 0, "SENT": 1, "PENDING_HR": 2, "CLOSED": 3 };
                        const currentStep = order[selectedFeedback.estado] ?? 0;
                        const isCompleted = idx <= currentStep;
                        const isCurrent = idx === currentStep;
                        const Icon = step.icon;

                        // Get deadline info
                        const periodItem = timelineItems.find(t => t.id === selectedFeedback.periodo);
                        let deadlineRange = step.deadlineKey && periodItem ? periodItem.deadlines[step.deadlineKey] : null;

                        // [FIX] Dynamic Deadline for Employee Response
                        // If feedback is SENT, the real deadline is +5 days from submission, not the static global date.
                        if (step.deadlineKey === "employee" && selectedFeedback.submittedToEmployeeAt) {
                          const submissionDate = new Date(selectedFeedback.submittedToEmployeeAt);
                          const dynamicDeadline = new Date(submissionDate);
                          dynamicDeadline.setDate(dynamicDeadline.getDate() + 5);
                          deadlineRange = dynamicDeadline.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
                        }

                        return (
                          <div key={idx} className={`flex gap-4 group ${isCompleted ? 'opacity-100' : 'opacity-60'}`}>
                            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-sm
                              ${isCompleted ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200' : 'bg-white border-slate-200 text-slate-300'}
                              ${isCurrent ? 'ring-2 ring-blue-100 ring-offset-2' : ''}
                            `}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 pt-0.5">
                              <div className={`text-sm font-bold leading-none mb-1 transition-colors ${isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                                {step.label}
                              </div>

                              {/* Date Logic */}
                              {step.date && isCompleted ? (
                                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-300" />
                                  {new Date(step.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </div>
                              ) : !isCompleted && deadlineRange ? (
                                <div className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 w-fit mt-1 flex items-center gap-1">
                                  <Hourglass className="w-3 h-3" />
                                  Vence: {deadlineRange}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-300 italic mt-1">Pendiente</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* MAIN CONTENT (Scrollable) */}
            <div className="space-y-12">

              {/* SECTION 0: FEEDBACK FLOW */}



              {/* SECTION 1: FEEDBACK RESULTS (Timeline + Summary) */}
              <div ref={sectionFeedbackRef} className="scroll-mt-32">
                {/* Timeline Card */}
                {/* Timeline Card */}
                <div id="tour-feedback-timeline" className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 mb-8">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-8 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Cronograma Anual
                  </h3>

                  <div className="relative flex items-center justify-between px-4 md:px-12">
                    <div className="absolute left-0 right-0 top-3 h-0.5 bg-slate-100 -z-0 mx-8 md:mx-16"></div>
                    {timelineItems.map((p) => {
                      const fb = feedbacks.find(f => f.periodo === p.id);
                      const isSelected = selectedFeedback?.periodo === p.id;
                      const isDone = fb?.estado === "SENT" || fb?.estado === "REALIZADO" || fb?.estado === "PENDING_HR" || fb?.estado === "ACKNOWLEDGED" || fb?.estado === "CLOSED";
                      const isFuture = !fb || fb.isPlaceholder;

                      let statusColor = "bg-white border-slate-300 text-slate-400";
                      if (isDone) statusColor = "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30";
                      else if (isSelected) statusColor = "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/30 scale-110";
                      else if (!isFuture) statusColor = "bg-white border-amber-400 text-amber-500";

                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            const found = feedbacks.find(f => f.periodo === p.id);
                            if (found) setSelectedFeedback(found);
                          }}
                          className="relative z-10 flex flex-col items-center group focus:outline-none"
                        >
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${statusColor} ${isSelected ? 'scale-125' : 'group-hover:scale-110'}`}>
                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-current'}`} />}
                          </div>
                          <div className={`mt-4 text-center transition-all ${isSelected ? 'transform translate-y-1' : ''}`}>
                            <div className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{p.label}</div>
                            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{p.sub}</div>
                            <div className="mt-1 px-2 py-0.5 bg-slate-50 rounded text-[9px] text-slate-500 border border-slate-100 whitespace-nowrap group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                              Rev: {p.actionMonth}
                            </div>

                            {/* Hover Tooltip for Deadlines */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                              <div className="font-bold mb-1 border-b border-slate-600 pb-1">Plazos {p.actionMonth}</div>
                              <div className="grid grid-cols-1 gap-1 text-[10px]">
                                <div className="flex justify-between"><span className="text-slate-300">Líder:</span> <span>Hasta el {p.deadlines.manager.replace('-', '/')}</span></div>
                                <div className="flex justify-between"><span className="text-slate-300">Empleado:</span> <span>Hasta el {p.deadlines.employee.replace('-', '/')}</span></div>
                                <div className="flex justify-between"><span className="text-slate-300">RRHH:</span> <span>Hasta el {p.deadlines.hr.replace('-', '/')}</span></div>
                              </div>
                              <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedFeedback ? (
                  <div className="space-y-6">
                    {/* Header Feedback */}
                    <div id="tour-feedback-status" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            <MessageSquare className="w-6 h-6 text-blue-600" />
                            Feedback {selectedFeedback.periodo}
                          </h2>
                          <div className="flex flex-col mt-1 ml-9">
                            <span className="text-sm text-slate-500">
                              {selectedFeedback.isPlaceholder
                                ? "Este periodo aún no ha sido evaluado."
                                : `Recibido el ${selectedFeedback.submittedToEmployeeAt ? new Date(selectedFeedback.submittedToEmployeeAt).toLocaleDateString() : "—"}`
                              }
                            </span>
                            {!selectedFeedback.isPlaceholder && (
                              <span className="text-xs font-bold text-slate-400 uppercase mt-1">
                                Evaluado por: <span className="text-slate-600">{evaluatorName}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={(() => {
                          // 1. If definitive status (not draft/pending/placeholder), show it
                          if (selectedFeedback.estado !== "DRAFT" && selectedFeedback.estado !== "PENDIENTE" && !selectedFeedback.isPlaceholder) {
                            return selectedFeedback.estado;
                          }

                          // 2. Date-based logic for Draft/Pending/Placeholder
                          const item = timelineItems.find(t => t.id === selectedFeedback.periodo);
                          if (!item) return "PENDIENTE";

                          const now = new Date();
                          const startDate = new Date(item.date);

                          // Work Window Check (3 months before feedback start)
                          const workStartDate = new Date(startDate);
                          workStartDate.setMonth(workStartDate.getMonth() - 3);

                          // Approximate deadline: start + 2 months
                          const deadline = new Date(startDate);
                          deadline.setMonth(deadline.getMonth() + 2);

                          if (now > deadline) return "VENCIDO";
                          if (now >= workStartDate) return "ACTUAL"; // Inside working or feedback window

                          return "FUTURO";
                        })()} />
                      </div>

                      {!selectedFeedback.isPlaceholder && (
                        <div className="bg-slate-50/80 p-6 rounded-xl border border-slate-200/60">
                          <label className="text-xs font-bold text-blue-600 uppercase mb-3 block flex items-center gap-2">
                            <UserCircle2 className="w-4 h-4" /> Comentarios del Líder
                          </label>
                          <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                            {selectedFeedback.comentario || "Sin comentarios."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Summary Scores (V3 KPI Tiles) */}
                    <div className="mt-6 mb-2">
                      <div id="tour-kpi-summary" className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(() => {
                          const showScores = ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(selectedFeedback.estado);

                          return (
                            <>
                              {/* Objectives Tile (Modern Violet) */}
                              <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between overflow-visible group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                                {/* Custom Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                                  Suma de pesos de objetivos iniciados
                                  <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
                                      <Target className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Objetivos</h3>
                                      <span className="text-[10px] text-slate-400 font-medium">Peso: 70%</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-3xl font-black text-slate-800 tracking-tight">
                                      {showScores ? `${Number(periodResults.scores.obj).toFixed(1)}%` : "--"}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {(() => {
                                    const totalObjs = periodResults.objetivos?.length || 0;
                                    const cumulativeCount = periodResults.objetivos?.filter(o => o.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo')).length || 0;
                                    const maintenanceCount = totalObjs - cumulativeCount;
                                    return (
                                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                                        <span className="flex items-center gap-1 relative group/tip">
                                          Esperado {selectedFeedback.periodo}: <span className="text-slate-600">{Number(periodResults.expectedScores?.obj ?? 0).toFixed(1)}%</span>
                                          <HelpCircle className="w-3 h-3 text-slate-300 hover:text-slate-400 cursor-help" />
                                          {/* Custom tooltip */}
                                          <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-800 text-white text-[10px] rounded-lg p-2.5 shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 leading-relaxed">
                                            <p className="font-bold text-slate-200 mb-1">Composición de Objetivos</p>
                                            <p>📌 {maintenanceCount} de Mantenimiento → exigen 100% todo el año</p>
                                            {cumulativeCount > 0 && <p>📈 {cumulativeCount} Acumulativo → crece con el avance anual</p>}
                                            <p className="text-slate-400 mt-1">Total: {totalObjs} objetivos activos</p>
                                            <div className="absolute top-full left-4 w-2 h-2 bg-slate-800 rotate-45 -translate-y-1"></div>
                                          </div>
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  {/* Progress Bar: Score relative to Max */}
                                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-violet-500 rounded-full transition-all duration-1000 ease-out"
                                      style={{ width: `${Math.min(((periodResults.scores.obj || 0) / (periodResults.maxScores?.obj || 1)) * 100, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>

                              {/* Competencies Tile (Modern Teal) */}
                              <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between overflow-visible group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                                {/* Custom Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                                  Competencias evaluadas hasta la fecha
                                  <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                      <Lightbulb className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Competencias</h3>
                                      <span className="text-[10px] text-slate-400 font-medium">Peso: 30%</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-3xl font-black text-slate-800 tracking-tight">
                                      {showScores ? `${Number(periodResults.scores.comp).toFixed(1)}%` : "--"}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                                    <span className="flex items-center gap-1 relative group/tip">
                                      Esperado {selectedFeedback.periodo}: <span className="text-slate-600">{Number(periodResults.expectedScores?.comp ?? 0).toFixed(1)}%</span>
                                      <HelpCircle className="w-3 h-3 text-slate-300 hover:text-slate-400 cursor-help" />
                                      <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-800 text-white text-[10px] rounded-lg p-2.5 shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 leading-relaxed">
                                        <p className="font-bold text-slate-200 mb-1">Competencias ({periodResults.aptitudes?.length || 0} activas)</p>
                                        <p>Las habilidades blandas se esperan al máximo de cumplimiento (30%) en todas las evaluaciones del año, sin escala temporal.</p>
                                        <div className="absolute top-full left-4 w-2 h-2 bg-slate-800 rotate-45 -translate-y-1"></div>
                                      </div>
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                                    <div
                                      className="h-full bg-teal-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(20,184,166,0.5)]"
                                      style={{ width: `${Math.min(((periodResults.scores.comp || 0) / (periodResults.maxScores?.comp || 1)) * 100, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>

                              {/* Global Tile (Titanium Dark) */}
                              <div className="relative bg-slate-900 rounded-2xl border border-slate-700 shadow-xl p-5 flex flex-col justify-between overflow-visible group hover:-translate-y-1 transition-all duration-300">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                                {/* Custom Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-slate-900 font-bold text-[10px] py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                                  Nota Final Ponderada
                                  <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
                                </div>

                                <div className="flex justify-between items-start mb-4 relative z-10">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
                                      <LayoutDashboard className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Global</h3>
                                      <span className="text-[10px] text-slate-500 font-medium">Final</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-3xl font-black text-white tracking-tight">
                                      {showScores ? `${Number(periodResults.scores.global).toFixed(1)}%` : "--"}
                                    </div>
                                    {/* Achievement Badge */}
                                    {showScores && periodResults.scores.global >= 50 && (
                                      <div className="inline-flex items-center bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 mt-1 uppercase tracking-wider backdrop-blur-sm">
                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Objetivos Logrados
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2 relative z-10">
                                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-1.5 px-0.5">
                                    <span className="flex items-center gap-1 relative group/tip">
                                      Esperado {selectedFeedback.periodo}: <span className="text-blue-400">{Number(periodResults.expectedScores?.global ?? 0).toFixed(1)}%</span>
                                      <HelpCircle className="w-3 h-3 text-slate-500 hover:text-slate-400 cursor-help" />
                                      <div className="absolute bottom-full left-0 mb-2 w-60 bg-white text-slate-800 border border-slate-200 text-[10px] rounded-lg p-2.5 shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 leading-relaxed">
                                        <p className="font-bold text-slate-700 mb-1">¿Cómo se calcula el Esperado?</p>
                                        <p>🎯 Objetivos: {Number(periodResults.expectedScores?.obj ?? 0).toFixed(1)}% (según composición tipos)</p>
                                        <p>💡 Competencias: {Number(periodResults.expectedScores?.comp ?? 0).toFixed(1)}% (fijo 30% anual)</p>
                                        <div className="absolute top-full left-4 w-2 h-2 bg-white border-b border-r border-slate-200 rotate-45 -translate-y-1"></div>
                                      </div>
                                    </span>
                                  </div>

                                  {/* Progress Bar with 50% Marker */}
                                  <div className="relative h-1.5 w-full bg-slate-800 rounded-full mt-2">
                                    {/* 50% Marker */}
                                    {(() => {
                                      const max = (periodResults.maxScores?.obj ?? 70) + (periodResults.maxScores?.comp ?? 30) || 100;
                                      const pos = (50 / max) * 100;
                                      if (pos <= 100) return (
                                        <>
                                          <div className="absolute top-[-4px] w-0.5 h-3.5 bg-slate-400 z-20 shadow-sm" style={{ left: `${pos}%` }}></div>
                                          <div className="absolute bottom-[-14px] text-[8px] font-bold text-slate-500 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos}%` }}>Min 50%</div>
                                        </>
                                      );
                                      return null;
                                    })()}

                                    <div
                                      className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)] z-10"
                                      style={{ width: `${Math.min(((periodResults.scores.global || 0) / ((periodResults.maxScores?.obj ?? 70) + (periodResults.maxScores?.comp ?? 30) || 1)) * 100, 100)}%` }}
                                    ></div>
                                  </div>

                                  {/* Spacer for legend */}
                                  <div className="h-2"></div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed">
                    Seleccioná un periodo para ver el detalle.
                  </div>
                )}
              </div>

              {/* SECTION 2: DETAILED VIEW (Redesigned) */}
              <div ref={sectionDetailsRef} className="scroll-mt-32">
                {!selectedFeedback ? (
                  <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed">
                    No hay detalles disponibles para este periodo.
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row gap-6 h-[800px]">
                    {/* LEFT COLUMN: LIST */}
                    <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                      {/* TABS */}
                      <div id="tour-tabs-sections" className="flex border-b border-zinc-100">
                        <button
                          onClick={() => setActiveTab('obj')}
                          className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'obj' ? 'text-zinc-800 bg-zinc-50 border-b-2 border-zinc-800' : 'text-zinc-400 hover:bg-zinc-50'}`}
                        >
                          Objetivos
                        </button>
                        <button
                          onClick={() => setActiveTab('comp')}
                          className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'comp' ? 'text-zinc-800 bg-zinc-50 border-b-2 border-zinc-800' : 'text-zinc-400 hover:bg-zinc-50'}`}
                        >
                          Competencias
                        </button>
                      </div>

                      {/* LIST ITEMS (Refined V3) */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-zinc-50/50">
                        {activeTab === 'obj' ? (
                          periodResults.objetivos.length > 0 ? (
                            periodResults.objetivos.map(obj => (
                              <button
                                key={obj._id}
                                onClick={() => setSelectedItemId(obj._id)}
                                className={`w-full text-left rounded-lg border transition-all group overflow-hidden ${selectedItemId === obj._id
                                  ? 'bg-zinc-800 border-zinc-800 shadow-md ring-1 ring-zinc-800 relative z-10'
                                  : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm'
                                  }`}
                              >
                                <div className="p-3 pb-2 flex justify-between items-start gap-2">
                                  <div className={`text-sm font-semibold line-clamp-2 ${selectedItemId === obj._id ? 'text-white' : 'text-zinc-700'}`}>
                                    {obj.nombre}
                                  </div>
                                </div>

                                {/* Detailed Metrics Footer */}
                                <div className={`px-3 py-2 grid grid-cols-3 gap-1 text-[10px] font-medium border-t ${selectedItemId === obj._id ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] opacity-70">Peso</span>
                                    <span className="font-bold">{obj.peso}%</span>
                                  </div>
                                  <div className="flex flex-col text-center border-l border-slate-200/50">
                                    <span className="text-[9px] opacity-70">Pond</span>
                                    <span className="font-bold">{Number((obj.scorePeriodo * (obj.peso || 0)) / 100).toFixed(1)}%</span>
                                  </div>
                                  <div className="flex flex-col text-right border-l border-slate-200/50">
                                    <span className="text-[9px] opacity-70">Avance</span>
                                    <span className="font-bold">{Number(obj.rawScore ?? 0).toFixed(1)}%</span>
                                  </div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="p-8 text-center text-slate-400 text-sm italic">No hay objetivos.</div>
                          )
                        ) : (
                          periodResults.aptitudes.length > 0 ? (
                            periodResults.aptitudes.map(apt => (
                              <button
                                key={apt._id}
                                onClick={() => setSelectedItemId(apt._id)}
                                className={`w-full text-left rounded-lg border transition-all group overflow-hidden ${selectedItemId === apt._id
                                  ? 'bg-white border-orange-200 shadow-md ring-1 ring-orange-50 relative z-10'
                                  : 'bg-white border-slate-200 hover:border-orange-200 hover:shadow-sm'
                                  }`}
                              >
                                <div className="p-3 pb-2 flex justify-between items-start gap-2">
                                  <div className={`text-sm font-semibold line-clamp-2 ${selectedItemId === apt._id ? 'text-orange-900' : 'text-slate-700'}`}>
                                    {apt.nombre}
                                  </div>
                                </div>

                                {/* Dual Progress Footer (Tinted) */}
                                <div className={`px-3 py-2 flex justify-between text-[10px] font-medium ${selectedItemId === apt._id ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-zinc-50 text-zinc-500'}`}>
                                  <span>Impacto: <span className="font-bold">30%</span></span>
                                  <span>Calif: <span className="font-bold">{Number(apt.scorePeriodo).toFixed(1)}%</span></span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="p-8 text-center text-slate-400 text-sm italic">No hay competencias.</div>
                          )
                        )}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: DETAILS */}
                    <div className="w-full lg:w-2/3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 overflow-y-auto">
                      {renderDetailView()}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: VALIDATION */}
              <div ref={sectionValidationRef} className="scroll-mt-32">
                {!selectedFeedback || selectedFeedback.isPlaceholder ? (
                  <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed">
                    No hay validación disponible para este periodo.
                  </div>
                ) : (
                  <div id="tour-conformidad-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Conformidad y Validación
                    </h3>

                    <div className="space-y-6 mb-8 pb-8 border-b border-slate-100">
                      {localAck === "CONTEST" && (
                        <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-sm font-bold text-slate-700 mb-2 block tracking-wide">
                            Motivo del desacuerdo <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={localReason}
                            onChange={(e) => setLocalReason(e.target.value)}
                            disabled={selectedFeedback.estado !== "SENT"}
                            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                          >
                            <option value="">Seleccioná un motivo...</option>
                            <option value="La nota no refleja el feedback recibido.">La nota no refleja el feedback recibido.</option>
                            <option value="Los objetivos asignados fueron inalcanzables.">Los objetivos asignados fueron inalcanzables.</option>
                            <option value="El objetivo no fue comprendido claramente.">El objetivo no fue comprendido claramente.</option>
                            <option value="Falta de escucha o comprensión durante la reunión de feedback.">Falta de escucha o comprensión durante la reunión de feedback.</option>
                            <option value="Incomodidad con el evaluador.">Incomodidad con el evaluador.</option>
                            <option value="Ejemplos proporcionados poco pertinentes o poco claros.">Ejemplos proporcionados poco pertinentes o poco claros.</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Comentarios</label>
                        <textarea
                          className="w-full h-32 rounded-xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none bg-slate-50 focus:bg-white"
                          placeholder="Escribí tus comentarios sobre este feedback..."
                          value={localComment}
                          onChange={(e) => setLocalComment(e.target.value)}
                          disabled={selectedFeedback.estado !== "SENT"}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                        <div className="flex gap-3 w-full sm:w-auto">
                          <button
                            onClick={() => setLocalAck("ACK")}
                            disabled={selectedFeedback.estado !== "SENT"}
                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${localAck === "ACK"
                              ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 ring-offset-2"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                              }`}
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${localAck === "ACK" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400"}`}>
                              {localAck === "ACK" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            Estoy de acuerdo
                          </button>
                          <button
                            onClick={() => setLocalAck("CONTEST")}
                            disabled={selectedFeedback.estado !== "SENT"}
                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${localAck === "CONTEST"
                              ? "bg-rose-100 text-rose-700 ring-2 ring-rose-500 ring-offset-2"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                              }`}
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${localAck === "CONTEST" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-400"}`}>
                              {localAck === "CONTEST" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            En desacuerdo
                          </button>
                        </div>

                        <Button
                          onClick={handleSaveResponse}
                          disabled={selectedFeedback.estado !== "SENT" || !localAck}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {selectedFeedback.estado !== "SENT" ? "Enviado" : "Enviar"}
                        </Button>
                      </div>

                      {selectedFeedback.estado === "CLOSED" && (
                        <div className="mt-4 p-4 bg-slate-50 text-slate-500 text-sm rounded-xl flex items-center gap-3 border border-slate-100">
                          <Lock className="w-5 h-5" />
                          <span>Este feedback está cerrado y no se puede modificar.</span>
                        </div>
                      )}
                    </div>

                    {/* FEEDBACK FLOW REMOVED (Now in Sidebar) */}
                    <div className="pt-4 border-t border-slate-100 mt-8">
                      <p className="text-center text-xs text-slate-400 italic">
                        El estado del flujo se puede visualizar en el panel lateral.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT SIDEBAR: Avisos y Novedades */}
            <div className="hidden lg:block space-y-4 sticky top-24 h-fit">
              <div id="tour-avisos-section" className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Avisos y Novedades
                </h3>

                <div className="space-y-3">
                  {/* 1. PERSONAL ALERTS (Deadline) */}
                  {(() => {
                    const sentFeedback = feedbacks.find(f => f.estado === "SENT");
                    if (sentFeedback && sentFeedback.submittedToEmployeeAt) {
                      const submissionDate = new Date(sentFeedback.submittedToEmployeeAt);
                      const deadline = new Date(submissionDate);
                      deadline.setDate(deadline.getDate() + 5);

                      const now = new Date();
                      const diffTime = deadline - now;
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      if (diffDays >= 0) {
                        return (
                          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs shadow-sm">
                            <div className="flex items-center gap-2 mb-1 text-amber-700 font-bold">
                              <AlertCircle className="w-4 h-4" />
                              <span>Acción Requerida</span>
                            </div>
                            <p className="text-amber-600 leading-snug">
                              Tenés hasta el <strong className="text-amber-800">{deadline.toLocaleDateString()}</strong> para responder tu feedback (quedan {diffDays} días).
                            </p>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {/* 2. ACTIVE NOTICES (Dynamic List) */}
                  {globalAvisos.length > 0 && globalAvisos.map(aviso => (
                    <Dialog key={aviso._id}>
                      <DialogTrigger asChild>
                        <div
                          className={`p-3 border rounded-xl text-xs shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 group
                              ${aviso.tipo === 'SISTEMAS'
                              ? 'bg-amber-50 border-amber-100 hover:border-amber-300'
                              : aviso.alcance === 'GLOBAL' ? 'bg-indigo-50 border-indigo-100 hover:border-indigo-300' : 'bg-emerald-50 border-emerald-100 hover:border-emerald-300'}`}
                        >
                          <div className={`flex items-center gap-2 mb-1 font-bold
                              ${aviso.tipo === 'SISTEMAS' ? 'text-amber-700' : aviso.alcance === 'GLOBAL' ? 'text-indigo-700' : 'text-emerald-700'}`}>
                            {aviso.tipo === 'SISTEMAS' ? <Cpu className="w-4 h-4" /> : aviso.alcance === 'GLOBAL' ? <Info className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                            <span className="line-clamp-1">{aviso.titulo}</span>
                          </div>
                          <div className="mt-2 text-[10px] opacity-70 font-medium flex justify-between items-center bg-white/50 px-2 py-1.5 rounded-md">
                            <span className={`font-bold uppercase tracking-wider
                                ${aviso.tipo === 'SISTEMAS' ? 'text-amber-600' : 'text-slate-500'}`}>
                              {aviso.tipo === 'SISTEMAS' ? '⚙ Sistemas' : '📢 RRHH'}
                            </span>
                            <span className="text-slate-500 flex items-center gap-1">
                              Válido hasta: {new Date(aviso.fechaFin).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md border-0 shadow-2xl rounded-2xl overflow-hidden p-0">
                        {/* Header Colorido */}
                        <div className={`px-6 py-6 flex flex-col items-center text-center
                            ${aviso.tipo === 'SISTEMAS'
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
                            : aviso.alcance === 'GLOBAL' ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white' : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'}`}>
                          <div className="p-3 bg-white/20 rounded-full mb-3 backdrop-blur-sm">
                            {aviso.tipo === 'SISTEMAS' ? <Cpu className="w-8 h-8" /> : aviso.alcance === 'GLOBAL' ? <Info className="w-8 h-8" /> : <Megaphone className="w-8 h-8" />}
                          </div>
                          <DialogTitle className="text-xl font-bold tracking-tight mb-1">{aviso.titulo}</DialogTitle>
                          <DialogDescription className="text-blue-50/90 text-xs uppercase tracking-wider font-semibold">
                            {aviso.tipo === 'SISTEMAS' ? 'Alerta de Sistemas' : `Comunicado ${aviso.alcance}`}
                            {aviso.targetName && ` • ${aviso.targetName}`}
                          </DialogDescription>
                        </div>

                        {/* Body */}
                        <div className="p-6 bg-white space-y-4">
                          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line max-h-[60vh] overflow-y-auto pr-2">
                            {aviso.mensaje}
                          </div>
                          <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider
                                ${aviso.tipo === 'SISTEMAS' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                              Enviado por: {aviso.tipo === 'SISTEMAS' ? '⚙️ Sistemas' : '📢 RRHH'}
                            </span>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}

                  {/* EMPTY STATE */}
                  {globalAvisos.length === 0 && !feedbacks.some(f => f.estado === "SENT") && (
                    <div className="text-center py-4 text-[10px] text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No hay nuevas notificaciones.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reporte Final Modal */}
      <ReporteFinal
        isOpen={showFinalReport}
        onClose={() => setShowFinalReport(false)}
        data={data}
        empleado={data?.empleado}
        anio={selectedYear}
        scoreGlobal={periodResults?.sparklineData?.find(d => d.name === "Fin")?.global ?? 0}
        evolutionData={periodResults?.sparklineData || []}
      />
    </div >
  );
}
