import { useMemo, useRef } from "react";


import { useTour } from "@/hooks/useTour";


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



import { FeedbackStatusPanel } from "./MiDesempeno/components/FeedbackStatusPanel";
import { DetailView } from "./MiDesempeno/components/DetailView";
import { useDesempenoData } from "./MiDesempeno/hooks/useDesempenoData";

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











export default function MiDesempeno() {
    const {
    user, empleadoNombre, data, feedbacks, selectedFeedback, setSelectedFeedback,
    loading, localComment, setLocalComment, localAck, setLocalAck,
    localReason, setLocalReason, activeTab, setActiveTab, selectedItemId, setSelectedItemId,
    viewPeriod, setViewPeriod, showFinalReport, setShowFinalReport, globalAvisos,
    selectedYear, setSelectedYear, periodResults, getPeriodMonth, handleSaveResponse
  } = useDesempenoData();

  const avatarSrc = useMemo(() => fotoSrc(user?.empleado), [user?.empleado]);

  const sectionFeedbackRef = useRef(null);
  const sectionDetailsRef = useRef(null);
  const sectionValidationRef = useRef(null);

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

  const scrollToSection = (ref) => {
    const yOffset = -100; // Offset for sticky header
    const element = ref.current;
    if (element) {
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

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
    <FeedbackStatusPanel
      selectedFeedback={selectedFeedback}
      timelineItems={timelineItems}
      evaluatorName={evaluatorName}
    />

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
                      
                      <DetailView
                        item={activeTab === 'obj'
                          ? periodResults.objetivos.find(o => o._id === selectedItemId)
                          : periodResults.aptitudes.find(a => a._id === selectedItemId)}
                        activeTab={activeTab}
                        viewPeriod={viewPeriod}
                        selectedFeedback={selectedFeedback}
                        feedbacks={feedbacks}
                        getPeriodMonth={getPeriodMonth}
                        setViewPeriod={setViewPeriod}
                      />

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
