// src/pages/Sistemas/RegistroCambios.jsx
//
// Panel de auditoría: quién cambió qué y cuándo, con el estado previo del
// documento para poder ver exactamente qué se modificó.
//
// Sobre el "tiempo real": el proyecto no tiene websockets ni SSE, y estos
// eventos son pocos (~70 por día). Un sondeo cada 10 segundos alcanza de
// sobra, no necesita infraestructura nueva y no se rompe detrás de un proxy.
// Solo sondea con la pestaña visible, para no golpear al servidor de fondo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  RefreshCw, Search, Filter, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, RotateCcw, GitBranch, CheckCircle2, Radio,
} from "lucide-react";

const ACCIONES = {
  CREAR: { label: "Creó", icon: Plus, clase: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  EDITAR: { label: "Editó", icon: Pencil, clase: "bg-blue-50 text-blue-700 ring-blue-200" },
  ELIMINAR: { label: "Eliminó", icon: Trash2, clase: "bg-rose-50 text-rose-700 ring-rose-200" },
  RESTAURAR: { label: "Restauró", icon: RotateCcw, clase: "bg-amber-50 text-amber-700 ring-amber-200" },
  VERSIONAR: { label: "Versionó", icon: GitBranch, clase: "bg-violet-50 text-violet-700 ring-violet-200" },
  APROBAR: { label: "Aprobó", icon: CheckCircle2, clase: "bg-teal-50 text-teal-700 ring-teal-200" },
};

const ENTIDADES = ["plantilla", "empleado", "usuario", "rol", "area", "sector", "override", "evaluacion", "feedback"];

const fechaLarga = (iso) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

function haceCuanto(iso) {
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "recién";
  if (seg < 3600) return "hace " + Math.floor(seg / 60) + " min";
  if (seg < 86400) return "hace " + Math.floor(seg / 3600) + " h";
  return "hace " + Math.floor(seg / 86400) + " d";
}

function Fila({ reg, nuevo }) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const cfg = ACCIONES[reg.accion] || {
    label: reg.accion, icon: Pencil, clase: "bg-slate-50 text-slate-600 ring-slate-200",
  };
  const Icono = cfg.icon;

  const abrir = async () => {
    const v = !abierto;
    setAbierto(v);
    if (v && !detalle) {
      setCargando(true);
      try {
        setDetalle(await api("/auditoria/" + reg._id));
      } catch {
        setDetalle({ error: true });
      } finally {
        setCargando(false);
      }
    }
  };

  return (
    <>
      <tr className={"border-b border-slate-100 hover:bg-slate-50/70 " + (nuevo ? "bg-blue-50/40" : "")}>
        <td className="py-2.5 pl-3 pr-2 align-top">
          <button onClick={abrir} className="text-slate-400 hover:text-slate-700" aria-label="Ver detalle">
            {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="py-2.5 pr-3 align-top whitespace-nowrap">
          <div className="text-xs text-slate-700">{fechaLarga(reg.createdAt)}</div>
          <div className="text-[10px] text-slate-400">{haceCuanto(reg.createdAt)}</div>
        </td>
        <td className="py-2.5 pr-3 align-top">
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + cfg.clase}>
            <Icono className="w-3 h-3" /> {cfg.label}
          </span>
        </td>
        <td className="py-2.5 pr-3 align-top">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{reg.entidad}</span>
        </td>
        <td className="py-2.5 pr-3 align-top text-xs text-slate-700 max-w-md">
          <span className="line-clamp-2">
            {reg.resumen || <span className="text-slate-400 italic">sin descripción</span>}
          </span>
        </td>
        <td className="py-2.5 pr-3 align-top">
          <div className="text-xs font-medium text-slate-700">{reg.empleadoNombre || reg.email}</div>
          <div className="text-[10px] text-slate-400">{reg.rol}</div>
        </td>
      </tr>

      {abierto && (
        <tr className="bg-slate-50/80">
          <td />
          <td colSpan={5} className="px-3 pb-4 pt-1">
            {cargando && <div className="text-xs text-slate-400">Cargando el detalle…</div>}
            {detalle?.error && <div className="text-xs text-rose-600">No se pudo cargar el detalle.</div>}
            {detalle && !detalle.error && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
                  <span><b className="text-slate-600">Ruta:</b> {detalle.metodo} {detalle.ruta}</span>
                  <span><b className="text-slate-600">IP:</b> {detalle.ip || "—"}</span>
                  <span><b className="text-slate-600">Respuesta:</b> {detalle.statusCode}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Estado antes del cambio
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-slate-200">
                      {detalle.antes
                        ? JSON.stringify(detalle.antes, null, 2)
                        : "— (creación: no había documento previo)"}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Lo que se envió
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-800 p-3 text-[10px] leading-relaxed text-slate-200">
                      {detalle.cambios ? JSON.stringify(detalle.cambios, null, 2) : "— (eliminación)"}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function RegistroCambios() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enVivo, setEnVivo] = useState(true);
  const [nuevos, setNuevos] = useState(0);
  const [filtros, setFiltros] = useState({ entidad: "", accion: "", q: "" });
  const idsNuevos = useRef(new Set());

  const cargar = useCallback(async (opts = {}) => {
    const qs = new URLSearchParams({ limit: "100" });
    if (filtros.entidad) qs.set("entidad", filtros.entidad);
    if (filtros.accion) qs.set("accion", filtros.accion);
    if (filtros.q) qs.set("q", filtros.q);
    if (!opts.silencioso) setCargando(true);
    try {
      const [lista, res] = await Promise.all([
        api("/auditoria?" + qs.toString()),
        api("/auditoria/resumen"),
      ]);
      setItems((prev) => {
        if (opts.silencioso && prev.length) {
          const conocidos = new Set(prev.map((x) => x._id));
          const recien = (lista.items || []).filter((x) => !conocidos.has(x._id));
          if (recien.length) {
            idsNuevos.current = new Set(recien.map((x) => x._id));
            setNuevos((n) => n + recien.length);
          }
        }
        return lista.items || [];
      });
      setTotal(lista.total || 0);
      setResumen(res);
    } catch {
      /* si falla, la vista se queda con lo último que tenía */
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  // Sondeo cada 10 s mientras "En vivo" esté activo y la pestaña esté visible.
  useEffect(() => {
    if (!enVivo) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") cargar({ silencioso: true });
    }, 10000);
    return () => clearInterval(t);
  }, [enVivo, cargar]);

  const conteoAcciones = useMemo(
    () => Object.fromEntries((resumen?.porAccion || []).map((x) => [x._id, x.n])),
    [resumen]
  );

  const marcarVistos = () => { setNuevos(0); idsNuevos.current = new Set(); };

  return (
    <div className="space-y-5">
      {/* Encabezado con números */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Cambios registrados", resumen?.total ?? "—"],
          ["Últimas 24 horas", resumen?.ultimas24h ?? "—"],
          ["Últimos 7 días", resumen?.ultimos7d ?? "—"],
          ["Eliminaciones", conteoAcciones.ELIMINAR ?? 0],
        ].map(([label, valor]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{valor}</div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar por descripción, persona o ruta…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filtros.entidad}
            onChange={(e) => setFiltros((f) => ({ ...f, entidad: e.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todo</option>
            {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={filtros.accion}
            onChange={(e) => setFiltros((f) => ({ ...f, accion: e.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Toda acción</option>
            {Object.keys(ACCIONES).map((a) => <option key={a} value={a}>{ACCIONES[a].label}</option>)}
          </select>
        </div>

        <button
          onClick={() => setEnVivo((v) => !v)}
          title="Se actualiza solo, cada 10 segundos"
          className={
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors " +
            (enVivo ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500")
          }
        >
          <Radio className={"h-4 w-4 " + (enVivo ? "animate-pulse" : "")} />
          {enVivo ? "En vivo" : "Pausado"}
        </button>

        <button
          onClick={() => { marcarVistos(); cargar(); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <RefreshCw className={"h-4 w-4 " + (cargando ? "animate-spin" : "")} />
          Actualizar
        </button>
      </div>

      {nuevos > 0 && (
        <button
          onClick={marcarVistos}
          className="w-full rounded-xl bg-blue-50 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
        >
          {nuevos} {nuevos === 1 ? "cambio nuevo" : "cambios nuevos"} — tocá para marcarlos como vistos
        </button>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando && items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Cargando el registro…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm font-semibold text-slate-600">Todavía no hay cambios registrados</div>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
              El registro se llena solo, a medida que se crean, editan o eliminan plantillas,
              empleados, usuarios y demás. Lo que pasó antes de poner en marcha la auditoría no
              figura acá.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="w-8" />
                  <th className="py-2.5 pr-3 font-semibold">Cuándo</th>
                  <th className="py-2.5 pr-3 font-semibold">Acción</th>
                  <th className="py-2.5 pr-3 font-semibold">Sobre</th>
                  <th className="py-2.5 pr-3 font-semibold">Qué</th>
                  <th className="py-2.5 pr-3 font-semibold">Quién</th>
                </tr>
              </thead>
              <tbody>
                {items.map((reg) => (
                  <Fila key={reg._id} reg={reg} nuevo={idsNuevos.current.has(reg._id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Mostrando {items.length} de {total} registros. La colección <code>auditorias</code> entra
        en el backup diario junto con el resto de la base.
      </p>
    </div>
  );
}
