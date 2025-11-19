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

const norm = (res) =>
  Array.isArray(res)
    ? res
    : Array.isArray(res?.items)
    ? res.items
    : Array.isArray(res?.data)
    ? res.data
    : Array.isArray(res?.results)
    ? res.results
    : Array.isArray(res?.rows)
    ? res.rows
    : [];
    

export default function RRHHEvaluaciones() {
  const [periodo, setPeriodo] = useState("");
  const [plantillaId, setPlantillaId] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [pending, setPending] = useState([]); // evaluaciones en PENDING_HR
  const [checked, setChecked] = useState(new Set());
  const [groupBy, setGroupBy] = useState("jefe");
  const [loading, setLoading] = useState(false);

  const [ackFilter, setAckFilter] = useState("todos"); // todos | ack | contest | sin
  const [sortBy, setSortBy] = useState("empleado");    // empleado | jefe | area | resultado | vence
  const [sortDir, setSortDir] = useState("asc");       // asc | desc

  // helper formateo fecha de vencimiento (hito / plantilla)
  const formatFechaLimite = (ev) => {
    const raw = ev.fechaLimite || ev.plantilla?.fechaLimite;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // cargar plantillas para filtro
  useEffect(() => {
    (async () => {
      try {
        const pls = await api("/templates?limit=1000");
        const arr = norm(pls);
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
      if (periodo) {
        qs.set("periodo", periodo);
        qs.set("period", periodo);
      }
      if (plantillaId) {
        qs.set("plantillaId", plantillaId);
        qs.set("templateId", plantillaId);
      }

      const res = await api(`/evaluaciones/hr/pending?${qs.toString()}`);
      console.log("[RRHH] /evaluaciones/hr/pending raw =>", res);
      const items = norm(res);
      setPending(items);
      setChecked(new Set());
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar las evaluaciones pendientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, plantillaId]);

  const allIds = useMemo(() => pending.map((p) => String(p._id)), [pending]);

  const toggleOne = (id) => {
    setChecked((prev) => {
      const nx = new Set(prev);
      nx.has(id) ? nx.delete(id) : nx.add(id);
      return nx;
    });
  };

  const toggleAll = () => {
    setChecked((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  };

  const changeSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const filteredSorted = useMemo(() => {
    let arr = [...pending];

    // filtro por estado del empleado (ACK / CONTEST / sin respuesta)
    if (ackFilter === "ack") {
      arr = arr.filter((p) => p.empleadoAck?.estado === "ACK");
    } else if (ackFilter === "contest") {
      arr = arr.filter((p) => p.empleadoAck?.estado === "CONTEST");
    } else if (ackFilter === "sin") {
      arr = arr.filter((p) => !p.empleadoAck?.estado);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const safe = (v) => (v ?? "").toString().toLowerCase();

    arr.sort((a, b) => {
      if (sortBy === "empleado") {
        const aKey = safe(`${a.empleado?.apellido || ""} ${a.empleado?.nombre || ""}`);
        const bKey = safe(`${b.empleado?.apellido || ""} ${b.empleado?.nombre || ""}`);
        return aKey > bKey ? dir : aKey < bKey ? -dir : 0;
      }

      if (sortBy === "jefe") {
        const aKey = safe(
          `${a.manager?.apellido || ""} ${a.manager?.nombre || ""} ${a.manager?.email || ""}`
        );
        const bKey = safe(
          `${b.manager?.apellido || ""} ${b.manager?.nombre || ""} ${b.manager?.email || ""}`
        );
        return aKey > bKey ? dir : aKey < bKey ? -dir : 0;
      }

      if (sortBy === "area") {
        const aKey = safe(
          `${a.empleado?.area?.nombre || ""} ${a.empleado?.sector?.nombre || ""}`
        );
        const bKey = safe(
          `${b.empleado?.area?.nombre || ""} ${b.empleado?.sector?.nombre || ""}`
        );
        return aKey > bKey ? dir : aKey < bKey ? -dir : 0;
      }

      if (sortBy === "resultado") {
        const aVal = a.actual ?? -9999;
        const bVal = b.actual ?? -9999;
        return aVal > bVal ? dir : aVal < bVal ? -dir : 0;
      }

      if (sortBy === "vence") {
        const aDate = new Date(a.fechaLimite || a.plantilla?.fechaLimite || 0).getTime();
        const bDate = new Date(b.fechaLimite || b.plantilla?.fechaLimite || 0).getTime();
        return aDate > bDate ? dir : aDate < bDate ? -dir : 0;
      }

      return 0;
    });

    return arr;
  }, [pending, ackFilter, sortBy, sortDir]);

  const grouped = useMemo(() => {
    const source = filteredSorted;

    if (groupBy === "ninguno") return { "": source };

    const map = {};
    for (const ev of source) {
      let key = "";
      if (groupBy === "jefe") {
        const ap = ev.manager?.apellido;
        const nom = ev.manager?.nombre;
        if (ap || nom) {
          key = [ap, nom].filter(Boolean).join(", ");
        } else {
          key = ev.manager?.email || "— Sin jefe";
        }
      } else if (groupBy === "area") {
        key = ev.empleado?.area?.nombre || "— Sin área";
      } else if (groupBy === "sector") {
        key = ev.empleado?.sector?.nombre || "— Sin sector";
      }
      map[key] = map[key] || [];
      map[key].push(ev);
    }
    return map;
  }, [filteredSorted, groupBy]);

  const closeSelected = async () => {
    if (checked.size === 0) return toast.warn("Seleccioná al menos una evaluación.");
    try {
      await api("/evaluaciones/hr/close-bulk", {
        method: "POST",
        body: { ids: Array.from(checked) },
      });
      toast.success("Cerradas.");
      await loadPending();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar la selección.");
    }
  };

  const closeByAck = async (estado) => {
    const ids = pending
      .filter((p) => p.empleadoAck?.estado === estado)
      .map((p) => String(p._id));

    if (!ids.length) {
      toast.warn(`No hay evaluaciones con estado ${estado}.`);
      return;
    }

    if (!confirm(`¿Cerrar TODAS las evaluaciones con estado ${estado}?`)) return;

    try {
      await api("/evaluaciones/hr/close-bulk", {
        method: "POST",
        body: { ids },
      });
      toast.success(`Cerradas (${estado}).`);
      await loadPending();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar en lote por estado.");
    }
  };

  const closeAll = async () => {
    if (!confirm("¿Cerrar TODAS las evaluaciones filtradas (estado PENDING_HR)?")) return;
    try {
      await api("/evaluaciones/hr/close-bulk", {
        method: "POST",
        body: {
          filtro: {
            periodo: periodo || undefined,
            plantillaId: plantillaId || undefined,
          },
        },
      });
      toast.success("Cerradas todas las filtradas.");
      await loadPending();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar en lote.");
    }
  };

  const conformes = pending.filter((p) => p.empleadoAck?.estado === "ACK").length;
  const disconformes = pending.filter((p) => p.empleadoAck?.estado === "CONTEST").length;
  const conRespuesta = conformes + disconformes;
  const sinRespuesta = pending.length - conRespuesta;

  return (
    <div className="container-app space-y-6">
      {/* Header y filtros */}
      <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px] max-w-xs">
            <div className="text-xs text-muted-foreground">Periodo</div>
            <input
              placeholder="Ej: 2025Q2 / 2025M06"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.trim())}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex-1 min-w-[220px] max-w-sm">
            <div className="text-xs text-muted-foreground">Plantilla</div>
            <select
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {plantillas.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="w-44">
            <div className="text-xs text-muted-foreground">Estado empleado</div>
            <select
              value={ackFilter}
              onChange={(e) => setAckFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="ack">Solo conformes</option>
              <option value="contest">Solo en desacuerdo</option>
              <option value="sin">Sin respuesta</option>
            </select>
          </div>

          <div className="w-40">
            <div className="text-xs text-muted-foreground">Agrupar</div>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {groupOptions.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.lbl}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadPending} disabled={loading}>
              Refrescar
            </Button>
            <Button
              variant="outline"
              onClick={closeSelected}
              disabled={loading || checked.size === 0}
            >
              Cerrar seleccionados
            </Button>
            <Button
              onClick={closeAll}
              disabled={loading || pending.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Cerrar todos (filtrados)
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg ring-1 ring-indigo-100 p-3 bg-indigo-50">
            <div className="text-[11px] text-indigo-700/80">Pendientes en RRHH</div>
            <div className="text-2xl font-bold text-indigo-900">{pending.length}</div>
          </div>
          <div className="rounded-lg ring-1 ring-emerald-100 p-3 bg-emerald-50">
            <div className="text-[11px] text-emerald-700/80">Flujos cerrados (ACK / desacuerdo)</div>
            <div className="text-2xl font-bold text-emerald-900">{conRespuesta}</div>
          </div>
          <div className="rounded-lg ring-1 ring-amber-100 p-3 bg-amber-50">
            <div className="text-[11px] text-amber-700/80">Pendientes respuesta empleado</div>
            <div className="text-2xl font-bold text-amber-900">{sinRespuesta}</div>
          </div>
          <div className="rounded-lg ring-1 ring-rose-100 p-3 bg-rose-50">
            <div className="text-[11px] text-rose-700/80">% desacuerdo (sobre pendientes)</div>
            <div className="text-2xl font-bold text-rose-900">
              {pending.length ? Math.round((disconformes / pending.length) * 100) : 0}%
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => closeByAck("ACK")}
            disabled={loading || conformes === 0}
          >
            Cerrar solo conformes (ACK)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => closeByAck("CONTEST")}
            disabled={loading || disconformes === 0}
          >
            Cerrar solo en desacuerdo (CONTEST)
          </Button>
        </div>
      </div>

      {/* Listado agrupado */}
      {Object.entries(grouped).map(([grupo, rows]) => (
        <div
          key={grupo}
          className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden"
        >
          <div className="px-4 py-2 text-sm font-semibold bg-muted/40">
            {grupo || "Listado"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      onChange={() => {
                        const idsGrupo = rows.map((r) => String(r._id));
                        setChecked((prev) => {
                          const nx = new Set(prev);
                          const allSel = idsGrupo.every((id) => nx.has(id));
                          idsGrupo.forEach((id) =>
                            allSel ? nx.delete(id) : nx.add(id)
                          );
                          return nx;
                        });
                      }}
                      checked={rows.every((r) => checked.has(String(r._id))) && rows.length > 0}
                    />
                  </th>

                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => changeSort("empleado")}
                      className="flex items-center gap-1"
                    >
                      Empleado
                      {sortBy === "empleado" && (sortDir === "asc" ? "▲" : "▼")}
                    </button>
                  </th>

                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => changeSort("jefe")}
                      className="flex items-center gap-1"
                    >
                      Jefe
                      {sortBy === "jefe" && (sortDir === "asc" ? "▲" : "▼")}
                    </button>
                  </th>

                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => changeSort("area")}
                      className="flex items-center gap-1"
                    >
                      Área / Sector
                      {sortBy === "area" && (sortDir === "asc" ? "▲" : "▼")}
                    </button>
                  </th>

                  <th className="text-left px-3 py-2">Plantilla</th>

                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => changeSort("vence")}
                      className="flex items-center gap-1"
                    >
                      Vence
                      {sortBy === "vence" && (sortDir === "asc" ? "▲" : "▼")}
                    </button>
                  </th>

                  <th className="text-left px-3 py-2">Periodo</th>
                  <th className="text-left px-3 py-2">Estado empleado</th>
                  <th className="text-left px-3 py-2">Comentario empleado</th>

                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => changeSort("resultado")}
                      className="flex items-center gap-1"
                    >
                      Resultado
                      {sortBy === "resultado" && (sortDir === "asc" ? "▲" : "▼")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ev) => (
                  <tr
                    key={ev._id}
                    className="border-t border-border/60 odd:bg-background even:bg-muted/10"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.has(String(ev._id))}
                        onChange={() => toggleOne(String(ev._id))}
                      />
                    </td>

                    <td className="px-3 py-2">
                      {ev.empleado?.apellido}, {ev.empleado?.nombre}
                    </td>

                    <td className="px-3 py-2">
                      {ev.manager
                        ? ev.manager.apellido
                          ? `${ev.manager.apellido}, ${ev.manager.nombre || ""}`
                          : ev.manager.nombre || ev.manager.email || "—"
                        : "—"}
                    </td>

                    <td className="px-3 py-2">
                      {ev.empleado?.area?.nombre || "—"} /{" "}
                      {ev.empleado?.sector?.nombre || "—"}
                    </td>

                    <td className="px-3 py-2">
                      {ev.plantilla?.nombre || ev.nombre || "—"}
                    </td>

                    <td className="px-3 py-2">
                      {formatFechaLimite(ev)}
                    </td>

                    <td className="px-3 py-2">{ev.periodo}</td>

                    <td className="px-3 py-2">
                      {ev.empleadoAck?.estado === "ACK" && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium">
                          Conforme
                        </span>
                      )}
                      {ev.empleadoAck?.estado === "CONTEST" && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 text-xs font-medium">
                          En desacuerdo
                        </span>
                      )}
                      {!ev.empleadoAck?.estado && (
                        <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-600 px-2 py-0.5 text-xs font-medium">
                          Sin respuesta
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 max-w-xs">
                      {ev.comentarioEmpleado ? (
                        <span title={ev.comentarioEmpleado}>
                          {ev.comentarioEmpleado.length > 80
                            ? ev.comentarioEmpleado.slice(0, 80) + "…"
                            : ev.comentarioEmpleado}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {ev.actual != null
                        ? `${Number(ev.actual).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-4 text-muted-foreground"
                    >
                      Sin registros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Footer acciones rápidas */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={toggleAll}>
          {checked.size === allIds.length ? "Deseleccionar todo" : "Seleccionar todo"}
        </Button>
        <Button onClick={closeSelected} disabled={checked.size === 0}>
          Cerrar seleccionados
        </Button>
      </div>
    </div>
  );
}
