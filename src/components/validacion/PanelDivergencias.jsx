// src/components/validacion/PanelDivergencias.jsx
//
// Por qué la nota guardada no es la que da el motor hoy.
//
// Igual que el panel de avisos del formulario, esta pantalla no razona: el
// análisis entero —qué cambió, cuándo, quién, y si eso alcanza para reproducir
// la nota comunicada— lo hace el backend, que es el único que tiene las fechas
// reales de inserción y la auditoría. Acá se muestra.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2,
  Search, HelpCircle, FileClock, Scale,
} from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toFixed(1));

/* Cómo se presenta cada veredicto. El nivel lo decide el backend. */
const VEREDICTO = {
  explicada: {
    etiqueta: "Explicada",
    clase: "bg-emerald-50 border-emerald-200 text-emerald-800",
    chip: "bg-emerald-100 text-emerald-700",
    Icono: CheckCircle2,
  },
  parcial: {
    etiqueta: "Parcial",
    clase: "bg-amber-50 border-amber-200 text-amber-800",
    chip: "bg-amber-100 text-amber-700",
    Icono: AlertTriangle,
  },
  sin_rastro: {
    etiqueta: "Sin registro previo",
    clase: "bg-slate-50 border-slate-200 text-slate-700",
    chip: "bg-slate-200 text-slate-600",
    Icono: FileClock,
  },
  sin_explicacion: {
    etiqueta: "Sin explicación",
    clase: "bg-rose-50 border-rose-200 text-rose-800",
    chip: "bg-rose-100 text-rose-700",
    Icono: HelpCircle,
  },
  coincide: {
    etiqueta: "Coincide",
    clase: "bg-emerald-50 border-emerald-200 text-emerald-800",
    chip: "bg-emerald-100 text-emerald-700",
    Icono: CheckCircle2,
  },
  sin_datos: {
    etiqueta: "Sin datos",
    clase: "bg-slate-50 border-slate-200 text-slate-600",
    chip: "bg-slate-200 text-slate-600",
    Icono: HelpCircle,
  },
};

/* La evidencia viene con forma distinta según la causa; se muestra como viene. */
function Evidencia({ datos }) {
  if (!datos) return null;

  if (Array.isArray(datos)) {
    return (
      <ul className="mt-1.5 space-y-0.5">
        {datos.map((d, i) => (
          <li key={i} className="text-[11px] text-slate-500 font-mono leading-relaxed">
            ·{" "}
            {d.nombre && <span className="text-slate-700">{d.nombre}</span>}
            {d.veces && <span> — aparece {d.veces} veces</span>}
            {d.copias && (
              <span>
                {" "}
                ({d.copias.map((c) => `peso ${c.peso ?? "—"} / ${fmt(c.progreso)}%`).join(" · ")})
              </span>
            )}
            {d.peso != null && !d.copias && <span> — peso {d.peso}</span>}
            {d.creadoEl && <span className="text-slate-400"> creado {d.creadoEl}</span>}
            {d.periodo && <span className="text-slate-700">{d.periodo}</span>}
            {d.tipo && <span> {d.tipo}</span>}
            {d.cuando && <span className="text-slate-400"> {d.cuando}</span>}
            {d.accion && <span> {d.accion}</span>}
            {d.quien && <span className="text-slate-400"> por {d.quien}</span>}
            {d.meta && <span className="text-slate-600"> · {d.meta}</span>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-1 text-[11px] text-slate-500 font-mono">
      {Object.entries(datos).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}
    </div>
  );
}

function Caso({ item, abierto, onToggle }) {
  const v = VEREDICTO[item.veredicto.nivel] || VEREDICTO.sin_datos;
  const { Icono } = v;
  const delta = item.divergencia;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
      >
        {abierto ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 text-sm truncate">{item.empleado}</div>
          <div className="text-[11px] text-slate-400">
            {item.periodo} · {item.estado}
            {item.cerradoEl && ` · cerrado ${item.cerradoEl.slice(0, 10)}`}
          </div>
        </div>

        <div className="text-right shrink-0 font-mono text-xs">
          <div className="text-slate-500">
            comunicada <strong className="text-slate-800">{fmt(item.guardado.global)}</strong>
          </div>
          <div className="text-slate-500">
            motor hoy <strong className="text-indigo-700">{fmt(item.actual.global)}</strong>
          </div>
        </div>

        <div
          className={`shrink-0 w-16 text-center font-black text-sm ${
            delta > 0 ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {fmt(delta)}
        </div>

        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${v.chip}`}>
          {v.etiqueta}
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${v.clase}`}>
            <Icono className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{item.veredicto.texto}</span>
          </div>

          {/* Desglose obj/comp: dice de qué lado está la diferencia antes de
              entrar en el detalle. */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "obj", label: "Objetivos", tope: 70 },
              { k: "comp", label: "Competencias", tope: 30 },
              { k: "global", label: "Global", tope: 100 },
            ].map(({ k, label, tope }) => {
              const g = item.guardado[k];
              const a = item.actual[k];
              const cambia = g != null && a != null && Math.abs(a - g) > 0.5;
              return (
                <div
                  key={k}
                  className={`rounded-lg border p-2 ${cambia ? "border-rose-200 bg-rose-50/50" : "border-slate-100 bg-slate-50"}`}
                >
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    {label} <span className="font-normal">/{tope}</span>
                  </div>
                  <div className="text-sm font-mono">
                    <span className="text-slate-700">{fmt(g)}</span>
                    <span className="text-slate-300 mx-1">→</span>
                    <span className={cambia ? "text-rose-700 font-bold" : "text-slate-700"}>{fmt(a)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {item.causas.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Qué cambió
              </div>
              {item.causas.map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-800 text-xs">{c.titulo}</div>
                    {c.efecto != null && (
                      <span
                        className={`shrink-0 text-[11px] font-mono font-bold ${
                          c.efecto > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {c.efecto > 0 ? "+" : ""}
                        {fmt(c.efecto)} pts
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">{c.detalle}</p>
                  <Evidencia datos={c.evidencia} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PanelDivergencias({ year }) {
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState({});
  const [filtro, setFiltro] = useState("");
  const [soloNivel, setSoloNivel] = useState("");
  // Los desvinculados quedan afuera salvo que se pidan: su ciclo terminó y
  // sus divergencias ya no se van a corregir.
  const [incluirDesvinculados, setIncluirDesvinculados] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setDatos(null);
    api(`/divergencias?year=${year}${incluirDesvinculados ? "&incluirDesvinculados=true" : ""}`)
      .then((d) => vivo && setDatos(d))
      .catch((e) => {
        if (vivo) toast.error(`No se pudo analizar: ${e?.message || "error"}`);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [year, incluirDesvinculados]);

  const items = useMemo(() => {
    if (!datos?.items) return [];
    const q = filtro.trim().toLowerCase();
    return datos.items.filter(
      (i) =>
        (!q || i.empleado.toLowerCase().includes(q)) &&
        (!soloNivel || i.veredicto.nivel === soloNivel)
    );
  }, [datos, filtro, soloNivel]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 p-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Comparando notas guardadas contra el motor…
      </div>
    );
  }

  if (!datos) return null;

  const niveles = Object.entries(datos.porVeredicto || {});

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start gap-2 mb-3">
          <Scale className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-slate-800">
              Notas comunicadas vs. motor de hoy
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
              La nota que vale es la que se comunicó. Esto no la cambia: muestra qué pasó entre el
              cierre y hoy para que la diferencia no sea un misterio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Revisados</div>
            <div className="text-xl font-black text-slate-700">{datos.revisados}</div>
          </div>
          <div className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-rose-400 font-bold">Divergen</div>
            <div className="text-xl font-black text-rose-700">{datos.divergentes}</div>
          </div>
          {niveles.slice(0, 2).map(([nivel, n]) => (
            <div key={nivel} className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                {(VEREDICTO[nivel] || {}).etiqueta || nivel}
              </div>
              <div className="text-xl font-black text-slate-700">{n}</div>
            </div>
          ))}
        </div>

        {/* El límite del análisis, dicho de frente: para los feedbacks cerrados
            antes de que existiera el registro de cambios no hay forma de
            reconstruir el día. */}
        {datos.auditoriaDesde && (
          <div className="flex items-start gap-2 text-[11px] bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-2.5 mb-3">
            <FileClock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              El registro de cambios existe desde el{" "}
              <strong>{new Date(datos.auditoriaDesde).toLocaleDateString("es-AR")}</strong>. Para los
              feedbacks cerrados antes se puede ver qué difiere hoy, pero no reconstruir cómo estaba
              configurado ese día: lo que se tocó antes de esa fecha no lo guardó nadie.
            </span>
          </div>
        )}

        {datos.resumen?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {datos.resumen.map((c) => (
              <span
                key={c.codigo}
                className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-1"
                title={c.codigo}
              >
                {c.titulo?.replace(/^\d+\s*/, "") || c.codigo} · <strong>{c.cantidad}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar persona…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={soloNivel}
          onChange={(e) => setSoloNivel(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="">Todos los veredictos</option>
          {niveles.map(([nivel, n]) => (
            <option key={nivel} value={nivel}>
              {(VEREDICTO[nivel] || {}).etiqueta || nivel} ({n})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            className="accent-indigo-500 w-3.5 h-3.5"
            checked={incluirDesvinculados}
            onChange={(e) => setIncluirDesvinculados(e.target.checked)}
          />
          incluir desvinculados
        </label>
        <span className="text-[11px] text-slate-400">{items.length} caso(s)</span>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">
            {datos.divergentes === 0
              ? "No hay divergencias: todas las notas comunicadas coinciden con el motor."
              : "Ningún caso con ese filtro."}
          </div>
        ) : (
          items.map((i) => (
            <Caso
              key={i.feedbackId}
              item={i}
              abierto={!!abierto[i.feedbackId]}
              onToggle={() => setAbierto((a) => ({ ...a, [i.feedbackId]: !a[i.feedbackId] }))}
            />
          ))
        )}
      </div>
    </div>
  );
}
