import React, { useState } from "react";
import { 
  Target, Calendar, CircleCheck, CircleAlert, Hourglass, 
  ChevronUp, ChevronDown 
} from "lucide-react";
import { 
  ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, ReferenceLine, Bar, Cell 
} from "recharts";
import { calculateObjectiveProgress, calculateWeightedScore } from "@/utils/calculos";
import { getCierreLabel } from "./ObjectiveCard"; // Assuming we exported it

export const DetailView = ({
  item,
  activeTab,
  viewPeriod,
  selectedFeedback,
  feedbacks,
  getPeriodMonth,
  setViewPeriod
}) => {
  const [showGraph, setShowGraph] = useState(false);

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

      // Identify the BEST hito to show
      const qMapEnd = { "Q1": "M11", "Q2": "M02", "Q3": "M05", "FINAL": "M08" };
      displayPeriod = qMapEnd[suffix] || "M11";

      const relevantHitos = item.hitos?.filter(h => {
        if (!h.periodo) return false;
        return targetMonths.some(m => h.periodo.endsWith(m));
      });

      if (relevantHitos && relevantHitos.length > 0) {
        relevantHitos.sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo));
        displayPeriod = relevantHitos[relevantHitos.length - 1].periodo;
      }

      activeMonths = targetMonths;
    } else {
      displayPeriod = selectedFeedback.periodo;
      activeMonths = [selectedFeedback.periodo];
    }
  } else {
    activeMonths = [displayPeriod];
  }

  // Find the Hito for the Display Period
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
    const isSelected = activeMonths.some(m => p === m || p.endsWith(m));
    let feedbackPeriod = p;
    if (isMonthly) {
      feedbackPeriod = Object.keys(periodMonthsMap).find(key => periodMonthsMap[key].some(m => p.endsWith(m))) || p;
    }

    const periodFeedback = feedbacks.find(f => f.periodo === feedbackPeriod || f.periodo.endsWith(feedbackPeriod));
    const isVisible = periodFeedback && ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(periodFeedback.estado);

    let rawScore = 0;
    let weightedScore = 0;

    if (activeTab === 'obj') {
      const limitByPeriod = getPeriodMonth(p);
      const relevantHitos = item.hitos?.filter(h => getPeriodMonth(h.periodo) <= limitByPeriod) || [];

      if (relevantHitos.length > 0) {
        const prog = calculateObjectiveProgress(item, relevantHitos);
        weightedScore = calculateWeightedScore(prog, item.peso || 0);
        rawScore = prog;
      }
    } else {
      const h = item.hitos?.find(h => {
        if (!h.periodo) return false;
        if (h.periodo === p) return true;
        if (h.periodo.endsWith(p)) return true;
        if (p === "FINAL" && (h.periodo.endsWith("Q4") || h.periodo.endsWith("A1"))) return true;
        return false;
      });
      rawScore = h?.actual ?? 0;
      weightedScore = rawScore;
    }

    return {
      name: p,
      score: isVisible ? weightedScore : 0,
      rawScore: isVisible ? rawScore : 0,
      meta: maxScore,
      isCurrent: isSelected,
      isVisible
    };
  });

  const showScores = ["SENT", "PENDING_HR", "CLOSED", "ACKNOWLEDGED"].includes(selectedFeedback?.estado);
  const metaLabel = activeTab === 'obj' ? `Meta: ${maxScore}%` : `Meta: ${maxScore}%`;

  const hitosUpToDisplay = item.hitos?.filter(h => h.periodo && getPeriodMonth(h.periodo) <= getPeriodMonth(displayPeriod)) || [];
  const recalcProgress = showScores && activeTab === 'obj' && hitosUpToDisplay.length > 0
    ? calculateObjectiveProgress(item, hitosUpToDisplay)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-bold text-zinc-800">{item.nombre}</h2>
        {item.descripcion && <p className="text-sm text-zinc-500 mt-1 font-medium">{item.descripcion}</p>}
      </div>

      {/* Flattened Detail View */}
      <div className="space-y-6">
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

        {/* Metas List */}
        <div className="space-y-6">
          {activeTab === 'obj' && item.metas?.length > 0 ? (
            item.metas.map((metaDef, idx) => {
              const metaResult = displayHito?.metas?.find(m => (m.metaId === metaDef._id || m._id === metaDef._id || m.nombre === metaDef.nombre));
              const isAcumulativo = metaDef?.modoAcumulacion === "acumulativo";
              let valorEvaluado = metaResult?.resultado;

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
              let rawCompliance = 0;

              if (target > 0) {
                if (isLessBetter) {
                  rawCompliance = valorEvaluado > 0 ? (target / valorEvaluado) * 100 : 100;
                  if (valorEvaluado === 0) rawCompliance = 100;
                } else {
                  rawCompliance = (valorEvaluado / target) * 100;
                }
              }

              const clampedCompliance = Math.min(Math.max(rawCompliance, 0), 100);
              const isSuccess = isLessBetter ? (valorEvaluado <= target) : (valorEvaluado >= target);

              return (
                <div key={idx} className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all">
                  {/* HEADER */}
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

                  {/* BODY */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
                    {/* LEFT: Config table */}
                    <div className="lg:col-span-2 p-5">
                      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.12em] mb-3">Configuración de evaluación</p>
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                            <td className="py-1.5 pr-4 text-zinc-400 font-semibold w-28 align-top text-[11px]">Objetivo</td>
                            <td className={`py-1.5 font-bold text-[11px] ${isLessBetter ? 'text-amber-600' : 'text-emerald-700'}`}>
                              {metaDef?.operador || ">="} {target} <span className="text-zinc-400 font-medium">{metaDef?.unidad || "puntos"}</span>
                            </td>
                          </tr>
                          <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                            <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Dirección</td>
                            <td className="py-1.5 text-zinc-700 font-medium text-[11px]">
                              {isLessBetter ? "Minimizar (menor es mejor)" : "Maximizar (mayor es mejor)"}
                            </td>
                          </tr>
                          <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                            <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Acumulación</td>
                            <td className="py-1.5 text-zinc-700 font-medium text-[11px]">
                              {metaDef?.modoAcumulacion === "acumulativo" ? "Acumulativo (suma período a período)" : "Por período (evaluación independiente)"}
                            </td>
                          </tr>
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
                          {(metaDef?.tolerancia ?? 0) > 0 && (
                            <tr className="border-b border-zinc-200 odd:bg-zinc-50/60">
                              <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Tolerancia</td>
                              <td className="py-1.5 text-zinc-700 font-medium text-[11px]">±{metaDef.tolerancia} {metaDef?.unidad || ""}</td>
                            </tr>
                          )}
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
                          <tr>
                            <td className="py-1.5 pr-4 text-zinc-400 font-semibold align-top text-[11px]">Tope máximo</td>
                            <td className={`py-1.5 font-medium text-[11px] ${metaDef?.permiteOver ? 'text-emerald-600' : 'text-zinc-500'}`}>
                              {metaDef?.permiteOver ? "Puede superar 100% (over compliance)" : "Tope en 100%"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* RIGHT: Result */}
                    <div className="lg:col-span-1 flex flex-col divide-y divide-zinc-200 border-l border-zinc-200">
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

                  {/* PERÍODO EVALUADO */}
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
                      const metOk = typeof hVal === 'number' && hVal >= 60;

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

      {/* Evolution Graph */}
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
