import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  GitCompare, Upload, Loader2, FileArchive, Plus, Minus, Pencil, ChevronRight,
  ChevronDown, Info, Search, CalendarOff, X,
} from "lucide-react";
import { api, getToken } from "@/lib/api";
import RestaurarPorEmpleado from "./RestaurarPorEmpleado";
import Depuracion from "./Depuracion";

/**
 * Comparar contra un backup.
 *
 * Subís el .zip de un backup conocido y la página muestra, colección por
 * colección, qué se creó, qué se borró y qué cambió campo por campo desde
 * entonces — al estilo de un diff.
 *
 * Nació de un incidente concreto: aparecieron objetivos duplicados y pesos
 * alterados en un año fiscal ya cerrado, y reconstruir qué había pasado llevó
 * horas de scripts sueltos. La auditoría dice quién tocó qué, pero no registra
 * el id de lo que se crea, y las bajas de overrides no dejaban rastro.
 *
 * El zip se lee en memoria y se descarta: nunca se importa ni se restaura nada.
 */

const COLOR = {
  creados: { borde: "border-emerald-200", fondo: "bg-emerald-50", texto: "text-emerald-700", icono: Plus },
  borrados: { borde: "border-rose-200", fondo: "bg-rose-50", texto: "text-rose-700", icono: Minus },
  modificados: { borde: "border-amber-200", fondo: "bg-amber-50", texto: "text-amber-700", icono: Pencil },
};

const fecha = (d) => (d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const valor = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 1);
  return String(v);
};

/** Una fila de cambio, con el antes y el después enfrentados. */
function Cambio({ c }) {
  return (
    <div className="grid grid-cols-[130px_1fr_1fr] gap-2 text-[11px] py-1 border-t border-slate-100 first:border-0">
      <div className="font-semibold text-slate-500 truncate" title={c.campo}>{c.campo}</div>
      <div className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-800 break-all whitespace-pre-wrap max-h-24 overflow-auto">
        {valor(c.antes)}
      </div>
      <div className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 break-all whitespace-pre-wrap max-h-24 overflow-auto">
        {valor(c.ahora)}
      </div>
    </div>
  );
}

function Item({ item, tipo }) {
  const [abierto, setAbierto] = useState(false);
  const cfg = COLOR[tipo];
  const Icono = cfg.icono;
  const tieneDetalle = tipo === "modificados" ? item.cambios?.length : !!item.doc;

  return (
    <div className={`rounded-lg border ${cfg.borde} ${cfg.fondo} overflow-hidden`}>
      <div className="flex items-start gap-2 px-2.5 py-1.5">
        <Icono className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.texto}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-800 break-words">{item.titulo}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
            <span className="font-mono">{item._id}</span>
            {item.insertadoEl && <span>insertado {fecha(item.insertadoEl)}</span>}
            {item.fechaFalseada && (
              <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                <CalendarOff className="w-3 h-3" /> fecha de creación falseada
              </span>
            )}
          </div>
          {item.resumen?.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {item.resumen.map((r, i) => (
                <li key={i} className="text-[11px] text-slate-600 font-mono break-all">{r}</li>
              ))}
            </ul>
          )}
        </div>
        {tieneDetalle && (
          <button onClick={() => setAbierto((v) => !v)}
            className="shrink-0 text-[10px] font-semibold text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-white/60">
            {abierto ? "ocultar" : "ver"}
          </button>
        )}
      </div>

      {abierto && tipo === "modificados" && (
        <div className="bg-white/70 px-2.5 py-1.5 border-t border-slate-200">
          <div className="grid grid-cols-[130px_1fr_1fr] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1">
            <div>Campo</div><div>En el backup</div><div>Ahora</div>
          </div>
          {item.cambios.map((c, i) => <Cambio key={i} c={c} />)}
        </div>
      )}
      {abierto && tipo !== "modificados" && (
        <pre className="bg-white/70 px-2.5 py-2 border-t border-slate-200 text-[10px] text-slate-600 overflow-auto max-h-72">
          {JSON.stringify(item.doc, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Grupo({ titulo, tipo, items, filtro }) {
  const [abierto, setAbierto] = useState(true);
  const visibles = useMemo(() => {
    if (!filtro) return items;
    const q = filtro.toLowerCase();
    return items.filter((i) =>
      String(i.titulo).toLowerCase().includes(q) ||
      String(i._id).includes(q) ||
      (i.resumen || []).join(" ").toLowerCase().includes(q));
  }, [items, filtro]);

  if (!items.length) return null;
  const cfg = COLOR[tipo];

  return (
    <div>
      <button onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 py-1.5 text-left">
        {abierto ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className={`text-xs font-bold ${cfg.texto}`}>{titulo}</span>
        <span className="text-[11px] text-slate-400">
          {filtro && visibles.length !== items.length ? `${visibles.length} de ${items.length}` : items.length}
        </span>
      </button>
      {abierto && (
        <div className="space-y-1.5 pl-6">
          {visibles.length === 0
            ? <div className="text-[11px] text-slate-400 italic py-1">Nada coincide con el filtro.</div>
            : visibles.map((i) => <Item key={i._id} item={i} tipo={tipo} />)}
        </div>
      )}
    </div>
  );
}

export default function CompararBackup() {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [data, setData] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [colecciones, setColecciones] = useState([]);
  const [elegidas, setElegidas] = useState(new Set());
  const [arrastrando, setArrastrando] = useState(false);
  // "diff" = el detalle técnico por colección; "empleados" = la vista para
  // revisar persona por persona y restaurar. Se arranca en empleados porque es
  // la que se usa para ordenar el desastre.
  const [vista, setVista] = useState("depurar");
  const inputRef = useRef(null);

  useEffect(() => {
    api("/comparador/colecciones")
      .then((c) => {
        setColecciones(c);
        setElegidas(new Set(c.map((x) => x.id)));
      })
      .catch(() => { /* el selector es opcional: sin él se comparan todas */ });
  }, []);

  const comparar = useCallback(async (file) => {
    if (!file) return;
    setCargando(true);
    setData(null);
    try {
      const fd = new FormData();
      fd.append("backup", file);
      const qs = elegidas.size && elegidas.size !== colecciones.length
        ? `?colecciones=${[...elegidas].join(",")}`
        : "";
      // fetch directo: api() serializa JSON y acá va multipart.
      const token = getToken();
      const base = import.meta.env.VITE_API_URL || "http://localhost:5007/api";
      const res = await fetch(`${base}/comparador/backup${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || `Error ${res.status}`);
      setData(json);
      const total = json.colecciones.reduce(
        (a, c) => a + c.creados.length + c.borrados.length + c.modificados.length, 0);
      toast.success(total ? `${total} diferencias encontradas` : "Sin diferencias");
    } catch (e) {
      toast.error(e?.message || "No se pudo comparar");
    } finally {
      setCargando(false);
    }
  }, [elegidas, colecciones.length]);

  const elegir = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Tiene que ser el .zip del backup");
      return;
    }
    setArchivo(file);
    comparar(file);
  };

  const totales = useMemo(() => {
    if (!data) return null;
    return data.colecciones.reduce((a, c) => ({
      creados: a.creados + c.creados.length,
      borrados: a.borrados + c.borrados.length,
      modificados: a.modificados + c.modificados.length,
    }), { creados: 0, borrados: 0, modificados: 0 });
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-500" /> Comparar contra un backup
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Subí el .zip de un backup y mirá qué cambió desde entonces: qué se creó, qué se borró y qué se
          modificó campo por campo. El archivo se lee en memoria y se descarta — no se importa ni se
          restaura nada.
        </p>
      </div>

      {/* Selector de colecciones */}
      {colecciones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colecciones.map((c) => {
            const on = elegidas.has(c.id);
            return (
              <button key={c.id}
                onClick={() => setElegidas((s) => {
                  const n = new Set(s);
                  n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                  return n;
                })}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${on
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}>
                {c.etiqueta}
              </button>
            );
          })}
        </div>
      )}

      {/* Zona de carga */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${arrastrando
          ? "border-indigo-400 bg-indigo-50"
          : "border-slate-300 bg-white hover:bg-slate-50"}`}
      >
        <input ref={inputRef} type="file" accept=".zip" className="hidden"
          onChange={(e) => elegir(e.target.files?.[0])} />
        {cargando ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> comparando {archivo?.name}…
          </div>
        ) : archivo ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <FileArchive className="w-4 h-4 text-indigo-500" />
            <strong>{archivo.name}</strong>
            <span className="text-slate-400">({(archivo.size / 1024).toFixed(0)} KB)</span>
            <button onClick={(e) => { e.stopPropagation(); setArchivo(null); setData(null); }}
              className="ml-2 text-slate-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            Arrastrá el <strong>.zip</strong> del backup acá, o hacé click para elegirlo
            <div className="text-[11px] text-slate-400 mt-1">Por ejemplo: backup_2026-09-22T06-00-00.zip</div>
          </div>
        )}
      </div>

      {/* Vistas */}
      {archivo && (
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {[
            { id: "depurar", texto: "Depurar duplicados" },
            { id: "empleados", texto: "Por empleado" },
            { id: "diff", texto: "Diferencias técnicas" },
          ].map((v) => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${vista === v.id
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"}`}>
              {v.texto}
            </button>
          ))}
        </div>
      )}

      {archivo && vista === "depurar" && <Depuracion archivo={archivo} />}
      {archivo && vista === "empleados" && <RestaurarPorEmpleado archivo={archivo} />}

      {/* Resultado */}
      {data && vista === "diff" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                <Plus className="w-3.5 h-3.5" /> {totales.creados} creados
              </span>
              <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                <Minus className="w-3.5 h-3.5" /> {totales.borrados} borrados
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                <Pencil className="w-3.5 h-3.5" /> {totales.modificados} modificados
              </span>
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
                placeholder="Filtrar por nombre, id o campo…"
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] bg-slate-100 border border-slate-200 text-slate-600 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              "Insertado" sale del ObjectId de Mongo, que lleva la hora real y el cliente no puede
              falsear. Cuando no coincide con el <code>createdAt</code> del documento, se marca
              <strong> fecha de creación falseada</strong>: es la firma de un clon que copió los datos del original.
            </span>
          </div>

          <div className="space-y-4">
            {data.colecciones.map((c) => {
              const total = c.creados.length + c.borrados.length + c.modificados.length;
              return (
                <div key={c.coleccion} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <h4 className="text-sm font-black text-slate-800">{c.etiqueta}</h4>
                    <div className="text-[11px] text-slate-400">
                      backup {c.totalBackup} → ahora {c.totalActual}
                      {total === 0 && <span className="text-emerald-600 font-semibold ml-2">sin cambios</span>}
                    </div>
                  </div>
                  {c.error && <div className="text-xs text-rose-600">{c.error}</div>}
                  {total > 0 && (
                    <div className="space-y-2">
                      <Grupo titulo="Creados desde el backup" tipo="creados" items={c.creados} filtro={filtro} />
                      <Grupo titulo="Borrados desde el backup" tipo="borrados" items={c.borrados} filtro={filtro} />
                      <Grupo titulo="Modificados" tipo="modificados" items={c.modificados} filtro={filtro} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
