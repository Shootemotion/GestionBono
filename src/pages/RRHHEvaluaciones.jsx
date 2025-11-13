// src/pages/RRHHEvaluaciones.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const groupOptions = [
  { k: "jefe", lbl: "Por Jefe" },
  { k: "area", lbl: "Por Área" },
  { k: "sector", lbl: "Por Sector" },
  { k: "ninguno", lbl: "Sin agrupar" },
];

export default function RRHHEvaluaciones() {
  const [periodo, setPeriodo] = useState("");
  const [plantillaId, setPlantillaId] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [pending, setPending] = useState([]); // evaluaciones en PENDING_HR
  const [checked, setChecked] = useState(new Set());
  const [groupBy, setGroupBy] = useState("jefe");
  const [loading, setLoading] = useState(false);

  // cargar plantillas para filtrar
  useEffect(() => {
    (async () => {
      try {
        const pls = await api("/plantillas?limit=1000");
        const arr = Array.isArray(pls?.items) ? pls.items : (Array.isArray(pls) ? pls : []);
        setPlantillas(arr);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (periodo) qs.set("periodo", periodo);
      if (plantillaId) qs.set("plantillaId", plantillaId);
      const res = await api(`/evaluaciones/hr/pending?${qs.toString()}`);
      const items = Array.isArray(res) ? res : (res?.items || []);
      setPending(items);
      setChecked(new Set());
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar las evaluaciones pendientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPending(); /* eslint-disable-next-line */ }, [periodo, plantillaId]);

  const allIds = useMemo(() => pending.map(p => String(p._id)), [pending]);
  const toggleOne = (id) => {
    setChecked(prev => {
      const nx = new Set(prev);
      nx.has(id) ? nx.delete(id) : nx.add(id);
      return nx;
    });
  };
  const toggleAll = () => {
    setChecked(prev => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  };

  const grouped = useMemo(() => {
    if (groupBy === "ninguno") return { "": pending };
    const map = {};
    for (const ev of pending) {
      let key = "";
      if (groupBy === "jefe") key = ev.manager?.apellido ? `${ev.manager.apellido}, ${ev.manager.nombre || ""}` : (ev.manager?.email || "— Sin jefe");
      if (groupBy === "area") key = ev.empleado?.area?.nombre || "— Sin área";
      if (groupBy === "sector") key = ev.empleado?.sector?.nombre || "— Sin sector";
      map[key] = map[key] || [];
      map[key].push(ev);
    }
    return map;
  }, [pending, groupBy]);

  const closeSelected = async () => {
    if (checked.size === 0) return toast.warn("Seleccioná al menos una evaluación.");
    try {
      await api("/evaluaciones/hr/close-bulk", { method: "POST", body: { ids: Array.from(checked) } });
      toast.success("Cerradas.");
      await loadPending();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar la selección.");
    }
  };

  const closeAll = async () => {
    if (!confirm("¿Cerrar TODAS las evaluaciones filtradas (estado PENDING_HR)?")) return;
    try {
      await api("/evaluaciones/hr/close-bulk", { method: "POST", body: { filtro: { periodo: periodo || undefined, plantillaId: plantillaId || undefined } } });
      toast.success("Cerradas todas las filtradas.");
      await loadPending();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar en lote.");
    }
  };

  const conformes = pending.filter(p => p.empleadoAck?.estado === "ACK").length;
  const disconformes = pending.filter(p => p.empleadoAck?.estado === "CONTEST").length;

  return (
    <div className="container-app space-y-6">
      {/* Header y filtros */}
      <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs text-muted-foreground">Periodo</div>
            <input
              placeholder="Ej: 2025Q2 / 2025M06"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.trim())}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Plantilla</div>
            <select
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm min-w-[220px]"
            >
              <option value="">Todas</option>
              {plantillas.map(p => (
                <option key={p._id} value={p._id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Agrupar</div>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {groupOptions.map(o => <option key={o.k} value={o.k}>{o.lbl}</option>)}
            </select>
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={loadPending} disabled={loading}>Refrescar</Button>
            <Button variant="outline" onClick={closeSelected} disabled={loading || checked.size === 0}>Cerrar seleccionados</Button>
            <Button onClick={closeAll} disabled={loading || pending.length === 0} className="bg-indigo-600 hover:bg-indigo-700">Cerrar todos (filtrados)</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg ring-1 ring-border/60 p-3 bg-white/70">
            <div className="text-[11px] text-muted-foreground">Pendientes en RRHH</div>
            <div className="text-2xl font-bold">{pending.length}</div>
          </div>
          <div className="rounded-lg ring-1 ring-border/60 p-3 bg-white/70">
            <div className="text-[11px] text-muted-foreground">Conformes (ACK)</div>
            <div className="text-2xl font-bold text-emerald-600">{conformes}</div>
          </div>
          <div className="rounded-lg ring-1 ring-border/60 p-3 bg-white/70">
            <div className="text-[11px] text-muted-foreground">En desacuerdo (CONTEST)</div>
            <div className="text-2xl font-bold text-rose-600">{disconformes}</div>
          </div>
          <div className="rounded-lg ring-1 ring-border/60 p-3 bg-white/70">
            <div className="text-[11px] text-muted-foreground">% desacuerdo</div>
            <div className="text-2xl font-bold">{pending.length ? Math.round((disconformes / pending.length) * 100) : 0}%</div>
          </div>
        </div>
      </div>

      {/* Listado agrupado */}
      {Object.entries(grouped).map(([grupo, rows]) => (
        <div key={grupo} className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden">
          <div className="px-4 py-2 text-sm font-semibold bg-muted/40">{grupo || "Listado"}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      onChange={() => {
                        const idsGrupo = rows.map(r => String(r._id));
                        setChecked(prev => {
                          const nx = new Set(prev);
                          const allSel = idsGrupo.every(id => nx.has(id));
                          idsGrupo.forEach(id => allSel ? nx.delete(id) : nx.add(id));
                          return nx;
                        });
                      }}
                      checked={rows.every(r => checked.has(String(r._id))) && rows.length > 0}
                    />
                  </th>
                  <th className="text-left px-3 py-2">Empleado</th>
                  <th className="text-left px-3 py-2">Jefe</th>
                  <th className="text-left px-3 py-2">Área / Sector</th>
                  <th className="text-left px-3 py-2">Plantilla</th>
                  <th className="text-left px-3 py-2">Periodo</th>
                  <th className="text-left px-3 py-2">Ack</th>
                  <th className="text-left px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ev) => (
                  <tr key={ev._id} className="border-t border-border/60 odd:bg-background even:bg-muted/10">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checked.has(String(ev._id))} onChange={() => toggleOne(String(ev._id))} />
                    </td>
                    <td className="px-3 py-2">
                      {ev.empleado?.apellido}, {ev.empleado?.nombre}
                    </td>
                    <td className="px-3 py-2">
                      {ev.manager?.apellido ? `${ev.manager.apellido}, ${ev.manager.nombre || ""}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {(ev.empleado?.area?.nombre || "—")} / {(ev.empleado?.sector?.nombre || "—")}
                    </td>
                    <td className="px-3 py-2">{ev.plantilla?.nombre || ev.nombre || "—"}</td>
                    <td className="px-3 py-2">{ev.periodo}</td>
                    <td className="px-3 py-2">
                      {ev.empleadoAck?.estado === "ACK" ? "Conforme" :
                       ev.empleadoAck?.estado === "CONTEST" ? "En desacuerdo" : "—"}
                    </td>
                    <td className="px-3 py-2">{ev.actual != null ? `${Number(ev.actual).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Sin registros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Footer acciones rápidas */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={toggleAll}>{checked.size === allIds.length ? "Deseleccionar todo" : "Seleccionar todo"}</Button>
        <Button onClick={closeSelected} disabled={checked.size === 0}>Cerrar seleccionados</Button>
      </div>
    </div>
  );
}
