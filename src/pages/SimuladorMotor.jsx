import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Search, Loader2, FlaskConical, AlertTriangle,
  Target, Sparkles, Info, RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { dashEmpleado } from "@/lib/dashboard";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { calculateObjectiveProgress, calculateMetaScore, calculateCompetencyProgress } from "@/utils/calculos";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";

const fmt = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toFixed(1));
const nombreEmp = (e) => `${e.apellido || ""}${e.apellido && e.nombre ? ", " : ""}${e.nombre || ""}`.trim() || e.email || "—";
const stripYear = (p) => String(p || "").replace(/^\d{4}/, "");
const parseNum = (s) => {
  if (s === "" || s === null || s === undefined) return null;
  const n = Number(String(s).replace(",", "."));
  return isNaN(n) ? null : n;
};
const arr = (x) => (Array.isArray(x) ? x : x?.items || []);

// Config con divergencia conocida entre motores (según el estudio head-to-head)
const configRiesgosa = (m) => {
  const acum = m.acumulativa || m.modoAcumulacion === "acumulativo";
  const bin = String(m.unidad || "").toLowerCase().includes("cumple");
  return m.reglaCierre === "promedio" && (acum || bin);
};

export default function SimuladorMotor() {
  const [year, setYear] = useState(() => getCurrentFiscalYear());
  const [empleados, setEmpleados] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState(null); // empleado seleccionado
  const [dash, setDash] = useState(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [modoCierre, setModoCierre] = useState(true); // frontend: cierre estricto vs seguimiento
  const [valores, setValores] = useState({}); // { objId: { metaId: { periodo: str } } }
  const [aptValores, setAptValores] = useState({}); // { aptId: { periodo: str } }
  const [back, setBack] = useState(null); // resultado motor backend
  const [loadingBack, setLoadingBack] = useState(false);

  // Dirección, RRHH y superadmin ven a todos; el resto recibe solo su alcance.
  const { user } = useAuth();
  const alcanceAcotado = !!user && !(user.isSuper || user.isRRHH || user.isDirectivo);

  // Lista de empleados (todas las páginas)
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingList(true);
      try {
        const acc = [];
        for (let p = 1; ; p++) {
          const res = await api(`/empleados?limit=100&page=${p}`);
          const items = arr(res);
          acc.push(...items);
          if (p >= (res?.pages || 1) || items.length === 0) break;
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

  // Cargar dashboard del empleado e inicializar valores con los resultados reales
  const cargarEmpleado = useCallback(async (emp) => {
    setSel(emp);
    setDash(null);
    setBack(null);
    setLoadingDash(true);
    try {
      const d = await dashEmpleado(emp._id, year);
      const norm = { ...d, objetivos: arr(d?.objetivos), aptitudes: arr(d?.aptitudes) };
      setDash(norm);
      // init valores
      const v = {};
      for (const o of norm.objetivos) {
        v[o._id] = {};
        for (const m of o.metas || []) {
          v[o._id][m._id] = {};
          for (const h of o.hitos || []) {
            const mr = h.metas?.find((x) => String(x._id) === String(m._id) || x.nombre === m.nombre);
            v[o._id][m._id][h.periodo] = mr?.resultado ?? "";
          }
        }
      }
      setValores(v);
      const av = {};
      for (const a of norm.aptitudes) {
        av[a._id] = {};
        for (const h of a.hitos || []) av[a._id][h.periodo] = h.actual ?? "";
      }
      setAptValores(av);
    } catch {
      toast.error("No se pudo cargar el desempeño del empleado.");
    } finally {
      setLoadingDash(false);
    }
  }, [year]);

  useEffect(() => {
    if (sel) cargarEmpleado(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const setVal = (objId, metaId, periodo, value) =>
    setValores((s) => ({ ...s, [objId]: { ...s[objId], [metaId]: { ...s[objId]?.[metaId], [periodo]: value } } }));
  const setApt = (aptId, periodo, value) =>
    setAptValores((s) => ({ ...s, [aptId]: { ...s[aptId], [periodo]: value } }));

  const resetear = () => { if (sel) cargarEmpleado(sel); };

  // ===== Motor FRONTEND (vivo) =====
  const front = useMemo(() => {
    if (!dash) return null;
    let objW = 0, objWScore = 0;
    const objetivos = dash.objetivos.map((o) => {
      const hitos = (o.hitos || []).map((h) => ({
        periodo: h.periodo,
        metas: (o.metas || []).map((m) => ({ _id: m._id, resultado: parseNum(valores[o._id]?.[m._id]?.[h.periodo]) })),
      }));
      const objScore = hitos.length ? calculateObjectiveProgress(o, hitos, modoCierre) : 0;
      const metas = {};
      (o.metas || []).forEach((m) => { metas[m._id] = calculateMetaScore(m, hitos, modoCierre); });
      objW += Number(o.peso || 0);
      objWScore += objScore * Number(o.peso || 0);
      return { objId: o._id, objScore, metas };
    });
    const objRaw = objW ? objWScore / objW : 0;

    const aptShaped = dash.aptitudes.map((a) => ({
      peso: a.peso,
      hitos: (a.hitos || []).map((h) => ({ periodo: h.periodo, actual: parseNum(aptValores[a._id]?.[h.periodo]) })),
    }));
    const compRaw = calculateCompetencyProgress(aptShaped, undefined, undefined);
    const global = 0.7 * objRaw + 0.3 * compRaw;
    return { objetivos, objRaw, compRaw, global };
  }, [dash, valores, aptValores, modoCierre]);

  // ===== Motor BACKEND (debounced) =====
  useEffect(() => {
    if (!dash) return;
    const t = setTimeout(async () => {
      setLoadingBack(true);
      try {
        const objetivos = dash.objetivos.map((o) => ({
          _id: o._id,
          peso: o.peso,
          pesoBase: o.peso,
          metas: (o.metas || []).map((m) => ({
            ...m,
            registros: (o.hitos || [])
              .map((h) => ({ periodo: h.periodo, valor: parseNum(valores[o._id]?.[m._id]?.[h.periodo]) }))
              .filter((r) => r.valor !== null),
          })),
        }));
        const aptitudes = dash.aptitudes.map((a) => {
          const vals = (a.hitos || []).map((h) => parseNum(aptValores[a._id]?.[h.periodo])).filter((x) => x !== null);
          const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
          return { peso: a.peso, pesoBase: a.peso, valor: avg };
        });
        const res = await api("/simulacion/calcular", { method: "POST", body: { objetivos, aptitudes, pesoObj: 0.7, pesoApt: 0.3 } });
        const mapObj = {};
        (res?.objetivos || []).forEach((ro, i) => {
          const oid = objetivos[i]?._id;
          const metasMap = {};
          (ro.metas || []).forEach((rm, j) => { const mid = objetivos[i]?.metas?.[j]?._id; if (mid) metasMap[mid] = rm.scoreMeta; });
          mapObj[oid] = { actual: ro.actual, metas: metasMap };
        });
        setBack({ objetivos: mapObj, resumen: res?.resumen });
      } catch {
        setBack(null);
      } finally {
        setLoadingBack(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [dash, valores, aptValores]);

  const DeltaBadge = ({ f, b }) => {
    if (f == null || b == null) return <span className="text-slate-300">—</span>;
    const d = Math.abs(f - b);
    if (d <= 0.5) return <span className="text-emerald-500 text-[10px] font-bold">OK</span>;
    return <span className="inline-flex items-center gap-0.5 text-rose-600 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" />Δ{d.toFixed(1)}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-indigo-600" /> Simulador Cierre de Cálculo
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Cargá <strong>valores hipotéticos</strong> sobre los objetivos reales de un empleado y mirá cómo
              cerraría su nota. Nada de lo que escribas acá se guarda.
            </p>
            {/* La diferencia entre las dos páginas confunde: se aclara acá y en
                la otra, en vez de que cada uno la deduzca abriendo ambas. */}
            <p className="text-xs text-slate-400 mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Esta pantalla es para <strong>probar escenarios</strong>. Para auditar lo que ya está cargado —qué
                valor tiene cada período y de dónde sale la nota de cada persona— usá{" "}
                <Link to="/validacion-calculos" className="text-indigo-600 hover:underline font-medium">
                  Validación de Cálculos
                </Link>.
              </span>
            </p>
          </div>
          <div className="flex items-center bg-white rounded-2xl px-3 py-2 border border-slate-200 shadow-sm">
            <SelectorAnioFiscal value={year} onChange={setYear} variant="stepper" size="md" showCaption />
          </div>
        </div>

        {!sel ? (
          <>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empleado…" className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            </div>
            {/* La lista llega ya acotada por el backend: un jefe solo recibe su
                gente. Lo decimos para que no parezca que faltan empleados. */}
            {!loadingList && (
              <p className="text-xs text-slate-400 mb-4 px-1">
                {alcanceAcotado
                  ? `${empleados.length} ${empleados.length === 1 ? "persona a tu cargo" : "personas a tu cargo"}`
                  : `${empleados.length} empleados`}
              </p>
            )}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingList ? (
                <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando empleados…</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                  {filtrados.map((emp) => (
                    <button key={emp._id} onClick={() => cargarEmpleado(emp)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">{nombreEmp(emp)}</div>
                        <div className="text-xs text-slate-400 truncate">{[emp.puesto, emp.area?.nombre].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Barra empleado + controles */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 mb-4">
              <div className="flex items-center gap-3">
                <button onClick={() => { setSel(null); setDash(null); setBack(null); }} className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Cambiar</button>
                <div className="font-bold text-slate-800">{nombreEmp(sel)}</div>
                {loadingDash && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetear} className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50"><RotateCcw className="w-3.5 h-3.5" /> Restaurar reales</button>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                  <button onClick={() => setModoCierre(false)} className={`px-3 py-1.5 font-medium ${!modoCierre ? "bg-indigo-600 text-white" : "bg-white text-slate-500"}`}>Seguimiento</button>
                  <button onClick={() => setModoCierre(true)} className={`px-3 py-1.5 font-medium ${modoCierre ? "bg-indigo-600 text-white" : "bg-white text-slate-500"}`}>Cierre</button>
                </div>
              </div>
            </div>

            {dash && front && (
              <>
                {/* Global */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  {[
                    { label: "Objetivos (crudo)", f: front.objRaw, b: back?.resumen?.objetivos },
                    { label: "Competencias (crudo)", f: front.compRaw, b: back?.resumen?.aptitudes },
                    { label: "GLOBAL (70/30)", f: front.global, b: back?.resumen?.global, big: true },
                  ].map((row) => (
                    <div key={row.label} className={`rounded-2xl border p-4 ${row.big ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{row.label}</div>
                      <div className="flex items-end justify-between gap-2">
                        <div><div className="text-[9px] text-slate-400">frontend</div><div className="text-xl font-black text-slate-800">{fmt(row.f)}%</div></div>
                        <div className="text-right"><div className="text-[9px] text-indigo-400">backend {loadingBack && <Loader2 className="w-2.5 h-2.5 animate-spin inline" />}</div><div className="text-xl font-black text-indigo-700">{fmt(row.b)}%</div></div>
                        <div className="pb-1"><DeltaBadge f={row.f} b={row.b} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Objetivos */}
                <h2 className="text-sm font-black text-slate-700 mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> Objetivos — editá los resultados por período</h2>
                <div className="space-y-4 mb-6">
                  {dash.objetivos.map((o) => {
                    const of = front.objetivos.find((x) => x.objId === o._id);
                    const ob = back?.objetivos?.[o._id];
                    const periodos = (o.hitos || []).map((h) => h.periodo);
                    return (
                      <div key={o._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                          <div className="font-bold text-slate-800 text-sm">{o.nombre} <span className="text-xs font-normal text-slate-400">· peso {o.peso}%</span></div>
                          <div className="flex items-center gap-3 text-xs shrink-0">
                            <span className="text-slate-500">front <strong className="text-slate-800">{fmt(of?.objScore)}%</strong></span>
                            <span className="text-indigo-500">back <strong className="text-indigo-700">{fmt(ob?.actual)}%</strong></span>
                            <DeltaBadge f={of?.objScore} b={ob?.actual} />
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-100">
                                <th className="text-left px-3 py-2 font-semibold min-w-[160px]">Meta</th>
                                {periodos.map((p) => <th key={p} className="text-center px-2 py-2 font-semibold">{stripYear(p)}</th>)}
                                <th className="text-center px-2 py-2 font-semibold">front</th>
                                <th className="text-center px-2 py-2 font-semibold text-indigo-500">back</th>
                                <th className="text-center px-2 py-2 font-semibold"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.metas || []).map((m) => {
                                const risky = configRiesgosa(m);
                                return (
                                  <tr key={m._id} className={`border-b border-slate-50 ${risky ? "bg-amber-50/40" : ""}`}>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-slate-700">{m.nombre}</div>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        <span className="bg-slate-100 rounded px-1.5 py-0.5 text-[10px] text-slate-500">{m.operador || ">="} {m.esperado ?? m.target ?? "—"}</span>
                                        <span className="bg-slate-100 rounded px-1.5 py-0.5 text-[10px] text-slate-500">{m.reglaCierre || "promedio"}</span>
                                        {(m.acumulativa || m.modoAcumulacion === "acumulativo") && <span className="bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 text-[10px]">acum</span>}
                                        {String(m.unidad || "").toLowerCase().includes("cumple") && <span className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[10px]">binaria</span>}
                                        {risky && <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />divergencia conocida</span>}
                                      </div>
                                    </td>
                                    {periodos.map((p) => (
                                      <td key={p} className="text-center px-1 py-2">
                                        <input
                                          value={valores[o._id]?.[m._id]?.[p] ?? ""}
                                          onChange={(e) => setVal(o._id, m._id, p, e.target.value)}
                                          className="w-14 text-center rounded border border-slate-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                          placeholder="—"
                                        />
                                      </td>
                                    ))}
                                    <td className="text-center px-2 py-2 font-mono font-bold text-slate-700">{fmt(of?.metas?.[m._id])}%</td>
                                    <td className="text-center px-2 py-2 font-mono font-bold text-indigo-700">{fmt(ob?.metas?.[m._id])}%</td>
                                    <td className="text-center px-2 py-2"><DeltaBadge f={of?.metas?.[m._id]} b={ob?.metas?.[m._id]} /></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                  {dash.objetivos.length === 0 && <div className="bg-white rounded-2xl border border-dashed p-8 text-center text-slate-400">Este empleado no tiene objetivos en {year}.</div>}
                </div>

                {/* Competencias */}
                {dash.aptitudes.length > 0 && (
                  <>
                    <h2 className="text-sm font-black text-slate-700 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-teal-500" /> Competencias — puntaje por período (0-100)</h2>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto mb-6">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
                            <th className="text-left px-3 py-2 font-semibold min-w-[160px]">Competencia</th>
                            <th className="text-center px-2 py-2">Peso</th>
                            {arr(dash.aptitudes[0]?.hitos).map((h) => <th key={h.periodo} className="text-center px-2 py-2">{stripYear(h.periodo)}</th>)}
                            <th className="text-center px-2 py-2">Promedio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dash.aptitudes.map((a) => {
                            const vals = (a.hitos || []).map((h) => parseNum(aptValores[a._id]?.[h.periodo])).filter((x) => x !== null);
                            const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
                            return (
                              <tr key={a._id} className="border-b border-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-700">{a.nombre}</td>
                                <td className="text-center px-2 py-2 text-slate-500">{a.peso}%</td>
                                {(a.hitos || []).map((h) => (
                                  <td key={h.periodo} className="text-center px-1 py-2">
                                    <input value={aptValores[a._id]?.[h.periodo] ?? ""} onChange={(e) => setApt(a._id, h.periodo, e.target.value)} className="w-14 text-center rounded border border-slate-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" placeholder="—" />
                                  </td>
                                ))}
                                <td className="text-center px-2 py-2 font-mono font-bold text-slate-700">{fmt(avg)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> Las filas en <span className="text-amber-600 font-semibold">ámbar</span> tienen configuración con divergencia conocida entre motores (regla "promedio" + acumulativa o binaria). El backend es el que fija la nota al cierre.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
