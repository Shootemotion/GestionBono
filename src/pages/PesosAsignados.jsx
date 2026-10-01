import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Scale, Search, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Target, Sparkles, Info, MinusCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { getCurrentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";

/**
 * Pesos asignados por empleado.
 *
 * Los pesos no se cargan en un solo lugar: cada plantilla tiene un alcance
 * (global / área / sector / empleado) y encima van los overrides individuales.
 * Por eso desde la pantalla de carga nadie puede ver cuánto suma una persona, y
 * el desvío recién aparece cuando la nota ya salió. Esta pantalla es el control
 * que faltaba: muestra el total de cada empleado y de dónde sale cada punto.
 *
 * Los números los calcula el backend con el mismo criterio que el dashboard
 * (isTemplateApplicable), así que lo que se ve acá es lo que se calcula.
 */

const nombreEmp = (e) =>
  `${e.apellido || ""}${e.apellido && e.nombre ? ", " : ""}${e.nombre || ""}`.trim() || "—";

const SCOPE_LABEL = {
  empleado: "personal",
  employee: "personal",
  sector: "sector",
  area: "área",
  global: "global",
  all: "global",
};

/* Estado de una suma: 100 está bien, por debajo es techo, por encima se pasa. */
function estadoSuma(suma, cantidad) {
  if (!cantidad) return { tono: "vacio", texto: "sin carga" };
  if (suma === 100) return { tono: "ok", texto: "100%" };
  if (suma < 100) return { tono: "bajo", texto: `${suma}%` };
  return { tono: "alto", texto: `${suma}%` };
}

const TONOS = {
  ok: "text-emerald-700 bg-emerald-50 border-emerald-200",
  bajo: "text-amber-700 bg-amber-50 border-amber-200",
  alto: "text-rose-700 bg-rose-50 border-rose-200",
  vacio: "text-slate-400 bg-slate-50 border-slate-200",
};

function Pastilla({ suma, cantidad }) {
  const { tono, texto } = estadoSuma(suma, cantidad);
  return (
    <span className={`inline-flex items-center justify-center min-w-[52px] px-2 py-0.5 rounded-md border text-xs font-bold tabular-nums ${TONOS[tono]}`}>
      {texto}
    </span>
  );
}

/* Detalle de un bloque (objetivos o competencias) de un empleado. */
function DetalleBloque({ titulo, icono: Icono, bloque }) {
  const { detalle = [], suma, cantidad, excluidos } = bloque || {};
  if (!detalle.length) {
    return (
      <div className="flex-1 min-w-[280px]">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Icono className="w-3.5 h-3.5" /> {titulo}
        </div>
        <div className="text-xs text-slate-400 italic">Sin plantillas asignadas.</div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-[280px]">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icono className="w-3.5 h-3.5" /> {titulo}
        <span className="text-slate-300">·</span>
        <span className="text-slate-500 normal-case tracking-normal font-semibold">
          {cantidad} {cantidad === 1 ? "activa" : "activas"}
          {excluidos > 0 && `, ${excluidos} excluida${excluidos === 1 ? "" : "s"}`}
        </span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {detalle.map((d) => (
            <tr key={d.plantillaId} className={d.excluido ? "text-slate-400" : "text-slate-700"}>
              <td className="py-1 pr-2 w-14 text-right tabular-nums font-bold">
                {d.excluido ? (
                  <MinusCircle className="w-3.5 h-3.5 inline text-slate-300" />
                ) : (
                  `${d.peso}%`
                )}
              </td>
              <td className="py-1 pr-2">
                <span className={d.excluido ? "line-through" : ""}>{d.nombre}</span>
              </td>
              <td className="py-1 text-right whitespace-nowrap">
                <span className="text-[10px] text-slate-400">{SCOPE_LABEL[d.scopeType] || d.scopeType}</span>
                {d.origen === "override" && (
                  <span
                    className="ml-1.5 text-[10px] font-semibold text-indigo-500"
                    title={`Peso individual. La plantilla trae ${d.pesoBase}%.`}
                  >
                    override
                  </span>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-t border-slate-200">
            <td className="pt-1.5 pr-2 text-right tabular-nums font-black text-slate-800">{suma}%</td>
            <td className="pt-1.5 text-slate-400 text-[11px]" colSpan={2}>
              suma asignada
              {suma !== 100 && cantidad > 0 && (
                <span className={suma < 100 ? "text-amber-600 font-semibold" : "text-rose-600 font-semibold"}>
                  {suma < 100 ? ` — faltan ${Math.round((100 - suma) * 100) / 100} puntos` : ` — sobran ${Math.round((suma - 100) * 100) / 100} puntos`}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function PesosAsignados() {
  const [anio, setAnio] = useState(getCurrentFiscalYear());
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloDesvios, setSoloDesvios] = useState(true);
  const [incluirDesvinculados, setIncluirDesvinculados] = useState(false);
  const [abierto, setAbierto] = useState(() => new Set());

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api(`/dashboard/pesos-asignados?anio=${anio}&incluirDesvinculados=${incluirDesvinculados}`)
      .then((res) => { if (!cancelado) { setData(res); setAbierto(new Set()); } })
      .catch((e) => { if (!cancelado) toast.error(e?.message || "No se pudieron cargar los pesos"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [anio, incluirDesvinculados]);

  const tieneDesvio = (i) =>
    (i.objetivos.cantidad > 0 && i.objetivos.suma !== 100) ||
    (i.competencias.cantidad > 0 && i.competencias.suma !== 100);

  const filas = useMemo(() => {
    const items = data?.items || [];
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (soloDesvios && !tieneDesvio(i)) return false;
      if (!q) return true;
      return [i.nombre, i.apellido, i.area, i.sector, i.puesto]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [data, busqueda, soloDesvios]);

  const toggle = (id) =>
    setAbierto((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const r = data?.resumen;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Scale className="w-6 h-6 text-indigo-500" /> Pesos asignados
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Cuánto suman los objetivos y las competencias de cada persona en {fiscalYearLabel(anio)}.
              Los pesos salen del alcance de cada plantilla más los overrides individuales, así que
              acá es el único lugar donde se ve el total de un empleado.
            </p>
          </div>
          <SelectorAnioFiscal value={anio} onChange={setAnio} showCaption />
        </div>

        {/* POR QUÉ IMPORTA */}
        <div className="mb-5 flex items-start gap-2 text-xs bg-slate-100 border border-slate-200 text-slate-600 rounded-lg p-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <span>
            Un empleado cuyos objetivos suman menos de 100 tiene un <strong>techo</strong>: aunque cumpla
            todo al 100%, su puntaje de objetivos llega solo hasta esa suma. Si suman más de 100, puede
            superar el 100%. Las dos cosas distorsionan la nota final y no se ven desde la carga.
          </span>
        </div>

        {/* RESUMEN */}
        {r && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Empleados", valor: r.total, tono: "text-slate-800" },
              { label: "Objetivos ≠ 100%", valor: r.objetivosFueraDe100, tono: r.objetivosFueraDe100 ? "text-rose-600" : "text-emerald-600" },
              { label: "Competencias ≠ 100%", valor: r.competenciasFueraDe100, tono: r.competenciasFueraDe100 ? "text-rose-600" : "text-emerald-600" },
              { label: "Sin nada cargado", valor: r.sinCarga, tono: "text-slate-400" },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.label}</div>
                <div className={`text-2xl font-black tabular-nums ${c.tono}`}>{c.valor}</div>
              </div>
            ))}
          </div>
        )}

        {/* FILTROS */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, área o sector…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2">
            <input type="checkbox" className="accent-indigo-500 w-4 h-4" checked={soloDesvios} onChange={(e) => setSoloDesvios(e.target.checked)} />
            Solo con desvíos
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2">
            <input type="checkbox" className="accent-indigo-500 w-4 h-4" checked={incluirDesvinculados} onChange={(e) => setIncluirDesvinculados(e.target.checked)} />
            Incluir desvinculados
          </label>
        </div>

        {/* TABLA */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculando pesos…
            </div>
          ) : filas.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              {soloDesvios ? "Ningún empleado con desvíos de peso." : "Sin resultados."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60">
                  <th className="w-8" />
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest">Empleado</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest">Área / Sector</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest">Objetivos</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest">Competencias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((i) => {
                  const open = abierto.has(i.empleadoId);
                  const desvio = tieneDesvio(i);
                  return (
                    <Fragment key={i.empleadoId}>
                      <tr
                        onClick={() => toggle(i.empleadoId)}
                        className={`cursor-pointer hover:bg-slate-50 ${desvio ? "bg-rose-50/30" : ""}`}
                      >
                        <td className="pl-3 text-slate-400">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {desvio && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                            {nombreEmp(i)}
                          </div>
                          {i.puesto && <div className="text-[11px] text-slate-400">{i.puesto}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {i.area || "—"}
                          {i.sector && <span className="text-slate-300"> · {i.sector}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Pastilla suma={i.objetivos.suma} cantidad={i.objetivos.cantidad} />
                          <div className="text-[10px] text-slate-400 mt-0.5">{i.objetivos.cantidad} obj.</div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Pastilla suma={i.competencias.suma} cantidad={i.competencias.cantidad} />
                          <div className="text-[10px] text-slate-400 mt-0.5">{i.competencias.cantidad} comp.</div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td />
                          <td colSpan={4} className="px-3 py-4">
                            <div className="flex flex-wrap gap-8">
                              <DetalleBloque titulo="Objetivos" icono={Target} bloque={i.objetivos} />
                              <DetalleBloque titulo="Competencias" icono={Sparkles} bloque={i.competencias} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!cargando && filas.length > 0 && (
          <div className="text-[11px] text-slate-400 mt-3">
            {filas.length} de {data?.items?.length || 0} empleados. Click en una fila para ver de dónde sale cada punto.
          </div>
        )}
      </div>
    </div>
  );
}
