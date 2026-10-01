import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Users, ChevronRight, ChevronDown, RotateCcw, AlertTriangle, Search,
  ShieldCheck, ArrowRight, Info, Plus, Minus, Scale,
} from "lucide-react";
import { getToken } from "@/lib/api";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import { getCurrentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";

/**
 * Restaurar asignaciones por empleado desde un backup.
 *
 * Muestra, persona por persona y agrupado por área, cómo quedarían sus
 * objetivos si se le devolviera la configuración del backup: qué se agrega,
 * qué se quita, qué pesos cambian y cómo queda la suma. Recién después de
 * verlo se puede aplicar, de a un empleado por vez.
 *
 * Restaura SOLO asignaciones y pesos. No toca evaluaciones, feedbacks ni notas
 * cerradas: los resultados cargados quedan donde están.
 */

const base = () => import.meta.env.VITE_API_URL || "http://localhost:5007/api";

async function postZip(ruta, archivo, params) {
  const fd = new FormData();
  fd.append("backup", archivo);
  const qs = new URLSearchParams(params).toString();
  const token = getToken();
  const res = await fetch(`${base()}${ruta}?${qs}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`);
  return json;
}

const pct = (n) => `${n}%`;
const tonoSuma = (n) => (n === 100 ? "text-emerald-700" : n > 100 ? "text-rose-700" : "text-amber-700");

/** Las dos listas enfrentadas: cómo está hoy y cómo quedaría. */
function Comparacion({ item }) {
  const idsB = new Set(item.despues.objetivos.map((x) => x.plantillaId));
  const idsA = new Set(item.ahora.objetivos.map((x) => x.plantillaId));
  const pesoA = new Map(item.ahora.objetivos.map((x) => [x.plantillaId, x.peso]));

  const fila = (o, lado) => {
    const enElOtro = lado === "ahora" ? idsB.has(o.plantillaId) : idsA.has(o.plantillaId);
    const cambiaPeso = lado === "backup" && enElOtro && pesoA.get(o.plantillaId) !== o.peso;
    const color = !enElOtro
      ? (lado === "ahora" ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")
      : cambiaPeso ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200";
    return (
      <div key={o.plantillaId} className={`flex items-start gap-2 rounded border px-2 py-1 ${color}`}>
        <span className="text-[11px] font-bold tabular-nums w-10 text-right shrink-0">
          {pct(o.peso)}
        </span>
        <span className="text-[11px] text-slate-700 leading-snug flex-1 min-w-0">
          {o.nombre}
          {cambiaPeso && (
            <span className="text-amber-700 font-semibold"> (hoy {pct(pesoA.get(o.plantillaId))})</span>
          )}
        </span>
        <span className="text-[9px] text-slate-400 shrink-0">{o.origen}</span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-start">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
          <span>Como está hoy</span>
          <span className={`tabular-nums ${tonoSuma(item.ahora.suma)}`}>Σ {pct(item.ahora.suma)}</span>
        </div>
        <div className="space-y-1">
          {item.ahora.objetivos.length
            ? item.ahora.objetivos.map((o) => fila(o, "ahora"))
            : <div className="text-[11px] text-slate-400 italic">Sin objetivos</div>}
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-center pt-8">
        <ArrowRight className="w-5 h-5 text-slate-300" />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
          <span>Como quedaría al restaurar</span>
          <span className={`tabular-nums ${tonoSuma(item.despues.suma)}`}>Σ {pct(item.despues.suma)}</span>
        </div>
        <div className="space-y-1">
          {item.despues.objetivos.length
            ? item.despues.objetivos.map((o) => fila(o, "backup"))
            : <div className="text-[11px] text-slate-400 italic">Sin objetivos</div>}
        </div>
      </div>
    </div>
  );
}

function FichaEmpleado({ item, anio, archivo, onAplicado }) {
  const [abierto, setAbierto] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const aplicar = async () => {
    setAplicando(true);
    try {
      const r = await postZip("/comparador/restaurar", archivo, { anio, empleadoId: item.empleadoId });
      toast.success(r.message);
      setConfirmar(false);
      onAplicado();
    } catch (e) {
      toast.error(e?.message || "No se pudo restaurar");
    } finally {
      setAplicando(false);
    }
  };

  const borde = item.riesgo ? "border-rose-300" : item.cambia ? "border-amber-200" : "border-slate-200";

  return (
    <div className={`rounded-lg border ${borde} bg-white overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setAbierto((v) => !v)} className="text-slate-400 hover:text-slate-600">
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
            {item.riesgo && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
            {item.nombre}
          </div>
          <div className="text-[11px] text-slate-500">{item.sector}</div>
        </div>

        <div className="flex items-center gap-3 text-[11px] shrink-0">
          {item.seAgregan.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
              <Plus className="w-3 h-3" />{item.seAgregan.length}
            </span>
          )}
          {item.seQuitan.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-rose-700 font-semibold">
              <Minus className="w-3 h-3" />{item.seQuitan.length}
            </span>
          )}
          {item.cambianPeso.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
              <Scale className="w-3 h-3" />{item.cambianPeso.length}
            </span>
          )}
          <span className="tabular-nums text-slate-400">
            <span className={tonoSuma(item.ahora.suma)}>{pct(item.ahora.suma)}</span>
            {" → "}
            <span className={tonoSuma(item.despues.suma)}>{pct(item.despues.suma)}</span>
          </span>
        </div>

        {item.cambia && (
          <button onClick={() => setConfirmar(true)} disabled={aplicando}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100 disabled:opacity-50">
            {aplicando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Restaurar
          </button>
        )}
      </div>

      {abierto && (
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/50 space-y-3">
          <Comparacion item={item} />

          {item.riesgo && (
            <div className="flex items-start gap-2 text-[11px] bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Alguno de los objetivos que saldrían de la lista <strong>tiene resultados cargados</strong>.
                Los resultados no se borran, pero el objetivo dejaría de contar. Validalo con la referente
                antes de aplicar.
              </span>
            </div>
          )}

          {item.quedaDiferenciaPorPlantillas && (
            <div className="flex items-start gap-2 text-[11px] bg-slate-100 border border-slate-200 text-slate-600 rounded-lg p-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>
                Aun restaurando, no queda igual que en el backup ({pct(item.backup.suma)}): la diferencia
                que sobra viene de <strong>plantillas creadas o borradas después</strong>, que son
                compartidas por todo el sector y no se arreglan persona por persona. Eso se resuelve
                desde <strong>Objetivos sin Datos</strong>.
              </span>
            </div>
          )}

          {item.operaciones.length === 0 && (
            <div className="text-[11px] text-slate-500 italic">
              No hay overrides para restaurar en esta persona.
            </div>
          )}

          {item.operaciones.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Operaciones que se ejecutarían ({item.operaciones.length})
              </div>
              <ul className="space-y-0.5">
                {item.operaciones.map((o, i) => (
                  <li key={i} className="text-[11px] font-mono text-slate-600">
                    {o.op === "recrear" && `recrear override ${o.excluido ? "de exclusión" : `peso ${o.peso ?? "base"}`}`}
                    {o.op === "eliminar" && `eliminar override ${o.excluido ? "de exclusión" : `peso ${o.peso ?? "base"}`}`}
                    {o.op === "ajustar" && `ajustar override: excluido ${o.de.excluido}→${o.a.excluido}, peso ${o.de.peso}→${o.a.peso}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirmar(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-black text-slate-800 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-indigo-500" /> Restaurar asignaciones
            </h4>
            <p className="text-sm text-slate-700 mt-3 font-semibold">{item.nombre}</p>
            <div className="mt-3 text-xs text-slate-600 space-y-1">
              <div>Se ejecutarán <strong>{item.operaciones.length} operaciones</strong> sobre sus asignaciones de {fiscalYearLabel(anio)}.</div>
              <div>Suma de pesos: <strong>{pct(item.ahora.suma)} → {pct(item.despues.suma)}</strong></div>
              <div className="text-emerald-700 pt-1">
                No se tocan evaluaciones, feedbacks ni notas cerradas. Queda auditado con el estado previo,
                así que se puede deshacer.
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmar(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={aplicar} disabled={aplicando}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">
                {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RestaurarPorEmpleado({ archivo }) {
  const [anio, setAnio] = useState(getCurrentFiscalYear() - 1);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [soloCambios, setSoloCambios] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [areasAbiertas, setAreasAbiertas] = useState(() => new Set());

  const cargar = useCallback(async () => {
    if (!archivo) return;
    setCargando(true);
    try {
      const d = await postZip("/comparador/previo", archivo, { anio });
      setData(d);
      // Abrir de entrada las áreas que tienen algo para revisar.
      setAreasAbiertas(new Set(d.items.filter((i) => i.cambia).map((i) => i.area)));
    } catch (e) {
      toast.error(e?.message || "No se pudo calcular la vista previa");
    } finally {
      setCargando(false);
    }
  }, [archivo, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const porArea = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    const filtrados = data.items.filter((i) => {
      if (soloCambios && !i.cambia) return false;
      if (!q) return true;
      return `${i.nombre} ${i.area} ${i.sector}`.toLowerCase().includes(q);
    });
    const mapa = new Map();
    for (const i of filtrados) {
      if (!mapa.has(i.area)) mapa.set(i.area, []);
      mapa.get(i.area).push(i);
    }
    return [...mapa.entries()]
      .map(([area, items]) => ({ area, items, conCambios: items.filter((x) => x.cambia).length }))
      .sort((a, b) => b.conCambios - a.conCambios || a.area.localeCompare(b.area, "es"));
  }, [data, soloCambios, busqueda]);

  if (!archivo) {
    return (
      <div className="text-sm text-slate-400 italic py-8 text-center">
        Subí un backup arriba para ver qué pasaría al restaurar por empleado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" /> Restaurar por empleado
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Agrupado por área. Mirás caso por caso y aplicás de a uno.
          </p>
        </div>
        <SelectorAnioFiscal value={anio} onChange={setAnio} size="sm" />
      </div>

      <div className="flex items-start gap-2 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Restaurar devuelve <strong>solo las asignaciones y los pesos</strong> al estado del backup.
          No toca evaluaciones, feedbacks ni notas cerradas: los resultados cargados quedan donde están.
          La nota en vivo cambia como consecuencia de que los pesos vuelvan a ser los correctos, no porque
          se modifique nada de lo evaluado. Cada restauración queda auditada con el estado previo.
        </span>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-slate-600">
            <strong className="text-amber-700">{data.conCambios}</strong> de {data.total} con diferencias
            {data.conRiesgo > 0 && (
              <span className="text-rose-700 font-semibold"> · {data.conRiesgo} con objetivos evaluados en juego</span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" className="accent-indigo-500 w-3.5 h-3.5"
              checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
            Solo con diferencias
          </label>
          <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona, área o sector…"
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> calculando vista previa…
        </div>
      ) : porArea.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> Nadie tiene diferencias con el backup en {fiscalYearLabel(anio)}.
        </div>
      ) : (
        <div className="space-y-3">
          {porArea.map(({ area, items, conCambios }) => {
            const abierta = areasAbiertas.has(area);
            return (
              <div key={area} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setAreasAbiertas((s) => {
                    const n = new Set(s);
                    n.has(area) ? n.delete(area) : n.add(area);
                    return n;
                  })}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50/60 hover:bg-slate-100/60 text-left"
                >
                  {abierta ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm font-bold text-slate-800 flex-1">{area}</span>
                  <span className="text-[11px] text-slate-500">
                    {conCambios > 0 && <strong className="text-amber-700">{conCambios} con diferencias</strong>}
                    {conCambios > 0 && " · "}
                    {items.length} {items.length === 1 ? "persona" : "personas"}
                  </span>
                </button>
                {abierta && (
                  <div className="p-3 space-y-2">
                    {items.map((i) => (
                      <FichaEmpleado key={i.empleadoId} item={i} anio={anio} archivo={archivo} onAplicado={cargar} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
