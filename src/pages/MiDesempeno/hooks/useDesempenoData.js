import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { dashEmpleado } from '@/lib/dashboard';
import { getCurrentFiscalYear } from '@/lib/scoreHelpers';
// import { fotoSrc } from '@/utils/fotoSrc';
import { computePeriodResults, getPeriodMonth } from '@/utils/periodResults';
import { notaDelFeedback } from '@/lib/notaFeedback';
import { AF_REGLAS_CORREGIDAS } from '@/utils/calculos';

// Selección especial de la lista de detalle: en vez de un objetivo puntual,
// muestra el resumen de cómo se compone el puntaje.
export const ID_RESUMEN = "__resumen__";

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

  const periodResults = useMemo(
    () => {
      // El año decide si aplica el techo unificado: los ciclos ya cerrados se
      // calculan exactamente como antes (ver AF_TECHO_UNIFICADO).
      const vivo = computePeriodResults(data, selectedFeedback?.periodo, selectedYear);
      if (!vivo) return vivo;

      // Si el feedback YA tiene su nota guardada, esa es la nota.
      //
      // Es la que el jefe evaluó, la que se le comunicó a la persona y la que
      // queda en su legajo. Recalcularla en vivo hacía que la pantalla dijera
      // un número y el feedback otro: a Guido Barretto la pantalla le mostraba
      // 88,9 mientras su feedback decía 76,1.
      //
      // RIGE PARA TODOS LOS AÑOS.
      //
      // Estuvo acotado al AF2026 un tiempo, para no cambiarle el número en
      // pantalla a nadie en medio de la entrega de resultados. Esa cautela
      // salió peor: el backend ya usaba la nota guardada siempre —el bono se
      // calcula con ella— así que durante el AF2025 la persona veía acá el
      // recálculo y habría cobrado sobre otro número. Eran 11 casos en el
      // feedback FINAL, dos de ellos con más de 20 puntos de diferencia.
      //
      // Acordado con RRHH: la nota es la que el jefe evaluó, vio en su
      // pantalla y comunicó, y que la persona vio en la suya. Una sola, en
      // todas las pantallas y todos los años.
      //
      // El desglose por objetivo se sigue calculando en vivo: es el detalle que
      // explica la nota, no la nota.
      // `notaDelFeedback` devuelve la confirmada por RRHH si la hay, y si no
      // la foto guardada. Leer `scores` a mano acá mostraba el número viejo
      // cuando se confirmaba otro: a Tania Simunovich se le confirmó 79,9 y
      // esta pantalla le seguía diciendo 63,6.
      const guardada = notaDelFeedback(selectedFeedback);
      if (!guardada) return vivo;

      return {
        ...vivo,
        scores: {
          obj: Number(guardada.obj ?? vivo.scores.obj),
          comp: Number(guardada.comp ?? vivo.scores.comp),
          global: Number(guardada.global),
        },
        // Para que la pantalla pueda decir de dónde sale el número.
        notaDelFeedback: true,
        notaConfirmada: guardada.confirmada,
        scoresEnVivo: vivo.scores,
      };
    },
    [data, selectedFeedback, selectedYear]
  );

  useEffect(() => {
    if (periodResults) {
      // El resumen es una selección válida aunque no sea un item de la lista.
      if (selectedItemId === ID_RESUMEN) return;
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
