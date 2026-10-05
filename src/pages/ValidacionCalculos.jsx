import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, Fragment } from "react";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, ChevronLeft, Search, Loader2, Calculator,
  AlertTriangle, CheckCircle2, Target, Sparkles, Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { dashEmpleado } from "@/lib/dashboard";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { computePeriodResults } from "@/utils/periodResults";
import { calculateMetaScore, calculateObjectiveProgress } from "@/utils/calculos";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import PanelDivergencias from "@/components/validacion/PanelDivergencias";

const PERIODS = ["Q1", "Q2", "Q3", "FINAL"];
const fmt = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toFixed(1));
const nombreEmp = (e) => `${e.apellido || ""}${e.apellido && e.nombre ? ", " : ""}${e.nombre || ""}`.trim() || e.email || "—";

/* Normaliza el dash del empleado a { objetivos:[], aptitudes:[] } que espera computePeriodResults */
function normalizeDash(dash) {
  const arr = (x) => (Array.isArray(x) ? x : x?.items || []);
  return { ...dash, objetivos: arr(dash?.objetivos), aptitudes: arr(dash?.aptitudes) };
}

/* Resultado de una meta en un período puntual (valor crudo cargado) */
function resultadoMetaEnPeriodo(obj, meta, periodo) {
  const hito = obj.hitos?.find((h) => h.periodo === periodo || h.periodo?.endsWith(periodo));
  const mr = hito?.metas?.find((m) => String(m._id) === String(meta._id) || m.nombre === meta.nombre);
  return mr?.resultado ?? null;
}

/* Explica POR QUÉ una meta puede dar distinto en seguimiento (lo que ve el empleado) vs al cierre anual */
function motivoMeta(meta) {
  const acum = meta.acumulativa || meta.modoAcumulacion === "acumulativo";
  if (meta.reglaCierre === "umbral_periodos") {
    return `Regla "umbral de períodos" (requiere ${meta.umbralPeriodos || "?"}): en seguimiento acredita proporcional (períodos aprobados ÷ requeridos); al cierre, si no se alcanza el umbral, cae a 0.`;
  }
  if (!meta.reconoceEsfuerzo) {
    return `La meta NO reconoce esfuerzo: en seguimiento se muestra el % real proporcional, pero al cierre es binario (cumple = 100% / no cumple = 0%).`;
  }
  if (acum) {
    return `Meta acumulativa: suma los resultados de todos los períodos contra el objetivo anual; el avance parcial puede verse bajo hasta cerrar el año.`;
  }
  return `Diferencia originada por la regla de cierre "${meta.reglaCierre || "promedio"}".`;
}

/* ============ Detalle de metas de un objetivo ============ */
function MetasDetalle({ obj }) {
  const metas = obj.metas || [];
  if (!metas.length) {
    return <div className="text-xs text-slate-400 italic px-4 py-3">Este objetivo no tiene metas configuradas (modo legacy).</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100">
            <th className="text-left px-3 py-2 font-semibold">Meta</th>
            <th className="text-left px-3 py-2 font-semibold">Config</th>
            {PERIODS.map((p) => (
              <th key={p} className="text-center px-2 py-2 font-semibold">{p}</th>
            ))}
            <th className="text-right px-3 py-2 font-semibold">Score meta</th>
          </tr>
        </thead>
        <tbody>
          {metas.map((m) => {
            const acum = m.acumulativa || m.modoAcumulacion === "acumulativo";
            const metaScore = calculateMetaScore(m, obj.hitos || [], false); // modo intermedio = el que ve el empleado
            return (
              <tr key={m._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-700 max-w-[200px]">
                  {m.nombre}
                  {m.pesoMeta != null && <span className="ml-1 text-[10px] text-slate-400">({m.pesoMeta}%)</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  <div className="flex flex-wrap gap-1">
                    <span className="bg-slate-100 rounded px-1.5 py-0.5">{m.operador || ">="} {m.esperado ?? m.target ?? "—"}</span>
                    <span className="bg-slate-100 rounded px-1.5 py-0.5">{m.reglaCierre || "promedio"}</span>
                    {acum && <span className="bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">acumulativa</span>}
                    {m.reconoceEsfuerzo && <span className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">reconoce esf.</span>}
                    {m.permiteOver && <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">over</span>}
                    {m.tolerancia ? <span className="bg-slate-100 rounded px-1.5 py-0.5">tol {m.tolerancia}</span> : null}
                    {m.reglaCierre === "umbral_periodos" && <span className="bg-slate-100 rounded px-1.5 py-0.5">umbral {m.umbralPeriodos}</span>}
                  </div>
                </td>
                {PERIODS.map((p) => {
                  const r = resultadoMetaEnPeriodo(obj, m, p);
                  return (
                    <td key={p} className="text-center px-2 py-2 font-mono text-slate-600">
                      {r === null ? <span className="text-slate-300">·</span> : String(r)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(metaScore)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Detalle completo de un empleado ============ */
function EmpleadoDetalle({ dashRaw, year }) {
  const dash = useMemo(() => normalizeDash(dashRaw), [dashRaw]);
  const [openObj, setOpenObj] = useState({});
  // Frontend: resultados por período (misma función que Mi Desempeño).
  // Le pasamos el año para que reproduzca exactamente lo que ve el empleado,
  // que es el sentido de esta pantalla.
  const porPeriodo = useMemo(() => {
    const m = {};
    PERIODS.forEach((p) => { m[p] = computePeriodResults(dash, p, year); });
    return m;
  }, [dash, year]);

  const objScoreEnPeriodo = (objId, p) =>
    porPeriodo[p]?.objetivos?.find((o) => String(o._id) === String(objId))?.scorePeriodo ?? null;

  // Análisis: seguimiento (lo que ve el empleado) vs cierre anual (nota final) + discrepancias con el backend
  const analisis = useMemo(() => {
    const notaActual = porPeriodo.FINAL?.scores?.global ?? 0; // intermedio, filtrado a fin de año
    const compFinal = porPeriodo.FINAL?.scores?.comp ?? 0;

    let totObj = 0, totPeso = 0;
    const objetivos = dash.objetivos.map((obj) => {
      const hitos = obj.hitos || [];
      const inter = hitos.length ? calculateObjectiveProgress(obj, hitos, false) : 0; // reconoce esfuerzo
      const cierre = hitos.length ? calculateObjectiveProgress(obj, hitos, true) : 0;  // regla estricta
      totObj += cierre * (obj.peso || 0);
      totPeso += obj.peso || 0;
      const back = obj.progreso;
      const metasDiff = (obj.metas || [])
        .map((m) => {
          const mi = calculateMetaScore(m, hitos, false);
          const mc = calculateMetaScore(m, hitos, true);
          return { meta: m, mi, mc, diff: Math.abs((mi || 0) - (mc || 0)) };
        })
        .filter((x) => x.diff > 0.1);
      return {
        obj, inter, cierre, back,
        cambiaEnCierre: Math.abs(inter - cierre) > 0.1,
        engineMismatch: back != null && Math.abs(cierre - back) > 1,
        metasDiff,
      };
    });

    const objCierre = (totPeso ? totObj / totPeso : 0) * 0.7;
    const notaFinalProyectada = objCierre + compFinal;
    const backendFinal = dash.scoreFinal;

    // ¿La nota del backend está CONGELADA por un cierre (snapshot)?
    const cerrados = (dash.feedbacks || []).filter((f) => f?.scores?.global != null);
    const hasSnapshot = cerrados.length > 0;
    const snapshotPeriodos = cerrados.map((f) => f.periodo);

    // Divergencia REAL de motor: por objetivo, frontend-cierre vs backend-progreso (ambos en vivo, sin snapshot)
    const objEngineMismatches = objetivos.filter((o) => o.engineMismatch);
    // Diferencia global recálculo-vivo vs backend (puede deberse al snapshot)
    const globalDiff = backendFinal == null ? 0 : Math.abs(notaFinalProyectada - backendFinal);
    const relevantes = objetivos.filter((o) => o.cambiaEnCierre || o.engineMismatch);
    return { notaActual, notaFinalProyectada, backendFinal, hasSnapshot, snapshotPeriodos, objEngineMismatches, globalDiff, relevantes };
  }, [dash, porPeriodo]);

  return (
    <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-5">
      {/* ANÁLISIS: nota final + diferencias explicadas */}
      <div className="bg-white rounded-xl border border-indigo-200 p-4">
        <div className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5" /> Análisis: nota final y diferencias
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ve hoy el empleado</div>
            <div className="text-2xl font-black text-slate-700">{fmt(analisis.notaActual)}%</div>
            <div className="text-[10px] text-slate-400">seguimiento (reconoce esfuerzo)</div>
          </div>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">Nota final proyectada</div>
            <div className="text-2xl font-black text-indigo-700">{fmt(analisis.notaFinalProyectada)}%</div>
            <div className="text-[10px] text-indigo-400">cierre anual (regla estricta)</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Backend (scoreFinal)</div>
            <div className="text-2xl font-black text-slate-700">{fmt(analisis.backendFinal)}%</div>
            <div className="text-[10px] text-slate-400">lo que guarda el sistema</div>
          </div>
        </div>

        {/* Veredicto 1: nota congelada por cierre (esperado, NO es bug) */}
        {analisis.hasSnapshot && analisis.globalDiff > 1.5 && (
          <div className="mb-3 flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Nota congelada por cierre (snapshot):</strong> el backend guarda la nota fijada al cerrar {analisis.snapshotPeriodos.join(", ")} ({fmt(analisis.backendFinal)}%). Un recálculo en vivo hoy da {fmt(analisis.notaFinalProyectada)}%. La diferencia es <strong>esperable</strong> — el cierre congela el valor; no es un error de cálculo.
            </span>
          </div>
        )}

        {/* Veredicto 2: divergencia REAL de motor a nivel objetivo (revisar) */}
        {analisis.objEngineMismatches.length > 0 && (
          <div className="mb-3 flex items-start gap-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Divergencia real de motor:</strong> {analisis.objEngineMismatches.length} objetivo(s) donde el motor del frontend y el del backend calculan distinto <em>en vivo</em> (independiente del cierre). Suele ser por metas "Cumple/No Cumple" o reglas de cierre/acumulación. Revisá los marcados ⚠️.
            </span>
          </div>
        )}

        {analisis.relevantes.length === 0 ? (
          <div className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            No hay diferencias: la nota que ve el empleado se mantiene al cierre{analisis.backendFinal != null ? " y coincide con el backend" : ""}.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> {analisis.relevantes.length} objetivo(s) donde el número cambia entre seguimiento y cierre:</div>
            {analisis.relevantes.map((r) => (
              <div key={r.obj._id} className={`rounded-lg border p-3 ${r.engineMismatch ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    {r.engineMismatch && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                    {r.obj.nombre}
                  </div>
                  <div className="text-xs font-mono text-slate-500 shrink-0">
                    seguimiento <strong className="text-slate-700">{fmt(r.inter)}%</strong> → cierre <strong className="text-indigo-700">{fmt(r.cierre)}%</strong>
                    {r.back != null && <span className="text-slate-400"> · backend {fmt(r.back)}%</span>}
                  </div>
                </div>
                {r.metasDiff.length > 0 ? (
                  <ul className="space-y-1 mt-1">
                    {r.metasDiff.map((md) => (
                      <li key={md.meta._id} className="text-[11px] text-slate-600 leading-snug flex gap-1.5">
                        <span className="text-slate-400 shrink-0">•</span>
                        <span>
                          <strong className="text-slate-700">{md.meta.nombre}</strong>: {fmt(md.mi)}% → {fmt(md.mc)}%. {motivoMeta(md.meta)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">La diferencia surge de la ponderación de metas del objetivo.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumen global: frontend por período vs backend */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5" /> Resumen — Frontend (lo que ve el empleado) vs Backend (scoringEngine)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left px-3 py-2">Métrica (frontend por período)</th>
                {PERIODS.map((p) => <th key={p} className="text-center px-2 py-2">{p}</th>)}
                <th className="text-right px-3 py-2 text-indigo-500">Backend</th>
              </tr>
            </thead>
            <tbody>
              {[
                { k: "obj", label: "Objetivos (×0.7)", back: dash.scoreObj },
                { k: "comp", label: "Competencias (×0.3)", back: dash.scoreApt },
                { k: "global", label: "Global", back: dash.scoreFinal },
              ].map((row) => (
                <tr key={row.k} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{row.label}</td>
                  {PERIODS.map((p) => (
                    <td key={p} className="text-center px-2 py-2 font-mono text-slate-600">{fmt(porPeriodo[p]?.scores?.[row.k])}%</td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-bold text-indigo-600">{fmt(row.back)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> El backend usa cierre anual estricto; el frontend usa modo intermedio (reconoce esfuerzo). Pueden diferir legítimamente en períodos abiertos.
        </p>
      </div>

      {/* Matriz de objetivos */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Target className="w-3.5 h-3.5" /> Objetivos — avance por período (frontend) y comparación con backend
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-3 py-2 w-8"></th>
                <th className="text-left px-3 py-2">Objetivo</th>
                <th className="text-center px-2 py-2">Peso</th>
                {PERIODS.map((p) => <th key={p} className="text-center px-2 py-2">{p}</th>)}
                <th className="text-center px-2 py-2 text-indigo-500">Backend (progreso anual)</th>
                <th className="text-center px-2 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {dash.objetivos.length === 0 && (
                <tr><td colSpan={PERIODS.length + 5} className="px-3 py-6 text-center text-slate-400 italic">Sin objetivos.</td></tr>
              )}
              {dash.objetivos.map((obj) => {
                const isOpen = !!openObj[obj._id];
                const frontFinal = objScoreEnPeriodo(obj._id, "FINAL");
                const backProg = obj.progreso;
                const delta = (frontFinal != null && backProg != null) ? Math.abs(frontFinal - backProg) : null;
                const mismatch = delta != null && delta > 1;
                return (
                  <Fragment key={obj._id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setOpenObj((s) => ({ ...s, [obj._id]: !s[obj._id] }))}>
                      <td className="px-3 py-2 text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                      <td className="px-3 py-2 font-medium text-slate-700 max-w-[240px]">{obj.nombre}</td>
                      <td className="text-center px-2 py-2 text-slate-500">{obj.peso}%</td>
                      {PERIODS.map((p) => {
                        const s = objScoreEnPeriodo(obj._id, p);
                        return <td key={p} className="text-center px-2 py-2 font-mono text-slate-600">{fmt(s)}%</td>;
                      })}
                      <td className="text-center px-2 py-2 font-mono font-bold text-indigo-600">{fmt(backProg)}%</td>
                      <td className="text-center px-2 py-2">
                        {delta == null ? <span className="text-slate-300">—</span> :
                          mismatch ? <span className="inline-flex items-center gap-1 text-amber-600 font-bold"><AlertTriangle className="w-3 h-3" />{fmt(delta)}</span>
                                   : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={PERIODS.length + 5} className="bg-slate-50/60 px-3 py-2 border-b border-slate-100">
                          <MetasDetalle obj={obj} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Competencias */}
      {dash.aptitudes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Competencias — promedio por período (frontend)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-3 py-2">Competencia</th>
                  <th className="text-center px-2 py-2">Peso</th>
                  {PERIODS.map((p) => <th key={p} className="text-center px-2 py-2">{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {dash.aptitudes.map((apt) => (
                  <tr key={apt._id} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700">{apt.nombre}</td>
                    <td className="text-center px-2 py-2 text-slate-500">{apt.peso}%</td>
                    {PERIODS.map((p) => {
                      const s = porPeriodo[p]?.aptitudes?.find((a) => String(a._id) === String(apt._id))?.scorePeriodo;
                      return <td key={p} className="text-center px-2 py-2 font-mono text-slate-600">{fmt(s)}%</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Página ============ */
export default function ValidacionCalculos() {
  const [year, setYear] = useState(() => getCurrentFiscalYear());
  const [empleados, setEmpleados] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [verDivergencias, setVerDivergencias] = useState(true);
  const [expandido, setExpandido] = useState(null); // empleadoId
  const [dashCache, setDashCache] = useState({}); // { `${id}_${year}`: dash }
  const [loadingDash, setLoadingDash] = useState(false);

  // --- Resultados cargados antes de la fecha de ingreso ---
  const [previas, setPrevias] = useState([]);          // resumen por persona
  const [previaAbierta, setPreviaAbierta] = useState(null);
  const [previaDetalle, setPreviaDetalle] = useState({}); // { empId: vista previa }
  const [borrando, setBorrando] = useState(null);

  const cargarPrevias = async () => {
    try {
      const res = await api("/evaluaciones/previas-ingreso");
      setPrevias(res?.empleados || []);
    } catch {
      setPrevias([]); // es información: si falla, la pantalla sigue andando
    }
  };

  useEffect(() => { cargarPrevias(); }, []);

  /** Pide la vista previa: el backend dice qué borraría sin tocar nada. */
  const verPrevia = async (empleadoId) => {
    if (previaAbierta === empleadoId) { setPreviaAbierta(null); return; }
    setPreviaAbierta(empleadoId);
    if (previaDetalle[empleadoId]) return;
    try {
      const res = await api(`/evaluaciones/previas-ingreso/${empleadoId}`);
      setPreviaDetalle((p) => ({ ...p, [empleadoId]: res }));
    } catch (e) {
      toast.error(e?.message || "No se pudo leer el detalle");
      setPreviaAbierta(null);
    }
  };

  const borrarPrevias = async (p) => {
    const vista = previaDetalle[p.empleadoId];
    if (!vista) return;
    if (!window.confirm(
      `Vas a borrar ${vista.total} resultados de ${p.nombre}, cargados en períodos anteriores a su ingreso.\n\n` +
      `Si tiene un feedback cerrado, la nota que ya recibió NO cambia —el feedback guarda su propio número—, ` +
      `pero si alguien lo reabre se recalcula sobre lo que quede.\n\n¿Confirmás?`
    )) return;

    setBorrando(p.empleadoId);
    try {
      const res = await api(`/evaluaciones/previas-ingreso/${p.empleadoId}?confirmar=true`, { method: "DELETE" });
      toast.success(`${res.borradas} resultados borrados de ${p.nombre}`);
      setPreviaAbierta(null);
      setPreviaDetalle((d) => { const c = { ...d }; delete c[p.empleadoId]; return c; });
      setDashCache({});  // los cálculos cacheados quedaron viejos
      await cargarPrevias();
    } catch (e) {
      toast.error(e?.message || "No se pudieron borrar");
    } finally {
      setBorrando(null);
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingList(true);
      try {
        // Traer todas las páginas (empleados activos; el endpoint pagina a máx 100)
        const acc = [];
        let page = 1;
        for (;;) {
          const res = await api(`/empleados?limit=100&page=${page}`);
          const items = Array.isArray(res) ? res : res?.items || [];
          acc.push(...items);
          const pages = res?.pages || 1;
          if (page >= pages || items.length === 0) break;
          page += 1;
        }
        if (!cancel) setEmpleados(acc);
      } catch {
        if (!cancel) toast.error("No se pudo cargar la lista de empleados.");
      } finally {
        if (!cancel) setLoadingList(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const list = q ? empleados.filter((e) => nombreEmp(e).toLowerCase().includes(q) || (e.puesto || "").toLowerCase().includes(q)) : empleados;
    return [...list].sort((a, b) => nombreEmp(a).localeCompare(nombreEmp(b), "es"));
  }, [empleados, busqueda]);

  const toggle = async (emp) => {
    if (expandido === emp._id) { setExpandido(null); return; }
    setExpandido(emp._id);
    const key = `${emp._id}_${year}`;
    if (dashCache[key]) return;
    setLoadingDash(true);
    try {
      const dash = await dashEmpleado(emp._id, year);
      setDashCache((c) => ({ ...c, [key]: dash || { objetivos: [], aptitudes: [] } }));
    } catch {
      toast.error("No se pudo cargar el desempeño de este empleado.");
    } finally {
      setLoadingDash(false);
    }
  };

  // al cambiar el año, cerramos el detalle (los datos son por año)
  useEffect(() => { setExpandido(null); }, [year]);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Calculator className="w-6 h-6 text-indigo-600" /> Validación de Cálculos
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Audita los <strong>datos reales</strong> ya cargados: para cada persona muestra qué valor se cargó en
              cada período, cómo se resolvió cada meta y de dónde sale su nota. Usa la misma calculadora
              que ven los empleados en Mi Desempeño.
            </p>
            {/* La diferencia entre las dos páginas confunde: se aclara acá y en
                la otra, en vez de que cada uno la deduzca abriendo ambas. */}
            <p className="text-xs text-slate-400 mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Esta pantalla <strong>no deja modificar nada</strong>: lee lo que está cargado y lo explica.
                Para probar qué pasaría con otros valores, usá{" "}
                <Link to="/simulador-motor" className="text-indigo-600 hover:underline font-medium">
                  Simulador Cierre de Cálculo
                </Link>.
              </span>
            </p>
          </div>
          <div className="flex items-center bg-white rounded-2xl px-3 py-2 border border-slate-200 shadow-sm">
            <SelectorAnioFiscal value={year} onChange={setYear} variant="stepper" size="md" showCaption />
          </div>
        </div>

        {/* POR QUÉ DIFIEREN LAS NOTAS
            Va primero porque es la pregunta con la que se entra a esta
            pantalla. El resto —el detalle meta por meta— es para después de
            saber dónde mirar. */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setVerDivergencias((v) => !v)}
            className="w-full flex items-center gap-2 text-left mb-3 group"
          >
            {verDivergencias ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600">
              Por qué difieren las notas comunicadas y las del motor
            </span>
            <span className="text-xs text-slate-400">
              — qué cambió entre el cierre y hoy, con la evidencia
            </span>
          </button>
          {verDivergencias && <PanelDivergencias year={year} />}
        </div>

        {/* Buscador */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empleado por nombre o puesto…"
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {/* Resultados cargados antes del ingreso.
            Es la única parte de esta pantalla que escribe, así que pide
            confirmación y muestra antes, una por una, las filas que se van. */}
        {previas.length > 0 && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/60 overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3 border-b border-rose-200/70">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-rose-900">
                  {previas.length === 1
                    ? "1 colaborador con resultados cargados antes de su fecha de ingreso"
                    : `${previas.length} colaboradores con resultados cargados antes de su fecha de ingreso`}
                </p>
                <p className="text-xs text-rose-800/80 mt-0.5">
                  Son períodos en los que la persona no estaba en la empresa. Esos valores
                  igual cuentan para su nota.
                </p>
              </div>
            </div>

            <div className="divide-y divide-rose-200/50">
              {previas.map((p) => {
                const abierto = previaAbierta === p.empleadoId;
                const vista = previaDetalle[p.empleadoId];
                return (
                  <div key={p.empleadoId}>
                    <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
                      <button
                        onClick={() => verPrevia(p.empleadoId)}
                        className="flex-1 text-left min-w-0 hover:text-rose-700 transition-colors"
                      >
                        <span className="font-bold text-slate-800">{p.nombre}</span>
                        {p.area && <span className="text-slate-400 text-xs"> · {p.area}</span>}
                        <span className="block text-xs text-slate-500">
                          ingresó el {new Date(p.fechaIngreso).toLocaleDateString("es-AR")} ·{" "}
                          <span className="font-bold text-rose-700">{p.cantidad}</span>{" "}
                          {p.cantidad === 1 ? "resultado previo" : "resultados previos"}
                        </span>
                      </button>
                      <button
                        onClick={() => verPrevia(p.empleadoId)}
                        className="text-xs font-bold text-rose-700 hover:underline shrink-0"
                      >
                        {abierto ? "Ocultar" : "Ver qué se borraría"}
                      </button>
                    </div>

                    {abierto && (
                      <div className="px-4 pb-3 bg-white/60">
                        {!vista ? (
                          <div className="py-3 text-xs text-slate-400 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
                          </div>
                        ) : (
                          <>
                            <table className="w-full text-xs mb-2">
                              <thead>
                                <tr className="text-slate-400 text-left">
                                  <th className="py-1 font-semibold">Período</th>
                                  <th className="py-1 font-semibold">Tipo</th>
                                  <th className="py-1 font-semibold">Objetivo / Competencia</th>
                                  <th className="py-1 font-semibold text-right">Valor cargado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {vista.aBorrar.map((o) => (
                                  <tr key={o._id}>
                                    <td className="py-1 font-mono text-slate-600">{o.periodo}</td>
                                    <td className="py-1 text-slate-400">{o.tipo}</td>
                                    <td className="py-1 text-slate-700 truncate max-w-[280px]">{o.objetivo}</td>
                                    <td className="py-1 text-right font-bold text-slate-700">
                                      {o.actual !== null ? o.actual : (o.valores || []).filter((v) => v !== null && v !== "").join(", ") || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => borrarPrevias(p)}
                                disabled={borrando === p.empleadoId}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {borrando === p.empleadoId
                                  ? "Borrando…"
                                  : `Borrar estos ${vista.total}`}
                              </button>
                              <span className="text-[11px] text-slate-500">
                                Queda registrado en la auditoría con su contenido: se puede reconstruir.
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabla de empleados */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loadingList ? (
            <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando empleados…</div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Sin resultados.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtrados.map((emp) => {
                const key = `${emp._id}_${year}`;
                const isOpen = expandido === emp._id;
                const dash = dashCache[key];
                return (
                  <div key={emp._id}>
                    <button onClick={() => toggle(emp)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">{nombreEmp(emp)}</div>
                        <div className="text-xs text-slate-400 truncate">{[emp.puesto, emp.area?.nombre].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      {isOpen && loadingDash && !dash && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                      {dash && (
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                          Global {fmt(dash.scoreFinal)}%
                        </span>
                      )}
                    </button>
                    {isOpen && dash && <EmpleadoDetalle dashRaw={dash} year={year} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-4 text-center">
          {filtrados.length} empleado(s) · Los datos se cargan por el mismo endpoint que usa Mi Desempeño ({`/dashboard/empleado/:id`}).
        </p>
      </div>
    </div>
  );
}
