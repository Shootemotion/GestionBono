import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Trophy, Target, Sparkles, CheckCircle2,
  Clock, Lock, CalendarDays, ArrowLeft, PartyPopper, TrendingUp, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api";
import { ReporteFinal } from "@/components/ReporteFinal";
import { useDesempenoData } from "./MiDesempeno/hooks/useDesempenoData";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import { fiscalYearLabel } from "@/lib/fiscalYear";

/* ============ helpers ============ */
function fotoSrc(empleado) {
  const url = empleado?.fotoUrl;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = typeof API_ORIGIN === "string" && API_ORIGIN ? API_ORIGIN : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
}

function initials(user) {
  const base = user?.fullName || (user?.apellido ? `${user.apellido} ${user.nombre ?? ""}` : user?.email) || "";
  return base.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "US";
}

// Banda de estado en lenguaje amigable según % de avance
function banda(score) {
  const s = Number(score) || 0;
  if (s >= 90) return { label: "¡Excelente!", color: "emerald", emoji: "🎉" };
  if (s >= 70) return { label: "Muy bien", color: "teal", emoji: "👏" };
  if (s >= 50) return { label: "En camino", color: "amber", emoji: "💪" };
  if (s > 0) return { label: "A reforzar", color: "rose", emoji: "🔧" };
  return { label: "Sin datos", color: "slate", emoji: "—" };
}

const COLORS = {
  emerald: { text: "text-emerald-600", bg: "bg-emerald-50", ring: "text-emerald-500", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  teal: { text: "text-teal-600", bg: "bg-teal-50", ring: "text-teal-500", chip: "bg-teal-100 text-teal-700", bar: "bg-teal-500" },
  amber: { text: "text-amber-600", bg: "bg-amber-50", ring: "text-amber-500", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  rose: { text: "text-rose-600", bg: "bg-rose-50", ring: "text-rose-500", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  slate: { text: "text-slate-500", bg: "bg-slate-50", ring: "text-slate-300", chip: "bg-slate-100 text-slate-500", bar: "bg-slate-300" },
  blue: { text: "text-blue-600", bg: "bg-blue-50", ring: "text-blue-500", chip: "bg-blue-100 text-blue-700", bar: "bg-blue-500" },
};

/* ============ Progress Ring ============ */
function ScoreRing({ value = 0, max = 100, size = 132, stroke = 12, color = "blue", label, sub }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const col = COLORS[color] || COLORS.blue;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-slate-100" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          className={`${col.ring} transition-all duration-1000 ease-out`}
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-800 tracking-tight leading-none">{label}</span>
        {sub && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">{sub}</span>}
      </div>
    </div>
  );
}

/* ============ Quarter meta ============ */
const QUARTERS = [
  { id: "Q1", label: "1er Trimestre", mes: "Noviembre" },
  { id: "Q2", label: "2do Trimestre", mes: "Febrero" },
  { id: "Q3", label: "3er Trimestre", mes: "Mayo" },
  { id: "FINAL", label: "Cierre Anual", mes: "Agosto" },
];

const SHOW_SCORE_STATES = ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"];

export default function MiDesempenoBeta() {
  const {
    user, empleadoNombre, data, feedbacks, selectedFeedback, setSelectedFeedback,
    loading, localComment, setLocalComment, localAck, setLocalAck,
    localReason, setLocalReason, showFinalReport, setShowFinalReport,
    selectedYear, setSelectedYear, periodResults, handleSaveResponse,
  } = useDesempenoData();

  const avatarSrc = useMemo(() => fotoSrc(user?.empleado), [user?.empleado]);

  const showScores = selectedFeedback && SHOW_SCORE_STATES.includes(selectedFeedback.estado);
  const hasFinal = feedbacks.some((f) => f.periodo === "FINAL" && !f.isPlaceholder) || data?.evaluaciones?.some((e) => e.periodo === "FINAL");

  const global = Number(periodResults?.scores?.global || 0);
  const globalBanda = banda((global / ((periodResults?.maxScores?.global || 100))) * 100);

  const isEmpty = !loading && (!data || (!data.objetivos?.length && !data.aptitudes?.length));

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-slate-50 to-slate-50 pb-16">
      {/* Beta ribbon */}
      <div className="bg-indigo-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-3">
        <Sparkles className="w-3.5 h-3.5" />
        Estás viendo la <strong>versión Beta</strong> de Mi Desempeño
        <Link to="/mi-desempeno" className="ml-2 inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-3 py-0.5 transition-colors">
          <ArrowLeft className="w-3 h-3" /> Volver a la versión actual
        </Link>
      </div>

      {/* HERO */}
      <div className="px-4 md:px-8 pt-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-6 justify-between">
              {/* Saludo */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-indigo-500/20">
                    {avatarSrc ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials(user)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 font-medium">¡Hola de nuevo!</div>
                  <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight leading-tight">{empleadoNombre}</h1>
                  <p className="text-slate-400 text-sm mt-0.5">Así viene tu año de desempeño</p>
                </div>
              </div>

              {/* Año + resultado anual */}
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-slate-50 rounded-2xl px-3 py-2 border border-slate-100">
                  <SelectorAnioFiscal
                    value={selectedYear}
                    onChange={setSelectedYear}
                    variant="stepper"
                    size="md"
                    showCaption
                  />
                </div>
                {hasFinal && (
                  <Button onClick={() => setShowFinalReport(true)} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20 rounded-2xl h-12 px-5">
                    <Trophy className="w-4 h-4 mr-2" /> Resultado anual
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="max-w-6xl mx-auto px-4 md:px-8 mt-8">
          <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center text-slate-400">Cargando tu desempeño…</div>
        </div>
      ) : isEmpty ? (
        <div className="max-w-6xl mx-auto px-4 md:px-8 mt-8">
          <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CalendarDays className="w-9 h-9 text-indigo-300" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Todavía no hay evaluaciones para el {fiscalYearLabel(selectedYear)}</h2>
            <p className="text-slate-500 max-w-md mx-auto">Cuando RRHH genere tus objetivos y competencias para este año fiscal, vas a verlos acá.</p>
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 md:px-8 mt-8 space-y-8">

          {/* SELECTOR DE TRIMESTRES */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Elegí un período
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {QUARTERS.map((q) => {
                const fb = feedbacks.find((f) => f.periodo === q.id);
                const isSel = selectedFeedback?.periodo === q.id;
                const done = fb && ["SENT", "REALIZADO", "PENDING_HR", "ACKNOWLEDGED", "CLOSED"].includes(fb.estado);
                const closed = fb?.estado === "CLOSED";
                const future = !fb || fb.isPlaceholder;

                let estadoTxt = "Pendiente", Icon = Clock, tone = "text-amber-500 bg-amber-50";
                if (closed) { estadoTxt = "Finalizado"; Icon = CheckCircle2; tone = "text-emerald-600 bg-emerald-50"; }
                else if (done) { estadoTxt = "En revisión"; Icon = TrendingUp; tone = "text-blue-600 bg-blue-50"; }
                else if (future) { estadoTxt = "Próximamente"; Icon = Lock; tone = "text-slate-400 bg-slate-50"; }

                return (
                  <button
                    key={q.id}
                    onClick={() => { if (fb) setSelectedFeedback(fb); }}
                    disabled={!fb}
                    className={`text-left rounded-2xl border p-4 transition-all ${
                      isSel ? "border-indigo-400 bg-white shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-100 -translate-y-0.5"
                            : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                    } ${!fb ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>
                        <Icon className="w-3 h-3" /> {estadoTxt}
                      </span>
                      {q.id === "FINAL" && <Trophy className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className={`font-bold ${isSel ? "text-indigo-700" : "text-slate-800"}`}>{q.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Revisión de {q.mes}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {!selectedFeedback || selectedFeedback.isPlaceholder ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-14 text-center text-slate-400">
              Elegí un período con evaluación para ver el detalle.
            </div>
          ) : (
            <>
              {/* RESUMEN DEL PERÍODO */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  {/* Ring global */}
                  <div className="flex flex-col items-center shrink-0">
                    <ScoreRing
                      value={global}
                      max={periodResults?.maxScores?.global || 100}
                      color={globalBanda.color}
                      label={showScores ? `${global.toFixed(0)}%` : "--"}
                      sub="Global"
                    />
                    {showScores && (
                      <div className={`mt-3 inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${COLORS[globalBanda.color].chip}`}>
                        <span>{globalBanda.emoji}</span> {globalBanda.label}
                      </div>
                    )}
                  </div>

                  {/* Desglose obj / comp */}
                  <div className="flex-1 w-full space-y-5">
                    {[
                      { icon: Target, name: "Objetivos", peso: "70%", score: periodResults.scores.obj, max: periodResults.maxScores?.obj || 70, esperado: periodResults.expectedScores?.obj, color: "blue" },
                      { icon: Sparkles, name: "Competencias", peso: "30%", score: periodResults.scores.comp, max: periodResults.maxScores?.comp || 30, esperado: periodResults.expectedScores?.comp, color: "teal" },
                    ].map((row) => {
                      const col = COLORS[row.color];
                      const pct = Math.min(((row.score || 0) / (row.max || 1)) * 100, 100);
                      const Icon = row.icon;
                      return (
                        <div key={row.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${col.bg} ${col.text}`}><Icon className="w-4 h-4" /></div>
                              <span className="font-bold text-slate-700 text-sm">{row.name}</span>
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Peso {row.peso}</span>
                            </div>
                            <div className="text-lg font-black text-slate-800">{showScores ? `${Number(row.score).toFixed(1)}%` : "--"}</div>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${col.bar} rounded-full transition-all duration-1000 ease-out`} style={{ width: showScores ? `${pct}%` : "0%" }} />
                          </div>
                          {showScores && row.esperado != null && (
                            <div className="text-[11px] text-slate-400 mt-1">Esperado para este período: <strong className="text-slate-600">{Number(row.esperado).toFixed(1)}%</strong></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* OBJETIVOS */}
              <section>
                <h2 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500" /> Tus objetivos
                </h2>
                <p className="text-sm text-slate-400 mb-4">Cómo venís en cada objetivo asignado para este período.</p>

                {periodResults.objetivos.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {periodResults.objetivos.map((obj) => {
                      const b = banda(obj.scorePeriodo);
                      const col = COLORS[b.color];
                      const ponderado = Number((obj.scorePeriodo * (obj.peso || 0)) / 100).toFixed(1);
                      return (
                        <div key={obj._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 className="font-bold text-slate-800 leading-snug">{obj.nombre}</h3>
                            <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">Peso {obj.peso}%</span>
                          </div>

                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${col.chip}`}>
                              <span>{b.emoji}</span> {b.label}
                            </span>
                            <span className="text-2xl font-black text-slate-800">{showScores ? `${Number(obj.scorePeriodo).toFixed(0)}%` : "--"}</span>
                          </div>

                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                            <div className={`h-full ${col.bar} rounded-full transition-all duration-1000 ease-out`} style={{ width: showScores ? `${Math.min(obj.scorePeriodo, 100)}%` : "0%" }} />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50 pt-2.5">
                            <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Aporta al global</span>
                            <span className="font-bold text-slate-600">{showScores ? `${ponderado}%` : "--"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">No hay objetivos en este período.</div>
                )}
              </section>

              {/* COMPETENCIAS */}
              <section>
                <h2 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-500" /> Tus competencias
                </h2>
                <p className="text-sm text-slate-400 mb-4">Las habilidades blandas que se evalúan durante todo el año.</p>

                {periodResults.aptitudes.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {periodResults.aptitudes.map((apt) => {
                      const b = banda(apt.scorePeriodo);
                      const col = COLORS[b.color];
                      return (
                        <div key={apt._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
                          <h3 className="font-bold text-slate-800 leading-snug mb-3 min-h-[2.5rem]">{apt.nombre}</h3>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${col.chip}`}>{b.emoji} {b.label}</span>
                            <span className="text-xl font-black text-slate-800">{showScores ? `${Number(apt.scorePeriodo).toFixed(0)}%` : "--"}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${col.bar} rounded-full transition-all duration-1000 ease-out`} style={{ width: showScores ? `${Math.min(apt.scorePeriodo, 100)}%` : "0%" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">No hay competencias en este período.</div>
                )}
              </section>

              {/* CONFORMIDAD */}
              <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
                <h2 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Tu conformidad
                </h2>
                <p className="text-sm text-slate-400 mb-5">Contanos si estás de acuerdo con esta evaluación.</p>

                {selectedFeedback.estado === "CLOSED" ? (
                  <div className="p-4 bg-slate-50 text-slate-500 text-sm rounded-2xl flex items-center gap-3 border border-slate-100">
                    <Lock className="w-5 h-5" /> Este período está cerrado y no se puede modificar.
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setLocalAck("ACK")}
                        disabled={selectedFeedback.estado !== "SENT"}
                        className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-3 ${localAck === "ACK" ? "border-emerald-400 bg-emerald-50" : "border-slate-100 hover:border-slate-200"} disabled:opacity-50`}
                      >
                        <PartyPopper className={`w-6 h-6 ${localAck === "ACK" ? "text-emerald-500" : "text-slate-300"}`} />
                        <div>
                          <div className="font-bold text-slate-800 text-sm">Estoy de acuerdo</div>
                          <div className="text-xs text-slate-400">La evaluación refleja mi desempeño.</div>
                        </div>
                      </button>
                      <button
                        onClick={() => setLocalAck("CONTEST")}
                        disabled={selectedFeedback.estado !== "SENT"}
                        className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-3 ${localAck === "CONTEST" ? "border-rose-400 bg-rose-50" : "border-slate-100 hover:border-slate-200"} disabled:opacity-50`}
                      >
                        <Info className={`w-6 h-6 ${localAck === "CONTEST" ? "text-rose-500" : "text-slate-300"}`} />
                        <div>
                          <div className="font-bold text-slate-800 text-sm">En desacuerdo</div>
                          <div className="text-xs text-slate-400">Quiero dejar un comentario.</div>
                        </div>
                      </button>
                    </div>

                    {localAck === "CONTEST" && (
                      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-sm font-bold text-slate-700 mb-2 block">Motivo del desacuerdo <span className="text-rose-500">*</span></label>
                        <select
                          value={localReason}
                          onChange={(e) => setLocalReason(e.target.value)}
                          disabled={selectedFeedback.estado !== "SENT"}
                          className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
                        className="w-full h-28 rounded-2xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none bg-slate-50 focus:bg-white"
                        placeholder="Escribí tus comentarios sobre esta evaluación..."
                        value={localComment}
                        onChange={(e) => setLocalComment(e.target.value)}
                        disabled={selectedFeedback.estado !== "SENT"}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveResponse}
                        disabled={selectedFeedback.estado !== "SENT" || !localAck}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-2xl px-8 h-12 disabled:opacity-50"
                      >
                        {selectedFeedback.estado !== "SENT" ? "Ya enviado" : "Enviar mi respuesta"}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      <ReporteFinal
        isOpen={showFinalReport}
        onClose={() => setShowFinalReport(false)}
        data={data}
        empleado={data?.empleado}
        anio={selectedYear}
        scoreGlobal={periodResults?.sparklineData?.find((d) => d.name === "Fin")?.global ?? 0}
        evolutionData={periodResults?.sparklineData || []}
      />
    </div>
  );
}
