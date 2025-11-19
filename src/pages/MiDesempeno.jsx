// src/pages/MiDesempeno.jsx
import { useCallback, useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { dashEmpleado } from "@/lib/dashboard";
import { api } from "@/lib/api";
import HistorialEvaluacion from "@/components/HistorialEvaluacion";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// === UI helpers ===
const Pill = ({ children, title }) => (
  <span
    title={title}
    className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5"
  >
    {children}
  </span>
);

const SectionTitle = ({ children, right }) => (
  <div className="flex items-center justify-between mb-1">
    <h3 className="text-sm font-semibold">{children}</h3>
    {right}
  </div>
);

const ProgressBar = ({ value = 0 }) => (
  <div className="w-full h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden shadow-inner">
    <div
      className="h-full transition-[width] duration-300 bg-gradient-to-r from-indigo-500 to-indigo-400"
      style={{ width: `${Math.max(0, Math.min(100, Math.round(value)))}%` }}
    />
  </div>
);

export default function MiDesempeno() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState("todos");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [selected, setSelected] = useState(null);
  const [periodoSel, setPeriodoSel] = useState(null);

  const [evalsEmpleado, setEvalsEmpleado] = useState([]);
  const [evalActual, setEvalActual] = useState(null);

  const searchRef = useRef(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

const empleadoIdFromUser = (u) =>
  u?.empleadoId?._id || u?.empleadoId || null;
  // ===== Resumen cabecera
  const resumenAnual = useMemo(() => {
    if (!data) return null;
    const objetivos = Array.isArray(data.objetivos) ? data.objetivos : [];
    const aptitudes = Array.isArray(data.aptitudes) ? data.aptitudes : [];

    const pesos = objetivos.map((o) => Number(o.peso ?? o.pesoBase ?? 0));
    const prog = objetivos.map((o) => Number(o.progreso ?? 0));
    const totalPeso = pesos.reduce((a, b) => a + b, 0) || 0;

    const scoreObj =
      totalPeso > 0
        ? pesos.reduce((acc, p, i) => acc + p * (prog[i] || 0), 0) / totalPeso
        : prog.length
        ? prog.reduce((a, b) => a + b, 0) / prog.length
        : 0;

    const punt = aptitudes.map((a) => Number(a.puntuacion ?? a.score ?? 0));
    const scoreApt = punt.length ? punt.reduce((a, b) => a + b, 0) / punt.length : 0;

    const global = (scoreObj + scoreApt) / 2;
    return {
      objetivos: { cantidad: objetivos.length, peso: totalPeso, score: scoreObj },
      aptitudes: { cantidad: aptitudes.length, score: scoreApt },
      global,
    };
  }, [data]);

  // ===== Data dashboard
  const fetchDash = useCallback(async () => {
    const empleadoId = empleadoIdFromUser(user);
    if (!empleadoId) {
      toast.error("Falta referencia a la ficha del empleado en tu usuario.");
      return;
    }
    try {
      setLoading(true);
      const res = await dashEmpleado(empleadoId);
      if (!res) {
        toast.error("Empleado no encontrado.");
        setData(null);
        return;
      }
      const normalized = { ...res };
      if (normalized.objetivos?.items && !Array.isArray(normalized.objetivos)) {
        normalized.objetivos = normalized.objetivos.items;
      }
      if (normalized.aptitudes?.items && !Array.isArray(normalized.aptitudes)) {
        normalized.aptitudes = normalized.aptitudes.items;
      }
      setData(normalized);
    } catch (err) {
      console.error(err);
      toast.error("No pude cargar tu desempeño.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDash();
  }, [fetchDash]);

  // ===== Evaluaciones del empleado
  useEffect(() => {
    (async () => {
      const empleadoId = empleadoIdFromUser(user);
      if (!empleadoId) return;
      try {
        const ev = await api(`/evaluaciones?empleado=${empleadoId}`);
        const arr = Array.isArray(ev) ? ev : ev?.items || [];
        setEvalsEmpleado(arr);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [user]);

  // ===== Detalle por selección + periodo
  useEffect(() => {
    const loadEvalDetalle = async () => {
      if (!selected || !periodoSel) {
        setEvalActual(null);
        return;
      }
      const base = evalsEmpleado.find((ev) => {
        const plantillaId = String(ev.plantillaId?._id || ev.plantillaId);
        const periodo = String(ev.periodo).trim();
        return (
          plantillaId === String(selected._id) && periodo === String(periodoSel).trim()
        );
      });

      if (base?._id) {
        try {
          const detalle = await api(`/evaluaciones/detalle/${base._id}`);
          setEvalActual(detalle);
        } catch {
          setEvalActual(base);
        }
      } else {
        setEvalActual(null);
      }
    };
    loadEvalDetalle();
  }, [evalsEmpleado, selected?._id, periodoSel]);

  // ===== Sidebar items
  const sidebarItems = useMemo(() => {
    let items = [];
    if (!data) return items;
    if (tab === "todos" || tab === "objetivo") {
      items = items.concat(
        (data.objetivos || []).map((o) => ({ ...o, _tipo: "objetivo" }))
      );
    }
    if (tab === "todos" || tab === "aptitud") {
      items = items.concat(
        (data.aptitudes || []).map((a) => ({ ...a, _tipo: "aptitud" }))
      );
    }
    const t = dq.trim().toLowerCase();
    if (t) {
      items = items.filter(
        (i) =>
          (i.nombre || "").toLowerCase().includes(t) ||
          (i.descripcion || "").toLowerCase().includes(t)
      );
    }
    items.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return items;
  }, [data, tab, dq]);

  // Selección inicial / saneo
  useEffect(() => {
    if (sidebarItems.length && !selected) {
      setSelected(sidebarItems[0]);
    } else if (
      selected &&
      !sidebarItems.find((i) => String(i._id) === String(selected._id))
    ) {
      setSelected(sidebarItems[0] || null);
    }
  }, [sidebarItems, selected]);

  // Periodo default por objetivo
  useEffect(() => {
    if (selected?.hitos?.length) {
      setPeriodoSel(selected.hitos[0].periodo);
    } else {
      setPeriodoSel(null);
    }
  }, [selected?._id]);

  // Detalle de hito visible
  const detalleHito = useMemo(() => {
    if (!selected || !periodoSel) return null;
    const h = (selected.hitos || []).find((x) => x.periodo === periodoSel) || null;
    const progreso = Number(
      evalActual?.actual ?? h?.actual ?? selected?.progreso ?? 0
    );
    return {
      progreso,
      fecha: h?.fecha || selected?.fechaLimite || null,
    };
  }, [selected, periodoSel, evalActual]);

  // Serie evolución (para objetivos con hitos)
  const serieEvolucion = useMemo(() => {
    if (!selected?.hitos?.length) return [];
    const list = [...selected.hitos]
      .map((h) => ({ periodo: String(h.periodo), fecha: h.fecha || null }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    const evalPorPeriodo = new Map();
    for (const ev of evalsEmpleado) {
      const pid = String(ev.plantillaId?._id || ev.plantillaId);
      if (pid !== String(selected._id)) continue;
      evalPorPeriodo.set(String(ev.periodo), Number(ev.actual ?? 0));
    }

    return list.map((x) => ({
      periodo: x.periodo,
      valor: Number(
        evalPorPeriodo.has(x.periodo)
          ? evalPorPeriodo.get(x.periodo)
          : (selected.hitos || []).find((h) => String(h.periodo) === x.periodo)
              ?.actual ?? 0
      ),
    }));
  }, [selected?._id, selected?.hitos, evalsEmpleado]);

  // ===== Conformidad (en comentarios, pie)
  const setConformidad = (estado /* "ACK"|"CONTEST" */) => {
    setEvalActual((prev) => ({
      ...(prev || {}),
      empleadoAck: {
        estado,
        fecha: new Date().toISOString(),
        userId: user?._id || user?.id || null,
      },
    }));
  };

 const persistBorrador = async () => {
  const empleadoId = empleadoIdFromUser(user);
  const matches = await api(
    `/evaluaciones?empleado=${empleadoId}&plantillaId=${selected._id}&periodo=${periodoSel}`
  );

  const ev = Array.isArray(matches) ? matches[0] : matches?.items?.[0] || null;
  if (!ev?._id) {
    toast.error("No encontré la evaluación para enviar.");
    return null;
  }

  // Según el estado elegido en los botones "De acuerdo / En desacuerdo"
  const isContest = evalActual?.empleadoAck?.estado === "CONTEST";

  const endpoint = isContest
    ? `/evaluaciones/${ev._id}/employee-contest`
    : `/evaluaciones/${ev._id}/employee-ack`;

  const saved = await api(endpoint, {
    method: "POST",
    body: {
      comentarioEmpleado: evalActual?.comentarioEmpleado ?? "",
    },
  });

  return saved?._id || ev._id;
};

  // ===== Render
  if (!user) {
    return (
      <div className="container-app bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="max-w-5xl mx-auto rounded-xl bg-card ring-1 ring-border/60 p-6 text-center text-sm text-muted-foreground">
          Iniciá sesión para ver tu desempeño.
        </div>
      </div>
    );
  }

  return (
    <div className="container-app">
      <div className="mx-auto max-w-[1200px] space-y-6 px-2 sm:px-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl p-5 ring-1 ring-black/5 dark:ring-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md shadow-md">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Mi desempeño</h1>
            <p className="text-sm text-muted-foreground">
              Consultá tu avance de objetivos y aptitudes, y firmá tus evaluaciones por
              período.
            </p>
          </div>

          {resumenAnual && (
            <div className="w-full mt-2">
              <div className="rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white/90 dark:bg-slate-900/80 backdrop-blur p-4 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">
                      Resultado global (referencial)
                    </div>
                    <div className="text-3xl font-bold tracking-tight">
                      {Math.round(resumenAnual.global)}%
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={resumenAnual.global} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">
                      🎯 Objetivos (peso total {resumenAnual.objetivos.peso || 0}%)
                    </div>
                    <div className="text-lg font-medium">
                      {Math.round(resumenAnual.objetivos.score)}%
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={resumenAnual.objetivos.score} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">💡 Aptitudes</div>
                    <div className="text-lg font-medium">
                      {Math.round(resumenAnual.aptitudes.score)}%
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={resumenAnual.aptitudes.score} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">
          {/* Sidebar */}
          <aside className="rounded-2xl bg-white/85 dark:bg-slate-900/80 backdrop-blur md:shadow-lg ring-1 ring-black/5 dark:ring-white/10 overflow-hidden transition-colors">
            <div className="p-3 border-b border-border/60 sticky top-0 bg-card z-10">
              <div className="inline-flex rounded-lg bg-muted p-1">
                {[
                  { k: "todos", lbl: "Todos" },
                  { k: "objetivo", lbl: "🎯 Objetivos" },
                  { k: "aptitud", lbl: "💡 Aptitudes" },
                ].map((b) => (
                  <button
                    key={b.k}
                    className={`px-3 py-1.5 text-xs rounded-md ${
                      tab === b.k
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setTab(b.k)}
                  >
                    {b.lbl}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <input
                  ref={searchRef}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Buscar por título o descripción…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[50vh] overflow-auto">
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground">Cargando…</div>
              ) : sidebarItems.length ? (
                <ul className="divide-y divide-border/60">
                  {sidebarItems.map((it) => {
                    const sel =
                      selected && String(selected._id) === String(it._id);
                    const score =
                      it._tipo === "objetivo"
                        ? Number(it.progreso ?? 0)
                        : Number(it.puntuacion ?? it.score ?? 0);
                    return (
                      <li key={it._id}>
                        <button
                          className={`w-full text-left px-3 py-2.5 transition rounded-md ${
                            sel
                              ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                          onClick={() => setSelected(it)}
                        >
                          <div className="text-[11px] text-muted-foreground mb-1">
                            {it._tipo === "objetivo" ? "🎯 Objetivo" : "💡 Aptitud"}
                          </div>
                          <div className="font-medium leading-snug line-clamp-2">
                            {it.nombre}
                          </div>
                          <div className="mt-2">
                            <ProgressBar value={score} />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate pr-2 line-clamp-1">
                              {it.descripcion || "—"}
                            </span>
                            <Pill title="Progreso">{Math.round(score)}%</Pill>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">Sin resultados.</div>
              )}
            </div>
          </aside>

          {/* Hoja detalle */}
          <section className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden">
            {selected ? (
              <>
                {/* Encabezado (full width, limpio) */}
                <div className="p-5 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Detalle
                  </div>
                  <h2 className="text-xl font-semibold leading-tight tracking-tight">
                    {selected?.nombre}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected?.descripcion || "—"}
                  </p>
                </div>

                {/* Datos clave (orden nuevo): Periodo -> Peso -> Progreso */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 border-b border-slate-200/60 dark:border-slate-700/60 bg-transparent">
                  <div className="md:col-span-2 rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Periodo</div>
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                      value={periodoSel || ""}
                      onChange={(e) => setPeriodoSel(e.target.value || null)}
                    >
                      {(selected?.hitos || []).map((h, idx) => (
                        <option key={`${h.periodo}-${idx}`} value={h.periodo}>
                          {h.periodo}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Vencimiento:{" "}
                      <b className="text-foreground">
                        {detalleHito?.fecha
                          ? String(detalleHito.fecha).slice(0, 10)
                          : "—"}
                      </b>
                    </div>
                  </div>

                  {(selected.peso ?? selected.pesoBase) != null && (
                    <div className="rounded-lg p-3 ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-slate-900/60">
                      <div className="text-[11px] text-muted-foreground">Peso</div>
                      <div className="font-medium">
                        {selected.peso ?? selected.pesoBase}%
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2 rounded-lg p-3 ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-slate-900/60">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      Progreso <span>📈</span>
                    </div>
                    <div className="font-medium mb-2">
                      {selected._tipo === "objetivo"
                        ? `${Math.round(detalleHito?.progreso ?? 0)}%`
                        : `${Math.round(
                            detalleHito?.progreso ?? selected.puntuacion ?? 0
                          )}%`}
                    </div>
                    <ProgressBar
                      value={
                        selected._tipo === "objetivo"
                          ? detalleHito?.progreso ?? 0
                          : detalleHito?.progreso ?? selected.puntuacion ?? 0
                      }
                    />
                  </div>
                </div>

                {/* Gráfico de evolución */}
                <div className="p-4 border-b border-border/60">
                  <SectionTitle>📊 Evolución del objetivo</SectionTitle>
                  <div className="h-56 w-full rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-slate-900/60 px-2 py-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieEvolucion}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="periodo" fontSize={12} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Line type="monotone" dataKey="valor" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Metas */}
                <div className="p-4 border-b border-border/60">
                  <SectionTitle>🧭 Metas del período</SectionTitle>
                  <div className="rounded-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50/80 dark:bg-slate-800/70 backdrop-blur text-[11px] uppercase text-slate-500 dark:text-slate-400 tracking-wide">
                          <th className="text-left px-3 py-2 w-[45%]">Meta</th>
                          <th className="text-left px-3 py-2">Esperado</th>
                          <th className="text-left px-3 py-2">Resultado</th>
                          <th className="text-left px-3 py-2">Cumple</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const metas =
                            (evalActual?.metasResultados?.length
                              ? evalActual.metasResultados
                              : (selected.hitos || []).find(
                                  (h) => h.periodo === periodoSel
                                )?.metas) || [];

                          if (!metas.length) {
                            return (
                              <tr>
                                <td
                                  className="px-3 py-3 text-muted-foreground text-center"
                                  colSpan={4}
                                >
                                  No hay metas definidas para este período.
                                </td>
                              </tr>
                            );
                          }

                          return metas.map((m, idx) => (
                            <tr
                              key={idx}
                              className="border-t border-slate-200/60 dark:border-slate-700/60 odd:bg-white/70 even:bg-slate-50/60 dark:odd:bg-slate-900/50 dark:even:bg-slate-800/40"
                            >
                              <td className="px-3 py-2">
                                <div className="line-clamp-2 break-words">
                                  {m.nombre || "Meta"}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {m.esperado ?? m.target ?? "—"} {m.unidad || ""}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-block min-w-[48px]">
                                  {m.resultado ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {m.cumple === true ? (
                                  <span className="text-emerald-700 text-xs">✔ Cumple</span>
                                ) : m.cumple === false ? (
                                  <span className="text-rose-600 text-xs">✘ No cumple</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Comentarios (orden: Jefe -> Colaborador) + Conformidad al pie */}
                <div className="p-4 border-b border-border/60 space-y-3">
                  <SectionTitle>💬 Comentarios del período</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Primero JEFE */}
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">
                        Comentario del Jefe
                      </div>

                      <textarea
                        className="w-full min-h-32 rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-slate-50/70 dark:bg-slate-800/50 px-3 py-2 text-sm resize-y"
                        placeholder="(Sólo visible si fue cargado por tu jefe)"
                        value={evalActual?.comentarioManager ?? ""}
                        readOnly
                      />
                    </div>
                    {/* Luego COLABORADOR */}
                    <div>
  <div className="text-[11px] text-muted-foreground mb-1">
    Comentario del Colaborador
  </div>


  <textarea
    className="w-full min-h-32 rounded-xl ring-1 ring-black/5 dark:ring-white/10 bg-white/80 dark:bg-slate-900/70 px-3 py-2 text-sm resize-y shadow-sm"
    placeholder="Dejá tu devolución para esta evaluación (la verá tu jefe y RRHH)…"
    value={evalActual?.comentarioEmpleado ?? ""}   // ahora usa comentarioEmpleado
    onChange={(e) => {
      setEvalActual((prev) => ({
        ...(prev || {}),
        comentarioEmpleado: e.target.value,        // solo toca comentarioEmpleado
      }));
    }}
  />
</div>
                  </div>

                  {/* Pie: Conformidad + Acciones */}
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between pt-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[12px] text-muted-foreground">Conformidad:</span>
                      <button
                        onClick={() => setConformidad("ACK")}
                        className={`px-3 py-1.5 rounded-md text-sm ring-1 transition ${
                          evalActual?.empleadoAck?.estado === "ACK"
                            ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                            : "bg-slate-100 hover:bg-slate-200 ring-slate-300 text-slate-700"
                        }`}
                      >
                        De acuerdo
                      </button>
                      <button
                        onClick={() => setConformidad("CONTEST")}
                        className={`px-3 py-1.5 rounded-md text-sm ring-1 transition ${
                          evalActual?.empleadoAck?.estado === "CONTEST"
                            ? "bg-rose-100 text-rose-800 ring-rose-300"
                            : "bg-slate-100 hover:bg-slate-200 ring-slate-300 text-slate-700"
                        }`}
                      >
                        En desacuerdo
                      </button>

                      {evalActual?.empleadoAck?.estado && (
                        <Pill title="Última respuesta">
                          {evalActual.empleadoAck.estado === "ACK" ? "✅ De acuerdo" : "❌ En desacuerdo"}
                        </Pill>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const id = await persistBorrador();
                            if (!id) return;
                            toast.success("Borrador guardado.");
                          } catch (e) {
                            console.error(e);
                            toast.error("No pude guardar el borrador.");
                          }
                        }}
                        className="rounded-xl shadow-sm"
                      >
                        Guardar borrador
                      </Button>

   <Button
  onClick={async () => {
    try {
      const id = await persistBorrador(); // ahora hace ACK o CONTEST con comentarioEmpleado
      if (!id) return;

      toast.success("Respuesta enviada a RRHH.");
      const detalle = await api(`/evaluaciones/detalle/${id}`);
      setEvalActual(detalle);
    } catch (e) {
      console.error(e);
      toast.error("No pude enviar a RRHH.");
    }
  }}
  className="rounded-xl shadow-sm bg-indigo-600 hover:bg-indigo-700"
>
  Enviar a RRHH
</Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                Elegí un objetivo o aptitud en la izquierda para ver el detalle.
              </div>
            )}
          </section>

          {/* Historial */}
          <aside className="hidden lg:block sticky top-4 self-start rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-2">
            <HistorialEvaluacion
              trazabilidad={
                Array.isArray(evalActual?.timeline) && evalActual.timeline.length
                  ? evalActual.timeline
                  : [
                      evalActual?.estado
                        ? {
                            estado: evalActual.estado,
                            fecha: evalActual?.fecha || selected?.fechaLimite,
                          }
                        : null,
                 evalActual?.comentarioEmpleado
  ? {
      estado: "comentario-colaborador",
      fecha: new Date(),
      comentario: evalActual.comentarioEmpleado,
    }
  : null,
                      evalActual?.comentarioManager
                        ? {
                            estado: "comentario-jefe",
                            fecha: new Date(),
                            comentario: evalActual.comentarioManager,
                          }
                        : null,
                      evalActual?.empleadoAck?.estado
                        ? {
                            estado:
                              evalActual.empleadoAck.estado === "ACK"
                                ? "EMPLOYEE_ACK"
                                : "EMPLOYEE_CONTEST",
                            fecha: evalActual.empleadoAck.fecha || new Date(),
                          }
                        : null,
                    ].filter(Boolean)
              }
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
