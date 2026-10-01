import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ghost, Loader2, AlertTriangle, ChevronRight, ChevronDown, Trash2, Users,
  Copy, CalendarOff, Info, RefreshCw, ShieldCheck, CalendarRange,
} from "lucide-react";
import { api } from "@/lib/api";
import { getCurrentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";

/**
 * Objetivos sin datos — herramienta de limpieza.
 *
 * Lista las plantillas de un año fiscal que NO tienen ninguna evaluación con un
 * resultado cargado. Sirve para encontrar los duplicados que dejó una clonación
 * mal hecha: en enero de 2026 se clonaron objetivos del sector Analítica con
 * alcance de sector, y cada copia le apareció a las 10 personas del sector sin
 * datos, inflando la suma de pesos hasta 250%.
 *
 * El borrado es LÓGICO y pasa por el mismo endpoint de siempre, así que queda
 * auditado y se puede restaurar. Aun así se elimina de a una y con
 * confirmación: la idea es revisar caso por caso, no barrer.
 */

const TONO = {
  fuerte: "border-rose-200 bg-rose-50/40",
  medio: "border-amber-200 bg-amber-50/30",
  suave: "border-slate-200 bg-white",
};

const fecha = (d) =>
  d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const soloFecha = (d) => (d ? new Date(d).toLocaleDateString("es-AR") : null);

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2025M09" -> "sep 25" · "2025Q1" -> "Q1 25" */
const periodoLegible = (p) => {
  const m = String(p || "").match(/^(\d{4})(?:M(\d{2})|Q(\d)|S(\d)|A)?$/);
  if (!m) return String(p || "");
  const aa = m[1].slice(-2);
  if (m[2]) return `${MES[Number(m[2]) - 1]} ${aa}`;
  if (m[3]) return `Q${m[3]} ${aa}`;
  if (m[4]) return `S${m[4]} ${aa}`;
  return `anual ${aa}`;
};

/** Rango de períodos que cubre un objetivo, para saber de qué tramo del año es. */
function Cobertura({ c, compacta = false }) {
  if (!c || !c.cantidad) {
    return <span className="text-slate-400">sin períodos</span>;
  }
  const rango = c.primero === c.ultimo
    ? periodoLegible(c.primero)
    : `${periodoLegible(c.primero)} → ${periodoLegible(c.ultimo)}`;
  return (
    <span className="inline-flex items-center gap-1" title={(c.periodos || []).join("  ")}>
      <CalendarRange className="w-3 h-3 shrink-0" />
      <strong className="text-slate-700">{c.frecuencia || "—"}</strong>
      <span className="text-slate-400">·</span>
      <span>{rango}</span>
      {!compacta && <span className="text-slate-400">({c.cantidad} períodos)</span>}
      {c.fechaLimite && <span className="text-slate-400">· vence {soloFecha(c.fechaLimite)}</span>}
    </span>
  );
}

function Detalle({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    api(`/templates/sin-datos/${id}`)
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e?.message || "No se pudo cargar el detalle"));
    return () => { vivo = false; };
  }, [id]);

  if (error) return <div className="text-xs text-rose-600 px-4 py-3">{error}</div>;
  if (!data) return <div className="text-xs text-slate-400 px-4 py-3 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> cargando…</div>;

  const { plantilla, evaluaciones } = data;
  const conValores = evaluaciones.filter((e) => e.valores.length);

  return (
    <div className="px-4 py-3 text-xs space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Insertada realmente</div>
          <div className="font-semibold text-slate-700">{fecha(plantilla.insertadoEl)}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dice createdAt</div>
          <div className={`font-semibold ${new Date(plantilla.createdAt) < new Date(plantilla.insertadoEl) - 86400000 ? "text-rose-600" : "text-slate-700"}`}>
            {fecha(plantilla.createdAt)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Metas</div>
          <div className="font-semibold text-slate-700">{plantilla.metas.length}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluaciones creadas</div>
          <div className="font-semibold text-slate-700">{evaluaciones.length}</div>
        </div>
      </div>

      {plantilla.metas.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Metas configuradas</div>
          <ul className="space-y-0.5">
            {plantilla.metas.map((m, i) => (
              <li key={i} className="text-slate-600">• {m.nombre} <span className="text-slate-400">({m.unidad || "—"}, esperado {m.esperado ?? "—"})</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className={`rounded-lg border p-2.5 ${conValores.length ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
        {conValores.length ? (
          <div className="text-rose-700">
            <strong>Atención:</strong> tiene {conValores.length} evaluación(es) con datos cargados. No debería estar en esta lista — no la borres sin revisar.
          </div>
        ) : (
          <div className="text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            Verificado: {evaluaciones.length === 0
              ? "no tiene ninguna evaluación asociada."
              : `tiene ${evaluaciones.length} evaluación(es) pero ninguna con un resultado cargado.`}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ObjetivosSinDatos() {
  const [anio, setAnio] = useState(getCurrentFiscalYear() - 1);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [soloConGemela, setSoloConGemela] = useState(true);
  const [abierto, setAbierto] = useState(() => new Set());
  const [borrando, setBorrando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api(`/templates/sin-datos?anio=${anio}`)
      .then((d) => { setData(d); setAbierto(new Set()); })
      .catch((e) => toast.error(e?.message || "No se pudo cargar"))
      .finally(() => setCargando(false));
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => {
    const items = data?.items || [];
    if (!soloConGemela) return items;
    return items.filter((i) => i.gemelas.some((g) => g.evaluacionesConDato > 0));
  }, [data, soloConGemela]);

  const toggle = (id) => setAbierto((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const eliminar = async (item) => {
    setBorrando(item._id);
    try {
      await api(`/templates/${item._id}`, { method: "DELETE" });
      toast.success(`Eliminado: ${item.nombre.slice(0, 40)}`);
      setConfirmar(null);
      cargar();
    } catch (e) {
      toast.error(e?.message || "No se pudo eliminar");
    } finally {
      setBorrando(null);
    }
  };

  const r = data?.resumen;

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Ghost className="w-5 h-5 text-indigo-500" /> Objetivos sin datos
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Plantillas de {fiscalYearLabel(anio)} sin ninguna evaluación con resultado cargado. Sirven para
            encontrar duplicados de clonaciones. El borrado es lógico y queda auditado: se puede restaurar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelectorAnioFiscal value={anio} onChange={setAnio} size="sm" />
          <button onClick={cargar} disabled={cargando}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Resumen */}
      {r && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: "Plantillas del año", v: r.plantillasDelAnio, c: "text-slate-700" },
            { l: "Sin ningún dato", v: r.sinNingunDato, c: "text-amber-600" },
            { l: "Con gemela que sí tiene datos", v: r.conGemelaQueSiTieneDatos, c: "text-rose-600" },
            { l: "Alcances distintos", v: r.personasAlcanzadas, c: "text-slate-700" },
          ].map((c) => (
            <div key={c.l} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{c.l}</div>
              <div className={`text-2xl font-black tabular-nums ${c.c}`}>{c.v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs bg-slate-100 border border-slate-200 text-slate-600 rounded-lg p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <span>
          En un año fiscal recién empezado <strong>todo</strong> aparece sin datos, porque nadie cargó resultados
          todavía. La señal fuerte es <strong>"con gemela que sí tiene datos"</strong>: otra plantilla del mismo
          alcance, con nombre casi igual, que sí se evaluó todo el año. Ese es el duplicado.
        </span>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
        <input type="checkbox" className="accent-indigo-500 w-4 h-4"
          checked={soloConGemela} onChange={(e) => setSoloConGemela(e.target.checked)} />
        Mostrar solo las que tienen una gemela con datos ({data?.items?.filter((i) => i.gemelas.some((g) => g.evaluacionesConDato > 0)).length ?? 0})
      </label>

      {/* Lista */}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> analizando…
        </div>
      ) : filas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> No hay plantillas que cumplan el criterio.
        </div>
      ) : (
        <div className="space-y-2">
          {filas.map((i) => {
            const gemelaFuerte = i.gemelas.find((g) => g.evaluacionesConDato > 0);
            const tono = gemelaFuerte ? "fuerte" : i.empleadosAlcanzados > 1 ? "medio" : "suave";
            const open = abierto.has(i._id);
            return (
              <div key={i._id} className={`rounded-xl border overflow-hidden ${TONO[tono]}`}>
                <div className="flex items-start gap-3 p-3">
                  <button onClick={() => toggle(i._id)} className="mt-0.5 text-slate-400 hover:text-slate-600">
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">{i.nombre}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <strong className="text-slate-700">{i.empleadosAlcanzados}</strong> persona{i.empleadosAlcanzados === 1 ? "" : "s"}
                      </span>
                      <span>{i.scopeType} · <strong className="text-slate-700">{i.alcance}</strong></span>
                      <span>peso <strong className="text-slate-700">{i.pesoBase}%</strong></span>
                      <span>{i.tipo}</span>
                      <span>{i.metas} meta{i.metas === 1 ? "" : "s"}</span>
                      {!i.activo && <span className="text-slate-400">inactiva</span>}
                      {i.fechaFalseada && (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                          <CalendarOff className="w-3 h-3" /> fecha falseada
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1">
                      <Cobertura c={i.cobertura} />
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1">
                      insertada {fecha(i.insertadoEl)}
                      {i.creadoPor && <> · por <strong className="text-slate-600">{i.creadoPor}</strong></>}
                    </div>

                    {gemelaFuerte && (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-white/70 p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Duplica a esta, que sí tiene datos
                        </div>
                        <div className="text-xs text-slate-700 mt-0.5">{gemelaFuerte.nombre}</div>
                        <div className="text-[11px] text-slate-500">
                          peso {gemelaFuerte.pesoBase}% · <strong className="text-emerald-700">{gemelaFuerte.evaluacionesConDato} evaluaciones con datos</strong> ·
                          {" "}{gemelaFuerte.similitud}% de coincidencia · insertada {fecha(gemelaFuerte.insertadoEl)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          <Cobertura c={gemelaFuerte.cobertura} compacta />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setConfirmar(i)}
                    disabled={borrando === i._id}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-bold hover:bg-rose-50 disabled:opacity-50"
                  >
                    {borrando === i._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Eliminar
                  </button>
                </div>

                {open && (
                  <div className="border-t border-slate-200/70 bg-white/60">
                    <Detalle id={i._id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmación */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setConfirmar(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-black text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" /> Eliminar objetivo
            </h4>
            <p className="text-sm text-slate-600 mt-3">{confirmar.nombre}</p>
            <div className="mt-3 text-xs text-slate-500 space-y-1">
              <div>Deja de aparecerle a <strong className="text-slate-700">{confirmar.empleadosAlcanzados} persona{confirmar.empleadosAlcanzados === 1 ? "" : "s"}</strong> de {confirmar.alcance}.</div>
              <div>Libera <strong className="text-slate-700">{confirmar.pesoBase} puntos</strong> de peso en {fiscalYearLabel(confirmar.year)}.</div>
              <div className="text-emerald-700">El borrado es lógico: queda auditado y se puede restaurar.</div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmar(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={() => eliminar(confirmar)} disabled={borrando}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">
                {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
