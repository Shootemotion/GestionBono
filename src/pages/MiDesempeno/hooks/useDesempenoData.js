import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { dashEmpleado } from '@/lib/dashboard';
import { getCurrentFiscalYear } from '@/lib/scoreHelpers';
// import { fotoSrc } from '@/utils/fotoSrc';
import { calculateObjectiveProgress, calculateWeightedScore, calculateCompetencyProgress } from '@/utils/calculos';

export function useDesempenoData() {
  const { user } = useAuth();
  const empleadoNombre = user?.empleado?.nombre || user?.empleadoId?.nombre || user?.nombre || "Colaborador";
  const empleadoId = user?.empleado?._id || user?.empleadoId?._id || user?.empleadoId || user?._id;

  const [data, setData] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  const [localComment, setLocalComment] = useState("");
  const [localAck, setLocalAck] = useState(null);
  const [localReason, setLocalReason] = useState("");

  const [activeTab, setActiveTab] = useState("obj");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [viewPeriod, setViewPeriod] = useState(null);
  const [showFinalReport, setShowFinalReport] = useState(false);
  const [globalAvisos, setGlobalAvisos] = useState([]);

  const [selectedYear, setSelectedYear] = useState(() => getCurrentFiscalYear());

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

  const fetchFeedbacks = useCallback(async () => {
    if (!empleadoId) return;
    try {
      const res = await api(`/feedbacks/empleado/${empleadoId}?year=${selectedYear}`);
      const fetched = Array.isArray(res) ? res : [];

      const periods = ["Q1", "Q2", "Q3", "FINAL"];
      const fullList = periods.map(p => {
        const found = fetched.find(f => f.periodo === p);
        if (found) return found;
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

      if (fullList.length > 0 && !selectedFeedback) {
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
    api(`/avisos/my`).then(res => {
      if (Array.isArray(res)) setGlobalAvisos(res);
    }).catch(err => console.error("Error loading avisos", err));
  }, [fetchDash, fetchFeedbacks, selectedYear]);

  useEffect(() => {
    if (selectedFeedback) {
      setLocalComment(selectedFeedback.comentarioEmpleado || "");
      setLocalAck(selectedFeedback.empleadoAck?.estado || null);
      setLocalReason(selectedFeedback.motivoDesacuerdo || "");
    }
  }, [selectedFeedback]);

  const getPeriodMonth = useCallback((periodStr) => {
    if (!periodStr) return 0;
    if (periodStr === "Q1") return 3;
    if (periodStr === "Q2") return 6;
    if (periodStr === "Q3") return 9;
    if (periodStr === "FINAL") return 12;

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

  const periodResults = useMemo(() => {
    if (!data || !selectedFeedback) return { objetivos: [], aptitudes: [], scores: { obj: 0, comp: 0, global: 0 } };
    const p = selectedFeedback.periodo;

    const feedbackLimit = getPeriodMonth(p);

    let totalObjScore = 0;
    let totalObjWeight = 0;
    let maxActiveObjWeight = 0;
    const timeFraction = Math.min(feedbackLimit / 12, 1);
    const objetivos = [];

    data.objetivos?.forEach(obj => {
      const relevantHitos = obj.hitos?.filter(h => getPeriodMonth(h.periodo) <= feedbackLimit) || [];
      let score = 0;

      const hitoPeriodo = obj.hitos?.find(h => {
        if (!h.periodo) return false;
        if (h.periodo === p) return true;
        if (h.periodo.endsWith(p)) return true;
        if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
        return false;
      });

      if (relevantHitos.length > 0) {
        score = calculateObjectiveProgress(obj, relevantHitos);
        maxActiveObjWeight += (obj.peso || 0);
      }

      const effectiveScore = score;
      totalObjScore += effectiveScore * (obj.peso || 0);
      totalObjWeight += (obj.peso || 0);

      objetivos.push({
        ...obj,
        hitoActual: hitoPeriodo,
        scorePeriodo: effectiveScore,
        rawScore: score
      });
    });

    const scoreObjRaw = totalObjWeight > 0 ? (totalObjScore / totalObjWeight) : 0;
    const scoreObj = scoreObjRaw * 0.7;

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
    const scoreComp = scoreCompRaw * 0.3;

    const global = scoreObj + scoreComp;

    const displayObj = scoreObj;
    const displayComp = scoreComp;
    const displayGlobal = global;

    const maxObj = (maxActiveObjWeight / 100) * 70;
    const maxComp = aptitudes.length > 0 ? 30 : 0;

    let expectedObjScore = 0;
    data.objetivos?.forEach(obj => {
      const isCumulative = obj.metas?.some(m => m.acumulativa || m.modoAcumulacion === 'acumulativo');
      const factor = isCumulative ? timeFraction : 1;
      expectedObjScore += (obj.peso || 0) * factor;
    });

    const expectedObjDisplay = (expectedObjScore / 100) * 70;
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
      expectedScores: {
        obj: expectedObjDisplay,
        comp: expectedCompDisplay,
        global: expectedObjDisplay + expectedCompDisplay
      },
      sparklineData: (() => {
        const timeline = ["Q1", "Q2", "Q3", "FINAL"];
        return timeline.map(tPeriod => {
          const relevantLimit = getPeriodMonth(tPeriod);

          let tObjScore = 0;
          data.objetivos?.forEach(o => {
            const rh = o.hitos?.filter(h => getPeriodMonth(h.periodo) <= relevantLimit) || [];
            if (rh.length > 0) {
              const prog = calculateObjectiveProgress(o, rh);
              tObjScore += calculateWeightedScore(prog, o.peso || 0);
            }
          });

          const rawComp = calculateCompetencyProgress(data.aptitudes, getPeriodMonth, relevantLimit);

          return {
            name: tPeriod === "FINAL" ? "Fin" : tPeriod,
            obj: tObjScore * 0.7,
            comp: rawComp * 0.3,
            global: (tObjScore * 0.7) + (rawComp * 0.3)
          };
        });
      })()
    };
  }, [data, selectedFeedback, getPeriodMonth]);

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
  }, [periodResults, activeTab, selectedItemId]);

  useEffect(() => {
    setViewPeriod(null);
  }, [selectedItemId, activeTab, selectedFeedback]);

  const handleSaveResponse = async () => {
    if (!selectedFeedback) return;

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

  return {
    user,
    empleadoNombre,
    empleadoId,
    data,
    feedbacks,
    selectedFeedback,
    setSelectedFeedback,
    loading,
    expandedItems,
    toggleExpand,
    localComment,
    setLocalComment,
    localAck,
    setLocalAck,
    localReason,
    setLocalReason,
    activeTab,
    setActiveTab,
    selectedItemId,
    setSelectedItemId,
    viewPeriod,
    setViewPeriod,
    showFinalReport,
    setShowFinalReport,
    globalAvisos,
    selectedYear,
    setSelectedYear,
    periodResults,
    getPeriodMonth,
    handleSaveResponse
  };
}
