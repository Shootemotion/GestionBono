// src/pages/MiDesempeno.jsx
import { useCallback, useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { dashEmpleado } from "@/lib/dashboard";
import { api } from "@/lib/api";
import EvaluacionFlow from "@/components/EvaluacionFlow";
import HistorialEvaluacion from "@/components/HistorialEvaluacion";
// UI mini-componentes reutilizables (solo presentación)
 const Pill = ({ children, title }) => (
   <span title={title} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5">
     {children}
   </span>
 );
 const SectionTitle = ({ children, right }) => (
   <div className="flex items-center justify-between">
     <h3 className="text-sm font-semibold">{children}</h3>
     {right}
   </div>
 );
 const ProgressBar = ({ value=0 }) => (
  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
    <div
       className="h-full bg-indigo-500 dark:bg-indigo-400 transition-[width] duration-300"
      style={{ width: `${Math.max(0,Math.min(100,Math.round(value)))}%` }}
     />
   </div>
 );
const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const estadoChip = (estado) => {
  const map = {
    MANAGER_DRAFT: { text: "Borrador jefe", cls: "bg-amber-100 text-amber-700 ring-amber-200" },
    PENDING_EMPLOYEE: { text: "Pendiente empleado", cls: "bg-indigo-100 text-indigo-700 ring-indigo-200" },
    PENDING_HR: { text: "Pendiente RRHH", cls: "bg-blue-100 text-blue-700 ring-blue-200" },
    CLOSED: { text: "Cerrada", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  };
  const m = map[estado] || { text: "Sin estado", cls: "bg-muted text-muted-foreground ring-border/50" };
  return (
    <span className={`inline-flex items-center px-2.5 h-6 text-[11px] rounded-full ring-1 ${m.cls}`}>
      {m.text}
    </span>
  );
};

export default function MiDesempeno() {
  const { user } = useAuth();
const [anio, setAnio] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState("todos");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q); // evita re-render pesados al tipear
  const [selected, setSelected] = useState(null);
  const [periodoSel, setPeriodoSel] = useState(null);

  const [evalsEmpleado, setEvalsEmpleado] = useState([]);
  const [evalActual, setEvalActual] = useState(null); // 👉 nuevo estado
const isHR = !!(user?.roles?.includes?.("RRHH") || user?.role === "RRHH");

  // ====== Resumen anual (no rompe tu data) ======
  const resumenAnual = useMemo(() => {
    if (!data) return null;
    const objetivos = Array.isArray(data.objetivos) ? data.objetivos : [];
    const aptitudes = Array.isArray(data.aptitudes) ? data.aptitudes : [];

    // Objetivos: media ponderada por peso (si no hay peso, 0)
    const pesos = objetivos.map(o => Number(o.peso ?? o.pesoBase ?? 0));
    const prog  = objetivos.map(o => Number(o.progreso ?? 0));

    const totalPeso = pesos.reduce((a,b)=> a + b, 0) || 0;
    const scoreObj = totalPeso > 0
  ? pesos.reduce((acc, p, i) => acc + p * (prog[i] || 0), 0) / totalPeso
      : (prog.length ? prog.reduce((a,b)=> a + b, 0) / prog.length : 0);

    // Aptitudes: promedio simple de puntuación
    const punt = aptitudes.map(a => Number(a.puntuacion ?? a.score ?? 0));
    const scoreApt = punt.length ? punt.reduce((a,b)=> a + b, 0) / punt.length : 0;

    // Global referencial (claridad para el evaluado)
    const global = (scoreObj + scoreApt) / 2;
    return {
      objetivos: { cantidad: objetivos.length, peso: totalPeso, score: scoreObj },
      aptitudes: { cantidad: aptitudes.length, score: scoreApt },
      global
    };
  }, [data]);
  const empleadoIdFromUser = (u) =>
    u?.empleadoId?._id || u?.empleadoId || u?._id || u?.id || null;

  const fetchDash = useCallback(async () => {
    const empleadoId = empleadoIdFromUser(user);
    if (!empleadoId) {
      toast.error("Falta referencia a la ficha del empleado en tu usuario.");
      setError("Falta empleado en user");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await dashEmpleado(empleadoId); // ⚡ ya no filtramos por año
      if (!res) {
        setError("Empleado no encontrado en el servidor.");
        setData(null);
        toast.error("Empleado no encontrado.");
        return;
      }
      const normalized = { ...res };
      if (normalized.objetivos && !Array.isArray(normalized.objetivos) && normalized.objetivos.items) {
        normalized.objetivos = normalized.objetivos.items;
      }
      if (normalized.aptitudes && !Array.isArray(normalized.aptitudes) && normalized.aptitudes.items) {
        normalized.aptitudes = normalized.aptitudes.items;
      }
      setData(normalized);
    } catch (err) {
      console.error("dashEmpleado error", err);
      setError(err?.message || "Error al cargar dashboard");
      toast.error("No pude cargar tu desempeño (ver consola).");
      setData(null);
    } finally {
      setLoading(false);
    }
 }, [user]); // anio no se usa aquí (ruido en dependencias)
 // focus en buscador al montar (mejor accesibilidad)
 const searchRef = useRef(null);
 useEffect(() => { searchRef.current?.focus(); }, []);


  useEffect(() => { fetchDash(); }, [fetchDash]);
// 1) Cargar TODAS las evaluaciones del empleado
useEffect(() => {
  const loadEvals = async () => {
    const empleadoId = empleadoIdFromUser(user);
    if (!empleadoId) return;
    try {
      const url = `/evaluaciones?empleado=${empleadoId}`;
      console.log("🌐 Fetching:", url);
      const ev = await api(url);
      console.log("📥 Response cruda de API:", ev);

      let arr = [];
      if (Array.isArray(ev)) {
        arr = ev;
      } else if (ev?.items && Array.isArray(ev.items)) {
        arr = ev.items;
      }

      setEvalsEmpleado(arr);
      console.log("✅ setEvalsEmpleado con", arr.length, "items");
    } catch (e) {
      console.error("Error cargando evalsEmpleado", e);
    }
  };

  loadEvals();
}, [user]);

// 2) Cuando hay evals + selected + periodo, buscar el match y cargar detalle
useEffect(() => {
  const loadEvalDetalle = async () => {
    if (!selected || !periodoSel) {
      setEvalActual(null);
      return;
    }

    console.log("🟢 DEBUG inicio loadEvalDetalle", {
      selectedId: selected?._id,
      periodoSel,
      empleadoId: empleadoIdFromUser(user),
      evalsEmpleadoCount: evalsEmpleado.length,
    });

    evalsEmpleado.forEach((ev, i) => {
      console.log(`   🔎 Eval[${i}]`, {
        _id: ev._id,
        empleado: ev.empleado,
        plantillaId: String(ev.plantillaId?._id || ev.plantillaId),
        periodo: ev.periodo,
      });
    });

    const base = evalsEmpleado.find((ev) => {
      const plantillaId = String(ev.plantillaId?._id || ev.plantillaId);
      const periodo = String(ev.periodo).trim();

      const plantillaMatch = plantillaId === String(selected._id);
      const periodoMatch = periodo === String(periodoSel).trim();

      console.log("   ↪ Comparando:", {
        evId: ev._id,
        plantillaId,
        periodo,
        plantillaMatch,
        periodoMatch,
      });

      return plantillaMatch && periodoMatch;
    });

    console.log("🔍 MATCH encontrado:", base);

    if (base?._id) {
      try {
        const detalle = await api(`/evaluaciones/detalle/${base._id}`);
        console.log("📥 DETALLE API", detalle);
        setEvalActual(detalle);
      } catch (e) {
        console.error("❌ Error cargando detalle eval", e);
        setEvalActual(base);
      }
    } else {
      console.warn("⚠ No se encontró evaluación", {
        selected,
        periodoSel,
        evalsEmpleado,
      });
      setEvalActual(null);
    }
  };

  loadEvalDetalle();
}, [evalsEmpleado, selected?._id, periodoSel]);




  const sidebarItems = useMemo(() => {
    let items = [];
    if (!data) return items;
    if (tab === "todos" || tab === "objetivo") {
      items = items.concat((data.objetivos || []).map((o) => ({ ...o, _tipo: "objetivo" })));
    }
    if (tab === "todos" || tab === "aptitud") {
      items = items.concat((data.aptitudes || []).map((a) => ({ ...a, _tipo: "aptitud" })));
    }
    const t = dq.trim().toLowerCase();
    if (t) {
      items = items.filter((i) =>
        (i.nombre || "").toLowerCase().includes(t) ||
        (i.descripcion || "").toLowerCase().includes(t)
      );
    }
    items.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return items;
  }, [data, tab, dq]);


  useEffect(() => {
    if (sidebarItems.length && !selected) {
      setSelected(sidebarItems[0]);
    } else if (selected && !sidebarItems.find((i) => String(i._id) === String(selected._id))) {
      setSelected(sidebarItems[0] || null);
    }
  }, [sidebarItems, selected]);

  useEffect(() => {
    if (selected?.hitos?.length) {
      setPeriodoSel(selected.hitos[0].periodo);
    } else {
      setPeriodoSel(null);
    }
  }, [selected?._id]);

  const detalleHito = useMemo(() => {
    if (!selected || !periodoSel) return null;
    const h = (selected.hitos || []).find((x) => x.periodo === periodoSel) || null;
    const progreso = Number(evalActual?.actual ?? h?.actual ?? selected?.progreso ?? 0);
    return {
      progreso,
      fecha: h?.fecha || selected?.fechaLimite || null,
    };
  }, [selected, periodoSel, evalActual]);

  if (!user) {
    return (
      <div className="container-app">
        <div className="max-w-5xl mx-auto rounded-xl bg-card ring-1 ring-border/60 p-6 text-center text-sm text-muted-foreground">
          Iniciá sesión para ver tu desempeño.
        </div>
      </div>
    );
  }


   return (
    <div className="container-app">
      <div className="mx-auto max-w-[1200px] space-y-6">
        {/* Header */}
       <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Mi desempeño </h1>
            <p className="text-sm text-muted-foreground">
              Consultá tu avance de objetivos y aptitudes, y firmá tus evaluaciones por período.
            </p>
          </div>

       {resumenAnual && (
            <div className="w-full mt-2">
              <div className="rounded-xl ring-1 ring-border/60 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                   <div className="text-[11px] text-muted-foreground mb-1">Resultado global (referencial)</div>
                   <div className="text-2xl font-semibold">{Math.round(resumenAnual.global)}%</div>
                    <div className="mt-2"><ProgressBar value={resumenAnual.global} /></div>
                 </div>
                 <div>
                    <div className="text-[11px] text-muted-foreground mb-1">🎯 Objetivos (peso total {resumenAnual.objetivos.peso || 0}%)</div>
                    <div className="text-lg font-medium">{Math.round(resumenAnual.objetivos.score)}%</div>
                    <div className="mt-2"><ProgressBar value={resumenAnual.objetivos.score} /></div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">💡 Aptitudes</div>
                    <div className="text-lg font-medium">{Math.round(resumenAnual.aptitudes.score)}%</div>
                    <div className="mt-2"><ProgressBar value={resumenAnual.aptitudes.score} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Layout */}
 <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">

          {/* Sidebar */}
          <aside className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden transition-colors">
            <div className="p-3 border-b border-border/60 sticky top-0 bg-card z-10">
              {/* Tabs */}
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

              {/* Buscador */}
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

            {/* Listado */}
            <div className="max-h-[50vh] overflow-auto">
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground">Cargando…</div>
              ) : sidebarItems.length ? (
                <ul className="divide-y divide-border/60">
                  {sidebarItems.map((it) => {
                    const sel = selected && String(selected._id) === String(it._id);
                    const score =
                      it._tipo === "objetivo"
                        ? Number(it.progreso ?? 0)
                        : Number(it.puntuacion ?? it.score ?? 0);

                    return (
                      <li key={it._id}>
                        <button
                          className={`w-full text-left px-3 py-2 transition ${
                            sel ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                          }`}
                          onClick={() => setSelected(it)}
                        >
                          <div className="text-[11px] text-muted-foreground mb-1">
                            {it._tipo === "objetivo" ? "🎯 Objetivo" : "💡 Aptitud"}
                          </div>
                        
 <div className="font-medium leading-snug line-clamp-2">{it.nombre}</div>
               <div className="mt-2">
                 <ProgressBar value={score} />
              </div>
               <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                 <span className="truncate pr-2 line-clamp-1">{it.descripcion || "—"}</span>
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
                {/* Encabezado hoja */}
                <div className="p-5 border-b border-border/60 flex items-start justify-between gap-4 bg-gradient-to-b from-white to-slate-50/40 dark:from-slate-900 dark:to-slate-800/40">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Detalle</div>
                    <h2 className="text-lg font-semibold leading-tight">
                      {selected?.nombre}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selected?.descripcion || "—"}
                    </p>
                  </div>
                  <div className="text-right">
               
                <div className="flex items-center justify-end gap-2">
      {estadoChip(evalActual?.estado)}
       <Pill title="Tipo">{selected._tipo === "objetivo" ? "🎯 Objetivo" : "💡 Aptitud"}</Pill>
       {(selected.peso ?? selected.pesoBase) != null && <Pill title="Peso"><span>⚖️</span>{selected.peso ?? selected.pesoBase}%</Pill>}
     </div>
     <div className="text-[11px] text-muted-foreground">
       Vencimiento: <b className="text-foreground">{detalleHito?.fecha ? String(detalleHito.fecha).slice(0, 10) : "—"}</b>
     </div>


                  </div>
                </div>

                {/* Datos clave + periodo */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 border-b border-border/60 bg-white">
                  <div className="rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Tipo</div>
                    <div className="font-medium">{selected._tipo === "objetivo" ? "Objetivo" : "Aptitud"}</div>
                  </div>


                  
                  <div className="rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Peso base</div>
                    <div className="font-medium">{selected.peso ?? selected.pesoBase ?? "—"}%</div>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Método</div>
                    <div className="font-medium">{selected.metodo || "—"}</div>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Meta</div>
                    <div className="font-medium">
                      {selected.target != null ? `${selected.target} ${selected.unidad || ""}` : "—"}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Progreso</div>
                    <div className="font-medium mb-2">
      {selected._tipo === "objetivo"
       ? `${Math.round(detalleHito?.progreso ?? 0)}%`
        : `${Math.round(detalleHito?.progreso ?? selected.puntuacion ?? 0)}%`}
    </div>
    <ProgressBar value={selected._tipo === "objetivo" ? (detalleHito?.progreso ?? 0) : (detalleHito?.progreso ?? selected.puntuacion ?? 0)} />
                  </div>
                  <div className="md:col-span-2 rounded-md bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">Periodo</div>
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                      value={periodoSel || ""}
                      onChange={(e) => setPeriodoSel(e.target.value || null)}
                    >
                      {(selected?.hitos || []).map((h) => (
                        <option key={h.periodo} value={h.periodo}>
                          {h.periodo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

               {/* Metas */}
                <div className="p-4 border-b border-border/60">
                  <SectionTitle right={null}>🧭 Metas del período</SectionTitle>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 dark:bg-slate-800/60 text-[11px] uppercase text-muted-foreground tracking-wide">
                          <th className="text-left px-3 py-2 w-[45%]">Meta</th>
                          <th className="text-left px-3 py-2">Esperado</th>
                          <th className="text-left px-3 py-2">Resultado</th>
                          <th className="text-left px-3 py-2">Cumple</th>
                        </tr>
                      </thead>
                      <tbody>
                       {(() => {
  console.log("🔍 evalsEmpleado RAW:", evalsEmpleado);
  console.log("🔍 selected._id:", selected?._id, "periodoSel:", periodoSel);
  console.log("🔍 evalActual:", evalActual);
  console.log("empleadoIdFromUser(user) =>", empleadoIdFromUser(user));

const metas =
  (evalActual?.metasResultados?.length
    ? evalActual.metasResultados
    : (selected.hitos || []).find((h) => h.periodo === periodoSel)?.metas) || [];

console.log("🧭 metasResultados en evalActual:", evalActual?.metasResultados);

  if (!metas.length) {
    return (
      <tr>
        <td className="px-3 py-3 text-muted-foreground text-center" colSpan={4}>
          No hay metas definidas para este período.
        </td>
      </tr>
    );
  }

  return metas.map((m, idx) => (
    <tr key={idx} className="border-t border-border/50 odd:bg-background even:bg-muted/20">
       <td className="px-3 py-2">
   <div className="line-clamp-2 break-words">{m.nombre || "Meta"}</div>
 </td>
      <td className="px-3 py-2">
        {m.esperado ?? m.target ?? "—"} {m.unidad || ""}
      </td>
      <td className="px-3 py-2">
   <span className="inline-block min-w-[48px]">{m.resultado ?? "—"}</span>
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




{/* Comentarios (descargos) */}
                <div className="p-4 border-b border-border/60 space-y-3">
                  <SectionTitle>💬 Comentarios del período</SectionTitle>
                  {/* Listado de comentarios visibles (oculta RRHH si el usuario no es RRHH) */}
                  {(() => {
                    const todos = Array.isArray(evalActual?.comentarios) ? evalActual.comentarios : [];
                    const visibles = isHR ? todos : todos.filter(c => (c?.autorRol ?? "").toUpperCase() !== "RRHH");
                    return visibles.length ? (
                      <ul className="space-y-2">
                        {visibles.map((c, i) => (
                          <li key={c._id || i} className="rounded-lg ring-1 ring-border/60 bg-muted/30 dark:bg-slate-800/40 p-3">
                            <div className="text-[11px] text-muted-foreground mb-1">
                              {c?.autorNombre || "Usuario"} • {c?.autorRol || "—"} • {c?.fecha ? String(c.fecha).slice(0,10) : "—"}
                            </div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{c?.texto || "—"}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-muted-foreground">Sin comentarios todavía.</div>
                    );
                  })()}

                  {/* Entradas XL para descargo del jefe y colaborador (presentacional) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Descargo del colaborador</div>
                      <textarea
                        className="w-full min-h-32 rounded-md border border-border bg-background px-3 py-2 text-sm resize-y"
                        placeholder="Escribí tus comentarios, logros, bloqueos o aclaraciones…"
                        disabled
                      />
                      <div className="text-[11px] text-muted-foreground mt-1">* La carga/edición se realiza dentro del flujo de evaluación.</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Descargo del jefe</div>
                      <textarea
                        className="w-full min-h-32 rounded-md border border-border bg-background px-3 py-2 text-sm resize-y"
                        placeholder="Feedback del responsable directo…"
                        disabled
                      />
                    </div>
                  </div>
                </div>
                {/* Flujo */}
                <div className="p-4">
                  <SectionTitle>📑 Flujo de evaluación</SectionTitle>
                  <EvaluacionFlow
                    empleadoId={empleadoIdFromUser(user)}
                    plantilla={selected}
                    
                  defaultPeriodo={periodoSel || selected.hitos?.[0]?.periodo}
                    user={user}
                    onChanged={async () => {
                      try {
                        const empleadoId = empleadoIdFromUser(user);
                      const ev = await api(`/evaluaciones?empleado=${empleadoId}`);
console.log("📥 Response cruda de API:", ev, "esArray?", Array.isArray(ev));
if (Array.isArray(ev)) {
  setEvalsEmpleado(ev);
  console.log("✅ setEvalsEmpleado con", ev.length, "items");
} else if (ev?.items && Array.isArray(ev.items)) {
  setEvalsEmpleado(ev.items);
  console.log("✅ setEvalsEmpleado con", ev.items.length, "items (de items)");
} else {
  setEvalsEmpleado([]);
  console.warn("⚠ Response no era array:", ev);
}
                      } catch {}
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                Elegí un objetivo o aptitud en la izquierda para ver el detalle.
              </div>
            )}
          </section>

          {/* Historial real */}
          <aside className="hidden lg:block sticky top-4 self-start">
            <HistorialEvaluacion trazabilidad={evalActual?.timeline || []} />
          </aside>
        </div>
      </div>
    </div>
  );
}