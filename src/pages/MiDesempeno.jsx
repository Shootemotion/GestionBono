import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { dashEmpleado } from "@/lib/dashboard";
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
  Trophy
} from "lucide-react";
import { ReporteFinal } from "@/components/ReporteFinal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, AreaChart, Area } from "recharts";

// === UI helpers ===
const StatusBadge = ({ status }) => {
  const styles = {
    "SENT": "bg-blue-50 text-blue-700 border-blue-200",
    "REALIZADO": "bg-blue-50 text-blue-700 border-blue-200",
    "PENDING_HR": "bg-purple-50 text-purple-700 border-purple-200",
    "ACKNOWLEDGED": "bg-purple-50 text-purple-700 border-purple-200", // Legacy support
    "CLOSED": "bg-emerald-50 text-emerald-700 border-emerald-200",
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

function getAccumulatedValue(obj, metaId, currentPeriod, currentValue) {
  if (!obj || !Array.isArray(obj.hitos)) return currentValue || 0;

  const periodOrder = ["Q1", "Q2", "Q3", "FINAL"];
  const currentIdx = periodOrder.indexOf(currentPeriod);
  if (currentIdx === -1) return currentValue || 0;

  let total = 0;
  for (const h of obj.hitos) {
    const hIdx = periodOrder.indexOf(h.periodo);
    if (hIdx !== -1 && hIdx <= currentIdx) {
      const m = h.metas?.find(m => (m.metaId === metaId || m._id === metaId));
      if (h.periodo === currentPeriod) {
        total += Number(currentValue || 0);
      } else if (m) {
        total += Number(m.resultado || 0);
      }
    }
  }
  return total;
  return total;
}

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
                return (
                  <div
                    key={h.periodo}
                    onClick={(e) => { e.stopPropagation(); setSelectedPeriod(h.periodo); }}
                    className={`flex flex-col items-center justify-center p-2 rounded border min-w-[70px] transition-all cursor-pointer ${colorClass} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <span className="text-[10px] font-bold uppercase">{h.periodo}</span>
                    <span className="text-xs font-semibold">{h.actual !== null ? `${Math.round(h.actual)}%` : "-"}</span>
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
                  {hasResult ? `${Number(currentHito.actual).toFixed(1)}%` : "0.0%"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Metas / KPI */}
              {/* Metas / KPI */}
              <div className="space-y-3">
                {currentHito?.metas?.map((meta, idx) => {
                  const isAcumulativo = obj.metas?.[idx]?.modoAcumulacion === "acumulativo";
                  const valorEvaluado = isAcumulativo
                    ? getAccumulatedValue(obj, meta.metaId || meta._id, selectedPeriod, meta.resultado)
                    : meta.resultado;

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

              {/* Result Input Display (Read Only) */}
              <div className="flex justify-end">
                <div className="w-32">
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Resultado</label>
                  <div className="h-9 w-full rounded border border-slate-200 bg-slate-50 flex items-center px-3 text-sm text-slate-600 font-medium">
                    {hasResult ? currentHito.actual : "—"}
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

  // New State for Redesign
  const [activeTab, setActiveTab] = useState("obj"); // "obj" | "comp"
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [viewPeriod, setViewPeriod] = useState(null); // For chart interaction
  const [showGraph, setShowGraph] = useState(false); // Collapsible graph state
  const [showFinalReport, setShowFinalReport] = useState(false);

  // Year Selection Logic
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear();
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
  }, [fetchDash, fetchFeedbacks]);

  // Sincronizar estado local al cambiar selección
  useEffect(() => {
    if (selectedFeedback) {
      setLocalComment(selectedFeedback.comentarioEmpleado || "");
      setLocalAck(selectedFeedback.empleadoAck?.estado || null);
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
        const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
        const progresos = relevantHitos.map(h => h.actual ?? 0);
        score = isCumulative
          ? Math.max(...progresos, 0)
          : Math.round(progresos.reduce((a, b) => a + b, 0) / progresos.length);

        const potentialFactor = isCumulative ? timeFraction : 1;
        maxActiveObjWeight += (obj.peso || 0) * potentialFactor;
      }

      const hasPermiteOver = obj.metas?.some(m => m.permiteOver) || obj.hitos?.some(h => h.metas?.some(m => m.permiteOver));
      const effectiveScore = hasPermiteOver ? score : Math.min(score, 100);

      totalObjScore += effectiveScore * (obj.peso || 0);
      totalObjWeight += (obj.peso || 0); // Should sum to 100 ideally

      objetivos.push({
        ...obj,
        hitoActual: hitoPeriodo, // For display in card
        scorePeriodo: effectiveScore, // Calculated score up to this period (Weighted by PermiteOver)
        rawScore: score // The raw progress (0-100+) for display
      });
    });

    const scoreObjRaw = totalObjScore / 100; // Normalize to 100 base
    const scoreObj = scoreObjRaw * 0.7; // Weighted contribution (Max 70)

    // Competencias
    let totalCompScore = 0;
    let compCount = 0;
    const aptitudes = [];

    data.aptitudes?.forEach(apt => {
      const relevantHitos = apt.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
      let score = 0;
      const puntuaciones = relevantHitos.map(h => h.actual).filter(val => val !== null && val !== undefined);

      if (puntuaciones.length > 0) {
        score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length);
      }

      totalCompScore += score;
      compCount++;

      const hitoPeriodo = apt.hitos?.find(h => h.periodo === p);

      aptitudes.push({
        ...apt,
        hitoActual: hitoPeriodo,
        scorePeriodo: score
      });
    });

    const scoreCompRaw = compCount > 0 ? (totalCompScore / compCount) : 0;
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
    const maxComp = compCount > 0 ? 30 : 0; // Fixed 30% potential if any data exists

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
              const isCum = o.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
              const prog = rh.map(h => h.actual ?? 0);
              const sc = isCum ? Math.max(...prog, 0) : Math.round(prog.reduce((a, b) => a + b, 0) / prog.length);
              const hasOver = o.metas?.some(m => m.permiteOver);
              const eff = hasOver ? sc : Math.min(sc, 100);
              tObjScore += eff * (o.peso || 0);
            }
          });
          const rawObj = tObjScore / 100;

          // Calc Comp
          let tCompScore = 0;
          let tCompCount = 0;
          data.aptitudes?.forEach(a => {
            const rh = a.hitos?.filter(h => getPeriodMonth(h.periodo) <= relevantLimit) || [];
            const vals = rh.map(h => h.actual).filter(v => v !== null);
            if (vals.length > 0) {
              tCompScore += Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
              tCompCount++;
            }
          });
          const rawComp = tCompCount > 0 ? (tCompScore / tCompCount) : 0;

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
        }
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
      if (isMonthly && selectedFeedback.periodo.startsWith("Q")) {
        // Handle "2025Q1" -> "Q1"
        const suffix = selectedFeedback.periodo.length > 4 ? selectedFeedback.periodo.slice(4) : selectedFeedback.periodo;

        // Default display period is the last month of the quarter (for the Detail View)
        const qMapEnd = { "Q1": "M11", "Q2": "M02", "Q3": "M05", "FINAL": "M08" };
        displayPeriod = qMapEnd[suffix] || "M11";

        // Highlight ALL months in the quarter
        activeMonths = periodMonthsMap[suffix] || [];
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
      // Find hito for this period
      const h = item.hitos?.find(h => {
        if (!h.periodo) return false;
        if (h.periodo === p) return true;
        if (h.periodo.endsWith(p)) return true;
        if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
        return false;
      });

      // Determine if this is the currently viewed period (or part of the active range)
      const isSelected = activeMonths.some(m => p === m || p.endsWith(m));

      // Check visibility relative to the specific period's feedback
      const periodFeedback = feedbacks.find(f => f.periodo === p);
      const isVisible = periodFeedback && ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(periodFeedback.estado);

      // Calculate Weighted Score for Objectives, Raw Score for Competencies
      const rawScore = h?.actual ?? 0;
      const weightedScore = activeTab === 'obj'
        ? (rawScore * maxScore) / 100
        : rawScore;

      return {
        name: p,
        score: isVisible ? weightedScore : 0,
        rawScore: isVisible ? rawScore : 0, // Keep raw for tooltip if needed
        meta: maxScore,
        isCurrent: isSelected,
        isVisible
      };
    });



    // Check global visibility inside renderDetailView
    const showScores = ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(selectedFeedback?.estado);
    const metaLabel = activeTab === 'obj' ? `Meta: ${maxScore}%` : `Meta: ${maxScore}%`;

    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className={activeTab === 'obj' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}>
              {activeTab === 'obj' ? 'Objetivo' : 'Competencia'}
            </Badge>
            {activeTab === 'obj' && <span className="text-xs text-slate-500 font-medium">Peso: {item.peso}%</span>}
            <Badge variant="outline" className="text-[10px] text-slate-500">
              {item.frecuencia || "Anual"}
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-slate-800">{item.nombre}</h2>
          {item.descripcion && <p className="text-slate-500 text-sm mt-2">{item.descripcion}</p>}
        </div>

        {/* Evolution Graph (Collapsible) */}
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

        {/* Current Period Detail (V6.6 Clean) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 overflow-hidden">
          {/* Header - Single Score Focus */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <Calendar className="w-5 h-5 text-blue-600" />
                Detalle {displayPeriod}
              </h4>
              <div className="text-xs text-slate-500 mt-1">Desglose de objetivos y resultados</div>
            </div>

            {showScores ? (
              <div className="flex flex-col items-end">
                <span className="text-3xl font-extrabold text-blue-600 tracking-tight">
                  {displayHito?.actual ?? 0}%
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">Resultado del Periodo</span>
              </div>
            ) : (
              <span className="text-2xl text-slate-300 font-bold">--</span>
            )}
          </div>

          {/* Metas List (Polished) */}
          <div className="space-y-4">
            {activeTab === 'obj' && displayHito?.metas?.length > 0 ? (
              displayHito.metas.map((meta, idx) => {
                const metaDef = item.metas?.find(m => m._id === (meta.metaId || meta._id)) || item.metas?.[idx];
                const isAcumulativo = metaDef?.modoAcumulacion === "acumulativo";
                const valorEvaluado = isAcumulativo
                  ? getAccumulatedValue(item, metaDef?._id, displayPeriod, meta.resultado)
                  : meta.resultado;
                const target = meta.esperado ?? metaDef?.target ?? 0;
                const rawCompliance = target > 0 ? (valorEvaluado / target) * 100 : 0;
                const clampedCompliance = Math.min(Math.max(rawCompliance, 0), 100);

                return (
                  <div key={idx} className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 transition-all hover:bg-white hover:shadow-md group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-bold text-slate-700 truncate">{metaDef?.nombre || meta.nombre}</span>
                          <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-white text-slate-500 border-slate-200">
                            Peso: {metaDef?.peso ?? 0}%
                          </Badge>
                          <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                            {getCierreLabel(metaDef || meta)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Target className="w-3 h-3 text-slate-400" />
                          <span>Meta: <span className="font-semibold text-slate-700">{metaDef?.operador || "="} {target} {metaDef?.unidad}</span></span>
                        </div>
                      </div>

                      <div className="text-right min-w-[3rem]">
                        {showScores ? (
                          <div className="flex flex-col items-end">
                            <span className={`text-xl font-bold leading-none ${valorEvaluado >= target ? 'text-emerald-600' : 'text-slate-700'}`}>
                              {valorEvaluado ?? "--"}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase font-medium mt-1">Resultado</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </div>
                    </div>

                    {/* Config Details (V6.8) */}
                    <div className="grid grid-cols-3 gap-2 py-2 mt-2 border-t border-slate-100 text-[10px]">
                      <div>
                        <span className="block text-slate-400 font-bold uppercase mb-0.5">Configuración</span>
                        <div className="text-slate-600 font-medium truncate" title={metaDef?.unidad}>U: {metaDef?.unidad || "Numérico"}</div>
                        <div className="text-slate-600 font-medium truncate" title={metaDef?.modoAcumulacion}>Modo: {metaDef?.modoAcumulacion === "acumulativo" ? "Acumulado" : "Por Periodo"}</div>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold uppercase mb-0.5">Objetivo</span>
                        <div className="text-slate-600 font-medium">{metaDef?.operador || "="} {target}</div>
                        <div className="text-slate-400">Tolerancia: {metaDef?.tolerancia ?? 0}</div>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold uppercase mb-0.5">Opciones</span>
                        <div className="flex flex-col gap-0.5">
                          {metaDef?.reconoceEsfuerzo && (
                            <div className="flex items-center gap-1 text-amber-600 font-medium">
                              <Handshake className="w-3 h-3" /> Esfuerzo
                            </div>
                          )}
                          {metaDef?.permiteOver && (
                            <div className="flex items-center gap-1 text-emerald-600 font-medium">
                              <TrendingUp className="w-3 h-3" /> Over
                            </div>
                          )}
                          {!metaDef?.reconoceEsfuerzo && !metaDef?.permiteOver && <span className="text-slate-400">-</span>}
                        </div>
                      </div>
                    </div>

                    {/* Slim Progress Bar */}
                    {showScores && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${valorEvaluado >= target ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${clampedCompliance}%` }}
                        />
                      </div>
                    )}

                    {/* History Strip (V6.7) */}
                    {showScores && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-3 no-scrollbar">
                        {(() => {
                          const currentPeriodMonth = getPeriodMonth(displayPeriod);
                          const historyHitos = item.hitos
                            ?.filter(h => getPeriodMonth(h.periodo) <= currentPeriodMonth)
                            .sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo)) || [];

                          if (historyHitos.length === 0) return null;

                          return historyHitos.map((h, hIdx) => {
                            const hMeta = h.metas?.find(m => m.metaId === (metaDef?._id || meta.metaId) || m._id === (meta.metaId || meta._id));
                            const hVal = hMeta?.resultado;
                            const isCurrentH = h.periodo === displayPeriod;

                            // If no history value, skip or show dash? let's show dash.
                            const displayVal = hVal !== undefined && hVal !== null ? hVal : "-";

                            return (
                              <div key={hIdx} className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-lg border min-w-[3.5rem] transition-colors ${isCurrentH ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100'}`}>
                                <span className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${isCurrentH ? 'text-blue-600' : 'text-slate-400'}`}>
                                  {h.periodo}
                                </span>
                                <span className={`text-xs font-bold leading-none ${typeof displayVal === 'number' ? (displayVal >= target ? 'text-emerald-600' : 'text-slate-600') : 'text-slate-300'}`}>
                                  {displayVal}
                                </span>
                              </div>
                            )
                          });
                        })()}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400 italic text-sm">
                {activeTab === 'obj' ? "No hay metas detalladas para este hito." : "Las competencias no tienen desglose de metas."}
              </div>
            )}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Comentario del Evaluador</label>
          <p className="text-sm text-slate-600 italic">
            {displayHito?.comentario || "Sin comentarios."}
          </p>
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
      deadlines: { manager: "1-10", employee: "10-20", hr: "20-30" }
    },
    {
      id: "Q2",
      label: "Febrero",
      sub: "Seguimiento",
      date: `${selectedYear + 1}-02-01`,
      actionMonth: "Marzo",
      deadlines: { manager: "1-10", employee: "10-20", hr: "20-30" }
    },
    {
      id: "Q3",
      label: "Mayo",
      sub: "Seguimiento",
      date: `${selectedYear + 1}-05-01`,
      actionMonth: "Junio",
      deadlines: { manager: "1-10", employee: "10-20", hr: "20-30" }
    },
    {
      id: "FINAL",
      label: "Agosto",
      sub: "Cierre Anual",
      date: `${selectedYear + 1}-08-30`,
      actionMonth: "Septiembre",
      deadlines: { manager: "1-10", employee: "10-20", hr: "20-30" }
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
          <div className="flex justify-between items-end mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">Hola, {empleadoNombre}</h1>
              <p className="text-slate-400 text-lg">Seguimiento de evaluaciones y feedback continuo</p>
            </div>
            <div className="hidden md:block text-right">

              {/* REPORT BUTTON */}
              {(feedbacks.some(f => f.periodo === "FINAL" && !f.isPlaceholder) || data?.evaluaciones?.some(e => e.periodo === "FINAL")) && (
                <div className="mb-4">
                  <Button
                    size="sm"
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-lg backdrop-blur-sm"
                    onClick={() => setShowFinalReport(true)}
                  >
                    <Trophy className="w-4 h-4 mr-2 text-yellow-300" />
                    Ver Reporte Final
                  </Button>
                </div>
              )}

              <div className="text-sm text-slate-400 uppercase tracking-wider font-medium mb-1">AÑO</div>
              <div className="flex items-center justify-end gap-3 text-white">
                <button
                  onClick={() => setSelectedYear(y => y - 1)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  title="Año anterior"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="text-3xl font-black">{selectedYear}</div>
                <button
                  onClick={() => setSelectedYear(y => y + 1)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  title="Siguiente año"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
              <div className="text-xs text-slate-400 mt-1 font-medium">
                Periodo: Sept-{String(selectedYear).slice(-2)} a Ago-{String(selectedYear + 1).slice(-2)}
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
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-8">

            {/* SIDEBAR NAVIGATION (Sticky) - Only show if data exists */}
            <div className="hidden lg:block space-y-2 sticky top-24 h-fit">
              <div className="bg-white/80 backdrop-blur-sm p-2 rounded-2xl border border-slate-200/60 shadow-sm">
                <button
                  onClick={() => scrollToSection(sectionFeedbackRef)}
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Resultado Feedback
                </button>
                <button
                  onClick={() => scrollToSection(sectionDetailsRef)}
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium"
                >
                  <ListChecks className="w-5 h-5" />
                  Objetivos y Competencias
                </button>
                <button
                  onClick={() => scrollToSection(sectionValidationRef)}
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all font-medium"
                >
                  <FileSignature className="w-5 h-5" />
                  Conformidad
                </button>
              </div>
            </div>

            {/* MAIN CONTENT (Scrollable) */}
            <div className="space-y-12">

              {/* SECTION 0: FEEDBACK FLOW */}



              {/* SECTION 1: FEEDBACK RESULTS (Timeline + Summary) */}
              <div ref={sectionFeedbackRef} className="scroll-mt-32">
                {/* Timeline Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 mb-8">
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
                                <div className="flex justify-between"><span className="text-slate-300">Líder:</span> <span>Hasta el {p.deadlines.manager.split('-')[1]}</span></div>
                                <div className="flex justify-between"><span className="text-slate-300">Empleado:</span> <span>Hasta el {p.deadlines.employee.split('-')[1]}</span></div>
                                <div className="flex justify-between"><span className="text-slate-300">RRHH:</span> <span>Hasta el {p.deadlines.hr.split('-')[1]}</span></div>
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
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                                      Max Posible {selectedFeedback.periodo}: <span className="font-bold text-violet-600">{showScores ? `${Number(periodResults.maxScores?.obj ?? 70).toFixed(1)}%` : "--"}</span>
                                    </span>
                                  </div>
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
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                                      Max Posible {selectedFeedback.periodo}: <span className="font-bold text-teal-600">{showScores ? `${Number(periodResults.maxScores?.comp ?? 30).toFixed(1)}%` : "--"}</span>
                                    </span>
                                  </div>
                                  {/* Progress Bar */}
                                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-teal-500 rounded-full transition-all duration-1000 ease-out"
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
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700">
                                      Max Posible {selectedFeedback.periodo}: <span className="font-bold text-blue-400">{showScores ? `${Number((periodResults.maxScores?.obj ?? 70) + (periodResults.maxScores?.comp ?? 30)).toFixed(1)}%` : "--"}</span>
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
                    <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      {/* TABS */}
                      <div className="flex border-b border-slate-100">
                        <button
                          onClick={() => setActiveTab('obj')}
                          className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'obj' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          Objetivos
                        </button>
                        <button
                          onClick={() => setActiveTab('comp')}
                          className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'comp' ? 'text-amber-600 bg-amber-50/50 border-b-2 border-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          Competencias
                        </button>
                      </div>

                      {/* LIST ITEMS (Refined V3) */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
                        {activeTab === 'obj' ? (
                          periodResults.objetivos.length > 0 ? (
                            periodResults.objetivos.map(obj => (
                              <button
                                key={obj._id}
                                onClick={() => setSelectedItemId(obj._id)}
                                className={`w-full text-left rounded-lg border transition-all group overflow-hidden ${selectedItemId === obj._id
                                  ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50 relative z-10'
                                  : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                                  }`}
                              >
                                <div className="p-3 pb-2 flex justify-between items-start gap-2">
                                  <div className={`text-sm font-semibold line-clamp-2 ${selectedItemId === obj._id ? 'text-indigo-900' : 'text-slate-700'}`}>
                                    {obj.nombre}
                                  </div>
                                </div>

                                {/* Detailed Metrics Footer */}
                                <div className={`px-3 py-2 grid grid-cols-3 gap-1 text-[10px] font-medium border-t ${selectedItemId === obj._id ? 'bg-indigo-50/50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
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
                                <div className={`px-3 py-2 flex justify-between text-[10px] font-medium ${selectedItemId === apt._id ? 'bg-orange-50/50 text-orange-700' : 'bg-slate-50 text-slate-500'}`}>
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
                    <div className="w-full lg:w-2/3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-y-auto">
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
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Conformidad y Validación
                    </h3>

                    <div className="space-y-6 mb-8 pb-8 border-b border-slate-100">
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Comentarios para RRHH</label>
                        <textarea
                          className="w-full h-32 rounded-xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none bg-slate-50 focus:bg-white"
                          placeholder="Escribí tus comentarios sobre este feedback..."
                          value={localComment}
                          onChange={(e) => setLocalComment(e.target.value)}
                          disabled={selectedFeedback.estado === "CLOSED" || selectedFeedback.estado === "PENDING_HR" || !!selectedFeedback.empleadoAck?.estado}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                        <div className="flex gap-3 w-full sm:w-auto">
                          <button
                            onClick={() => setLocalAck("ACK")}
                            disabled={selectedFeedback.estado === "CLOSED" || selectedFeedback.estado === "PENDING_HR" || !!selectedFeedback.empleadoAck?.estado}
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
                            disabled={selectedFeedback.estado === "CLOSED" || selectedFeedback.estado === "PENDING_HR" || !!selectedFeedback.empleadoAck?.estado}
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
                          disabled={selectedFeedback.estado === "CLOSED" || selectedFeedback.estado === "PENDING_HR" || !!selectedFeedback.empleadoAck?.estado || !localAck}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {selectedFeedback.estado === "CLOSED" || selectedFeedback.estado === "PENDING_HR" || !!selectedFeedback.empleadoAck?.estado ? "Enviado" : "Enviar a RRHH"}
                        </Button>
                      </div>

                      {selectedFeedback.estado === "CLOSED" && (
                        <div className="mt-4 p-4 bg-slate-50 text-slate-500 text-sm rounded-xl flex items-center gap-3 border border-slate-100">
                          <Lock className="w-5 h-5" />
                          <span>Este feedback está cerrado y no se puede modificar.</span>
                        </div>
                      )}
                    </div>

                    {/* FEEDBACK FLOW MOVED HERE */}
                    <div className="pt-8">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span className="w-3 h-3 bg-slate-400 rounded-full" /> Estado del Proceso
                      </h4>
                      <div className="relative px-4 md:px-12">
                        <div className="absolute left-0 right-0 top-4 h-0.5 bg-slate-100 -z-0 mx-8 md:mx-16"></div>
                        <div className="flex justify-between relative z-10">
                          {[
                            { label: "Borrador", status: "DRAFT", date: selectedFeedback.createdAt, icon: FileEdit, deadlineKey: "manager" },
                            { label: "Enviado a Vos", status: "SENT", date: selectedFeedback.submittedToEmployeeAt, icon: Send, deadlineKey: "employee" },
                            { label: "Tu Respuesta", status: "PENDING_HR", date: selectedFeedback.empleadoAck?.fecha, icon: Users, deadlineKey: "hr" },
                            { label: "Finalizado", status: "CLOSED", date: selectedFeedback.closedAt, icon: CheckCircle, deadlineKey: null }
                          ].map((step, idx) => {
                            const order = { "DRAFT": 0, "SENT": 1, "PENDING_HR": 2, "CLOSED": 3 };
                            const currentStep = order[selectedFeedback.estado] ?? 0;
                            const isCompleted = idx <= currentStep;
                            const Icon = step.icon;

                            // Get deadline info
                            const periodItem = timelineItems.find(t => t.id === selectedFeedback.periodo);
                            const deadlineRange = step.deadlineKey && periodItem ? periodItem.deadlines[step.deadlineKey] : null;
                            const actionMonth = periodItem?.actionMonth;

                            return (
                              <div key={idx} className="flex flex-col items-center text-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border-2 ${isCompleted ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-300'}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                  <span className={`text-xs font-bold ${isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>{step.label}</span>
                                  {step.date && isCompleted && (
                                    <span className="text-[10px] text-slate-500 font-medium">
                                      {new Date(step.date).toLocaleDateString()}
                                    </span>
                                  )}
                                  {!isCompleted && deadlineRange && (
                                    <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded mt-1 border border-amber-100">
                                      {deadlineRange} {actionMonth?.slice(0, 3)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
      {/* Reporte Final Modal */}
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
    </div>
  );
}
