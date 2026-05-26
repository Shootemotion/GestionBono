import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Hourglass, ChevronUp, ChevronDown } from "lucide-react";
import { calculateObjectiveProgress } from "@/utils/calculos";

export function getCierreLabel(meta) {
  const rule = meta.reglaCierre || "promedio";
  if (rule === "promedio") return "Promedio";
  if (rule === "cierre_unico") return "Cierre Único";
  if (rule === "umbral_periodos") return `Umbral (${meta.umbralPeriodos || "?"} per.)`;
  return rule.charAt(0).toUpperCase() + rule.slice(1);
}

// === Objective Card Component (Refined) ===
export const ObjectiveCard = ({ obj, currentPeriod, expanded, onToggle }) => {
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

        {/* Cronograma de Hitos */}
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
