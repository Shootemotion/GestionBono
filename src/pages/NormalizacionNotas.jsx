// src/pages/NormalizacionNotas.jsx
//
// Fijar, persona por persona, cuál es LA nota del año.
//
// Acordado con RRHH: la que el jefe evaluó, vio en su pantalla y le comunicó
// a la persona. Esta pantalla la muestra junto a lo que devuelve el recálculo
// de hoy, y deja confirmarla.
//
// Va de a una porque es el número que define un bono: confirmarla deja un
// responsable y una fecha por cada persona, que es justamente lo que faltó en
// todo lo que estuvimos reconstruyendo este año. Las que no tienen ninguna
// observación se pueden confirmar juntas: obligar a 68 clics idénticos no
// agrega control, cansa.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, AlertTriangle, Clock, Ban, Loader2, Search,
  ShieldCheck, Undo2, Scale, Info, ChevronDown, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";
import { getCurrentFiscalYear } from "@/lib/fiscalYear";

const fmt = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toFixed(1));

const ESTILO = {
  confirmada:       { Icono: ShieldCheck,    chip: "bg-emerald-100 text-emerald-700", fila: "" },
  pendiente:        { Icono: Clock,          chip: "bg-indigo-100 text-indigo-700",   fila: "" },
  sin_cierre_anual: { Icono: AlertTriangle,  chip: "bg-amber-100 text-amber-700",     fila: "bg-amber-50/40" },
  nota_invalida:    { Icono: Ban,            chip: "bg-rose-100 text-rose-700",       fila: "bg-rose-50/40" },
  sin_evaluar:      { Icono: Info,           chip: "bg-slate-200 text-slate-600",     fila: "" },
};

/**
 * Por qué esta persona tiene diferencia.
 *
 * Se pide al expandir y no con el listado: el análisis cruza fechas de
 * inserción, auditoría y evaluaciones, y hacerlo para las 80 de una
 * demoraría la pantalla por un dato que se mira de a uno.
 */
function PorQue({ empleadoId, periodo, year }) {
  const [estado, setEstado] = useState({ cargando: true, causas: null, veredicto: null });

  useEffect(() => {
    let vivo = true;
    api(`/divergencias?year=${year}&empleadoId=${empleadoId}`)
      .then((d) => {
        if (!vivo) return;
        const caso = (d.items || []).find((i) => i.periodo === periodo);
        setEstado({
          cargando: false,
          causas: caso?.causas || [],
          veredicto: caso?.veredicto || null,
        });
      })
      .catch(() => vivo && setEstado({ cargando: false, causas: [], veredicto: null }));
    return () => {
      vivo = false;
    };
  }, [empleadoId, periodo, year]);

  if (estado.cargando) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400 py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Buscando qué cambió…
      </div>
    );
  }

  if (!estado.causas?.length) {
    return (
      <p className="text-[11px] text-slate-500 py-2">
        No se encontró ningún cambio registrado que explique la diferencia.
      </p>
    );
  }

  return (
    <div className="py-2 space-y-2">
      {estado.veredicto && (
        <p className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg p-2">
          {estado.veredicto.texto}
        </p>
      )}
      {estado.causas.map((c, i) => (
        <div key={i} className="text-[11px] leading-snug">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-slate-700">· {c.titulo}</span>
            {c.efecto != null && (
              <span className={`shrink-0 font-mono ${c.efecto > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {c.efecto > 0 ? "+" : ""}
                {fmt(c.efecto)} pts
              </span>
            )}
          </div>
          <p className="text-slate-500 pl-3">{c.detalle}</p>
        </div>
      ))}
    </div>
  );
}

function Fila({ item, year, onConfirmar, onDeshacer, trabajando }) {
  const e = ESTILO[item.estado] || ESTILO.sin_evaluar;
  const { Icono } = e;
  const hayDif = Math.abs(item.diferencia ?? 0) > 1;
  const [abierto, setAbierto] = useState(false);

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/60 ${e.fila}`}>
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800 text-sm">{item.empleado}</div>
        {item.puesto && <div className="text-[11px] text-slate-400">{item.puesto}</div>}
      </td>

      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${e.chip}`}>
          <Icono className="w-3 h-3" />
          {item.estadoEtiqueta}
        </span>
      </td>

      {/* LA NOTA: la que el jefe comunicó. Es la columna que importa. */}
      <td className="px-3 py-2.5 text-center">
        {item.nota ? (
          <>
            <div className="text-lg font-black text-slate-800 leading-none">{fmt(item.nota.global)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {item.periodo} · obj {fmt(item.nota.obj)} · comp {fmt(item.nota.comp)}
            </div>
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {/* El recálculo, sólo como referencia. No es la nota. */}
      <td className="px-3 py-2.5 text-center">
        {item.recalculo ? (
          <>
            <div className={`text-sm font-mono ${hayDif ? "text-rose-600 font-bold" : "text-slate-400"}`}>
              {fmt(item.recalculo.global)}
            </div>
            {hayDif && (
              <div className="text-[10px] text-rose-500">
                {item.diferencia > 0 ? "+" : ""}
                {fmt(item.diferencia)}
              </div>
            )}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      <td className="px-3 py-2.5 max-w-[320px]">
        {item.motivo && <p className="text-[11px] text-slate-600 leading-snug">{item.motivo}</p>}
        {item.confirmadaEl && (
          <p className="text-[11px] text-emerald-600">
            Confirmada el {new Date(item.confirmadaEl).toLocaleDateString("es-AR")}
          </p>
        )}

        {/* Cuando hay diferencia, se puede ver qué la causó. Es lo que vuelve
            accionable la columna de al lado: sin esto, el número en rojo
            genera la duda sin responderla. */}
        {hayDif && (
          <>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              {abierto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              ¿Por qué difieren?
            </button>
            {abierto && (
              <PorQue empleadoId={item.empleadoId} periodo={item.periodo} year={year} />
            )}
          </>
        )}
      </td>

      <td className="px-3 py-2.5 text-right">
        {item.estado === "confirmada" ? (
          <button
            type="button"
            onClick={() => onDeshacer(item)}
            disabled={trabajando}
            className="text-[11px] text-slate-400 hover:text-rose-600 inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Undo2 className="w-3 h-3" /> Deshacer
          </button>
        ) : item.confirmable ? (
          // Dos botones y no uno: "Confirmar" a secas no decía QUÉ número
          // quedaba, y en las filas donde los dos difieren es justamente la
          // pregunta. Acá cada botón lleva el número que va a fijar.
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => onConfirmar(item, "comunicada")}
              disabled={trabajando}
              className="text-xs font-semibold bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap"
            >
              Dejar la comunicada ({fmt(item.nota?.global)})
            </button>
            {hayDif && (
              <button
                type="button"
                onClick={() => onConfirmar(item, "recalculo")}
                disabled={trabajando}
                className="text-[11px] text-slate-500 hover:text-rose-600 underline decoration-dotted disabled:opacity-40 whitespace-nowrap"
              >
                usar el recálculo ({fmt(item.recalculo?.global)})
              </button>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

export default function NormalizacionNotas() {
  const [year, setYear] = useState(getCurrentFiscalYear() - 1);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [soloEstado, setSoloEstado] = useState("");

  const cargar = async () => {
    setCargando(true);
    try {
      setDatos(await api(`/notas-oficiales?year=${year}`));
    } catch (err) {
      toast.error(`No se pudo cargar: ${err?.message || "error"}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async (item, usar = "comunicada") => {
    setTrabajando(true);
    try {
      await api(`/notas-oficiales/${item.feedbackId}/confirmar`, { method: "POST", body: { usar } });
      const fijada = usar === "recalculo" ? item.recalculo?.global : item.nota?.global;
      const cual = usar === "recalculo" ? "recálculo" : "nota comunicada";
      toast.success(`${item.empleado}: queda ${fmt(fijada)} (${cual})`);
      await cargar();
    } catch (err) {
      toast.error(err?.data?.message || err?.message || "No se pudo confirmar");
    } finally {
      setTrabajando(false);
    }
  };

  const deshacer = async (item) => {
    setTrabajando(true);
    try {
      await api(`/notas-oficiales/${item.feedbackId}/confirmar`, { method: "DELETE" });
      toast.success(`${item.empleado}: confirmación deshecha`);
      await cargar();
    } catch (err) {
      toast.error(err?.data?.message || err?.message || "No se pudo deshacer");
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarLimpias = async () => {
    setTrabajando(true);
    try {
      const r = await api(`/notas-oficiales/confirmar-sin-observaciones?year=${year}`, {
        method: "POST",
      });
      toast.success(`${r.confirmadas} nota(s) confirmadas`);
      await cargar();
    } catch (err) {
      toast.error(err?.data?.message || err?.message || "No se pudo confirmar");
    } finally {
      setTrabajando(false);
    }
  };

  const items = useMemo(() => {
    if (!datos?.items) return [];
    const q = filtro.trim().toLowerCase();
    return datos.items.filter(
      (i) => (!q || i.empleado.toLowerCase().includes(q)) && (!soloEstado || i.estado === soloEstado)
    );
  }, [datos, filtro, soloEstado]);

  const sinObservaciones = useMemo(
    () => (datos?.items || []).filter((i) => i.confirmable && Math.abs(i.diferencia ?? 0) <= 1).length,
    [datos]
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Scale className="w-6 h-6 text-indigo-600" /> Normalización de Notas
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Fija cuál es <strong>la nota</strong> de cada persona para el año: la que el jefe
              evaluó, vio en su pantalla y le comunicó. Una vez confirmada, es la que usan el bono,
              los PDF, los resultados y Mi Desempeño — sin recalcularse.
            </p>
          </div>
          <div className="flex items-center bg-white rounded-2xl px-3 py-2 border border-slate-200 shadow-sm">
            <SelectorAnioFiscal value={year} onChange={setYear} variant="stepper" size="md" showCaption />
          </div>
        </div>

        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 p-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Leyendo las notas…
          </div>
        ) : !datos ? null : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              {[
                { k: "confirmada", label: "Confirmadas" },
                { k: "pendiente", label: "Falta confirmar" },
                { k: "sin_cierre_anual", label: "Sin cierre anual" },
                { k: "nota_invalida", label: "Fuera de escala" },
                { k: "sin_evaluar", label: "Sin evaluar" },
              ].map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSoloEstado(soloEstado === k ? "" : k)}
                  className={`rounded-xl border p-3 text-center transition ${
                    soloEstado === k
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    {label}
                  </div>
                  <div className="text-2xl font-black text-slate-700">{datos.resumen?.[k] || 0}</div>
                </button>
              ))}
            </div>

            {sinObservaciones > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-indigo-200 rounded-xl p-3 mb-4">
                <div className="flex items-start gap-2 text-xs text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>{sinObservaciones}</strong> persona(s) tienen cierre anual, la nota en
                    escala y sin diferencia contra el recálculo. No hay nada que mirar de a una.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={confirmarLimpias}
                  disabled={trabajando}
                  className="text-xs font-semibold bg-indigo-600 text-white rounded-lg px-3 py-2 hover:bg-indigo-700 disabled:opacity-40 shrink-0"
                >
                  {trabajando ? "Confirmando…" : `Confirmar las ${sinObservaciones} sin observaciones`}
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Buscar persona…"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              {soloEstado && (
                <button
                  type="button"
                  onClick={() => setSoloEstado("")}
                  className="text-[11px] text-indigo-600 hover:underline"
                >
                  quitar filtro
                </button>
              )}
              <span className="text-[11px] text-slate-400">{items.length} persona(s)</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-3 py-2 font-bold">Persona</th>
                    <th className="text-left px-3 py-2 font-bold">Estado</th>
                    <th className="text-center px-3 py-2 font-bold text-indigo-500">
                      La nota
                      <div className="font-normal normal-case text-[9px] text-slate-400">
                        la que se comunicó
                      </div>
                    </th>
                    <th className="text-center px-3 py-2 font-bold">
                      Recálculo hoy
                      <div className="font-normal normal-case text-[9px] text-slate-400">
                        sólo referencia
                      </div>
                    </th>
                    <th className="text-left px-3 py-2 font-bold">Observación</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-sm text-slate-400 py-10">
                        Ninguna persona con ese filtro.
                      </td>
                    </tr>
                  ) : (
                    items.map((i) => (
                      <Fila
                        key={i.empleadoId}
                        item={i}
                        year={year}
                        onConfirmar={confirmar}
                        onDeshacer={deshacer}
                        trabajando={trabajando}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
