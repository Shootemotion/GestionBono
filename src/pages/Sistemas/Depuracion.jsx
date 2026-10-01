import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, ChevronRight, ChevronDown, Scale, Trash2, Search, ShieldCheck,
  AlertTriangle, Lock, Check, Info, Copy,
} from "lucide-react";
import { api, getToken } from "@/lib/api";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import { getCurrentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";

/**
 * Depuración de objetivos duplicados, de a un empleado y en dos pasos.
 *
 *   PASO 1  Devuelve los pesos desde un backup previo al desorden.
 *   PASO 2  Excluye los objetivos que nunca se evaluaron (los clones).
 *
 * El paso 2 queda bloqueado hasta que el paso 1 esté saldado, porque las
 * exclusiones se calculan sobre los pesos ya corregidos. El bloqueo también
 * está en el backend: esta pantalla no es la única garantía.
 *
 * Solo escribe overrides. Nunca toca evaluaciones, feedbacks ni notas.
 */

const base = () => import.meta.env.VITE_API_URL || "http://localhost:5007/api";

async function postZip(ruta, archivo, params) {
  const fd = new FormData();
  if (archivo) fd.append("backup", archivo);
  const token = getToken();
  const res = await fetch(`${base()}${ruta}?${new URLSearchParams(params)}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`);
  return json;
}

const pct = (n) => `${n}%`;
const tono = (n) => (n === 100 ? "text-emerald-700" : n > 100 ? "text-rose-700" : "text-amber-700");

/** Una línea de objetivo, con su origen y si tiene datos cargados. */
function Linea({ o, modo }) {
  const color = modo === "conserva"
    ? "bg-emerald-50 border-emerald-200"
    : modo === "excluye"
      ? "bg-rose-50 border-rose-200"
      : "bg-white border-slate-200";
  return (
    <div className={`flex items-center gap-2 rounded border px-2 py-1 ${color}`}>
      <span className="text-[11px] font-bold tabular-nums w-10 text-right shrink-0">{pct(o.peso)}</span>
      <span className="text-[11px] text-slate-700 leading-snug flex-1 min-w-0 truncate" title={o.nombre}>
        {o.nombre}
      </span>
      {o.duplicado && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700">
          <Copy className="w-2.5 h-2.5" /> dup
        </span>
      )}
      <span className={`shrink-0 text-[9px] font-semibold ${o.tieneDatos ? "text-emerald-600" : "text-slate-400"}`}>
        {o.tieneDatos ? "evaluado" : "sin datos"}
      </span>
      <span className="shrink-0 text-[9px] text-slate-400 w-14 text-right">{o.origen}</span>
    </div>
  );
}

function Ficha({ item, anio, archivo, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(null);

  const paso1Hecho = !item.paso1.pendiente;
  const paso2Hecho = !item.paso2.pendiente;
  const listo = item.listo;

  const correr = async (paso) => {
    setOcupado(paso);
    try {
      const r = await postZip(`/comparador/depuracion/paso${paso}`, archivo, { anio, empleadoId: item.empleadoId });
      toast.success(r.message);
      onCambio();
    } catch (e) {
      toast.error(e?.message || `No se pudo aplicar el paso ${paso}`);
    } finally {
      setOcupado(null);
    }
  };

  const borde = listo ? "border-emerald-200" : !item.cierraEn100 ? "border-rose-300" : "border-slate-200";

  return (
    <div className={`rounded-lg border ${borde} bg-white overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setAbierto((v) => !v)} className="text-slate-400 hover:text-slate-600">
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
            {listo && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            {!item.cierraEn100 && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
            {item.nombre}
          </div>
          <div className="text-[11px] text-slate-500">{item.sector}</div>
        </div>

        {/* Recorrido de pesos */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] tabular-nums shrink-0">
          <span className={tono(item.actual.suma)}>{pct(item.actual.suma)}</span>
          <span className="text-slate-300">→</span>
          <span className={tono(item.paso1.resultado.suma)}>{pct(item.paso1.resultado.suma)}</span>
          <span className="text-slate-300">→</span>
          <span className={`font-bold ${tono(item.paso2.resultado.suma)}`}>{pct(item.paso2.resultado.suma)}</span>
        </div>

        {/* Los dos pasos */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => correr(1)}
            disabled={paso1Hecho || ocupado !== null || !archivo}
            title={!archivo ? "Subí el backup arriba" : paso1Hecho ? "Ya está hecho" : `${item.paso1.operaciones.length} pesos a restaurar`}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${paso1Hecho
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default"
              : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"}`}
          >
            {ocupado === 1 ? <Loader2 className="w-3 h-3 animate-spin" />
              : paso1Hecho ? <Check className="w-3 h-3" /> : <Scale className="w-3 h-3" />}
            1. Pesos{!paso1Hecho && ` (${item.paso1.operaciones.length})`}
          </button>

          <button
            onClick={() => correr(2)}
            disabled={!paso1Hecho || paso2Hecho || ocupado !== null}
            title={!paso1Hecho ? "Primero hay que hacer el paso 1" : paso2Hecho ? "Ya está hecho" : `${item.paso2.excluye.length} duplicados a excluir`}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${paso2Hecho
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default"
              : !paso1Hecho
                ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
          >
            {ocupado === 2 ? <Loader2 className="w-3 h-3 animate-spin" />
              : paso2Hecho ? <Check className="w-3 h-3" />
                : !paso1Hecho ? <Lock className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
            2. Purgar{!paso2Hecho && paso1Hecho && ` (${item.paso2.excluye.length})`}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/50 space-y-3">
          {!item.cierraEn100 && (
            <div className="flex items-start gap-2 text-[11px] bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Con los dos pasos esta persona quedaría en <strong>{pct(item.paso2.resultado.suma)}</strong>, no en 100%.
                Revisalo con la referente antes de aplicar: puede faltar un objetivo o sobrar peso en los evaluados.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center justify-between">
                <span>Se conservan — tienen evaluaciones</span>
                <span className={`tabular-nums ${tono(item.paso2.resultado.suma)}`}>Σ {pct(item.paso2.resultado.suma)}</span>
              </div>
              <div className="space-y-1">
                {item.paso2.conserva.length
                  ? item.paso2.conserva.map((o) => <Linea key={o.plantillaId} o={o} modo="conserva" />)
                  : <div className="text-[11px] text-slate-400 italic">Ninguno</div>}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1.5 flex items-center justify-between">
                <span>Se excluyen — sin ninguna evaluación</span>
                <span className="tabular-nums text-slate-400">
                  {item.paso2.excluye.length} obj / {pct(item.paso2.excluye.reduce((a, x) => a + x.peso, 0))}
                </span>
              </div>
              <div className="space-y-1">
                {item.paso2.excluye.length
                  ? item.paso2.excluye.map((o) => <Linea key={o.plantillaId} o={o} modo="excluye" />)
                  : <div className="text-[11px] text-slate-400 italic">Nada para excluir</div>}
              </div>
            </div>
          </div>

          {item.paso1.pendiente && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Paso 1 — {item.paso1.operaciones.length} operaciones sobre pesos
              </div>
              <ul className="space-y-0.5">
                {item.paso1.operaciones.slice(0, 12).map((o, i) => (
                  <li key={i} className="text-[11px] font-mono text-slate-600">
                    {o.op === "recrear" && `recrear ${o.excluido ? "exclusión" : `peso ${o.peso ?? "base"}`}`}
                    {o.op === "eliminar" && `eliminar ${o.excluido ? "exclusión" : `peso ${o.peso ?? "base"}`}`}
                    {o.op === "ajustar" && `ajustar peso ${o.de.peso} → ${o.a.peso}`}
                  </li>
                ))}
                {item.paso1.operaciones.length > 12 && (
                  <li className="text-[11px] text-slate-400">… y {item.paso1.operaciones.length - 12} más</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Depuracion({ archivo }) {
  const [anio, setAnio] = useState(getCurrentFiscalYear() - 1);
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState("");
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    api("/reportes/areas")
      .then((a) => {
        setAreas(a);
        // Arranca acotado al Área Técnica, que es donde ocurrió el problema.
        const tec = a.find((x) => /t[ée]cnica/i.test(x.nombre));
        if (tec) setAreaId(String(tec._id));
      })
      .catch(() => { /* sin áreas se trabaja sobre todos */ });
  }, []);

  const cargar = useCallback(async () => {
    if (!archivo) return;
    setCargando(true);
    try {
      const params = { anio };
      if (areaId) params.areaId = areaId;
      setData(await postZip("/comparador/depuracion/plan", archivo, params));
    } catch (e) {
      toast.error(e?.message || "No se pudo calcular el plan");
    } finally {
      setCargando(false);
    }
  }, [archivo, anio, areaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    return data.items.filter((i) => {
      if (soloPendientes && i.listo) return false;
      if (!q) return true;
      return `${i.nombre} ${i.sector}`.toLowerCase().includes(q);
    });
  }, [data, soloPendientes, busqueda]);

  if (!archivo) {
    return (
      <div className="text-sm text-slate-400 italic py-8 text-center">
        Subí el backup previo al desorden para calcular el plan de depuración.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-800">Depurar duplicados, de a un empleado</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Paso 1 devuelve los pesos del backup. Paso 2 excluye los objetivos que nunca se evaluaron.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white">
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a._id} value={String(a._id)}>{a.nombre}</option>)}
          </select>
          <SelectorAnioFiscal value={anio} onChange={setAnio} size="sm" />
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] bg-slate-100 border border-slate-200 text-slate-600 rounded-lg p-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <span>
          El <strong>paso 2 espera al paso 1</strong>: las exclusiones se calculan sobre los pesos ya
          corregidos, así que purgar antes deja los pesos mal. El bloqueo también está en el servidor.
          Solo se escriben asignaciones — no se toca ninguna evaluación ni nota cerrada, y todo queda
          auditado con el estado previo.
        </span>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-slate-600 flex flex-wrap gap-3">
            <span><strong className="text-emerald-700">{data.listos}</strong> listos</span>
            <span><strong className="text-indigo-700">{data.pendientesPaso1}</strong> esperan paso 1</span>
            <span><strong className="text-rose-700">{data.pendientesPaso2}</strong> esperan paso 2</span>
            {data.noCierran > 0 && (
              <span className="text-rose-700 font-semibold">{data.noCierran} no cierran en 100%</span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" className="accent-indigo-500 w-3.5 h-3.5"
              checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo pendientes
          </label>
          <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona o sector…"
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> calculando plan…
        </div>
      ) : filas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> No queda nada pendiente en {fiscalYearLabel(anio)}.
        </div>
      ) : (
        <div className="space-y-2">
          {filas.map((i) => (
            <Ficha key={i.empleadoId} item={i} anio={anio} archivo={archivo} onCambio={cargar} />
          ))}
        </div>
      )}
    </div>
  );
}
