import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { dashArea, dashSector } from "@/lib/dashboard";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

import FilterBar from "@/components/seguimiento/FilterBar";
import GanttView from "@/components/seguimiento/GanttView";
import CalendarView from "@/components/seguimiento/CalendarView";
import { Button } from "@/components/ui/button";

/* ========= utils de agrupación/normalización ========= */

function flatItemsFromRow(row, tipoFiltro) {
  const out = [];
  const emp = row.empleado;
  if (!emp) return out;

  const pushItems = (items, _tipo) => {
    for (const it of items || []) {
      const metasCount =
        Array.isArray(it?.metas) ? it.metas.length :
        Array.isArray(it?.rawItem?.metas) ? it.rawItem.metas.length :
        (Number.isFinite(it?.metasCount) ? it.metasCount : 0);
      out.push({
        _id: it._id,
        _tipo,
        nombre: it.nombre,
        peso: it.pesoBase ?? it.peso ?? null,
        empleados: [emp],
        area: emp.area || null,
        sector: emp.sector || null,
        hitos: Array.isArray(it.hitos) ? it.hitos : [],
        rawItem: it,
        metasCount, 
      });
    }
  };

  if (tipoFiltro !== "aptitud") pushItems(row.objetivos?.items, "objetivo");
  if (tipoFiltro !== "objetivo") pushItems(row.aptitudes?.items, "aptitud");
  return out;
}

// agrupa por clave dinámica y fusiona (sin duplicar) empleados/áreas/sectores/períodos
function groupItems(items, mode = "item") {
  const keyOf = (x) => {
    if (mode === "empleado") return String(x.empleados?.[0]?._id);
    if (mode === "area") return String(x.area?._id || x.area);
    if (mode === "sector") return String(x.sector?._id || x.sector);
    // default: item
    return `${x._tipo}:${x._id}`;
  };

 const labelOf = (x) => {
    if (mode === "empleado")
      return `${x.empleados?.[0]?.apellido || ""} ${x.empleados?.[0]?.nombre || ""}`.trim();
    if (mode === "area") return x.area?.nombre || "Sin área";
    if (mode === "sector") return x.sector?.nombre || "Sin sector";
    return x.nombre; // sin emojis, limpio
  };


  const map = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        title: labelOf(it),
        kind: mode,  
        // metadata resumida
        _tipo: it._tipo,
        items: [],
        empleados: new Map(), // id -> obj
        areas: new Map(),     // id -> nombre
        sectores: new Map(),  // id -> nombre
        periodos: new Set(),
      });
    }
    const g = map.get(k);
    g.items.push(it);

    // merge empleados/área/sector/períodos
    for (const e of it.empleados || []) g.empleados.set(String(e._id), e);
    if (it.area) g.areas.set(String(it.area._id || it.area), it.area?.nombre || "—");
    if (it.sector) g.sectores.set(String(it.sector._id || it.sector), it.sector?.nombre || "—");
    for (const h of it.hitos || []) g.periodos.add(h.periodo);
  }

  // salida ordenada por título
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/* ===================================================== */

export default function SeguimientoReferente() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // roles
  const esReferente = Boolean(
    (Array.isArray(user?.referenteAreas) && user.referenteAreas.length > 0) ||
    (Array.isArray(user?.referenteSectors) && user.referenteSectors.length > 0)
  );
  const esDirector = user?.rol === "directivo" || user?.isRRHH === true;
  const esSuperAdmin = user?.rol === "superadmin";
  const esVisor = user?.rol === "visor";
  const puedeVer = esReferente || esDirector || esSuperAdmin || esVisor;

  // estado
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [areaFiltro, setAreaFiltro] = useState("todas");
  const [sectorFiltro, setSectorFiltro] = useState("todos");
  const [empQuery, setEmpQuery] = useState("");
  const [empSelectedId, setEmpSelectedId] = useState(null);
  const [showEmpHints, setShowEmpHints] = useState(false);

  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [view, setView] = useState("gantt");
  const [zoom, setZoom] = useState("mes");
const [dueOnly, setDueOnly] = useState(false);   // <-- mueve estos acá
 const [sortDir, setSortDir] = useState("asc");
  // NUEVO: modo de agrupación
  const [groupBy, setGroupBy] = useState("item"); // "item" | "empleado" | "area" | "sector"

  useEffect(() => {
    if (!puedeVer) return;
    (async () => {
      try {
        setLoading(true);
        let data = [];

        if (esReferente) {
          if (user?.referenteAreas?.length) {
            const results = await Promise.all(user.referenteAreas.map((a) => dashArea(a, anio)));
            data = results.flat();
          } else if (user?.referenteSectors?.length) {
            const results = await Promise.all(user.referenteSectors.map((s) => dashSector(s, anio)));
            data = results.flat();
          }
        } else if (esDirector) {
          const [allAreas, allSectores] = await Promise.all([dashArea(null, anio), dashSector(null, anio)]);
          data = [...allAreas, ...allSectores];
        } else if (esVisor && user?.empleado?._id) {
          const resp = await api(`/dashboard/empleado/${user.empleado._id}?year=${anio}`);
          data = Array.isArray(resp) ? resp : [resp];
        }

        setRows(data || []);
      } catch (e) {
        console.error(e);
        toast.error("Error al cargar empleados para seguimiento.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, anio, puedeVer, esReferente, esDirector, esVisor]);

  if (!puedeVer) {
    return (
      <div className="container-app p-6">
        <div className="max-w-3xl mx-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6 text-center">
          <h2 className="text-lg font-semibold mb-1">Acceso restringido</h2>
          <p className="text-sm text-slate-600">
            Necesitás ser referente, directivo/RRHH o tener un usuario activo con objetivos propios.
          </p>
        </div>
      </div>
    );
  }

  // selects únicos
  const areasUnicas = useMemo(() => {
    const s = new Map();
    rows.forEach((r) => {
      const a = r.empleado?.area;
      if (!a) return;
      const id = String(a?._id || a);
      const nombre = a?.nombre || a?.name || "Sin nombre";
      s.set(id, { _id: id, nombre });
    });
    return [{ _id: "todas", nombre: "Todas" }, ...Array.from(s.values())];
  }, [rows]);

  const sectoresUnicos = useMemo(() => {
    const s = new Map();
    rows.forEach((r) => {
      const sec = r.empleado?.sector;
      if (!sec) return;
      const id = String(sec?._id || sec);
      const nombre = sec?.nombre || sec?.name || "Sin nombre";
      s.set(id, { _id: id, nombre });
    });
    return [{ _id: "todos", nombre: "Todos" }, ...Array.from(s.values())];
  }, [rows]);

  // hints del buscador (arreglado + debounce simple)
  const empHints = useMemo(() => {
    const t = empQuery.trim().toLowerCase();
    if (!t) return [];
    const mapa = new Map();
    rows.forEach((r) => {
      const e = r.empleado;
      if (!e) return;
      const id = String(e._id);
      const label = `${e.apellido || ""} ${e.nombre || ""}`.trim();
      const sec = (e.sector?.nombre || "").toLowerCase();
      const ar = (e.area?.nombre || "").toLowerCase();
      if (label.toLowerCase().includes(t) || sec.includes(t) || ar.includes(t)) {
        if (!mapa.has(id)) {
          mapa.set(id, {
            _id: id,
            label,
            sector: e.sector?.nombre || "—",
            area: e.area?.nombre || "—",
          });
        }
      }
    });
    return Array.from(mapa.values()).slice(0, 8);
  }, [rows, empQuery]);

  // filtrado base por área/sector/empleado
  const filteredRows = useMemo(() => {
    let data = rows;
    if (areaFiltro !== "todas") {
      data = data.filter((r) => String(r.empleado?.area?._id || r.empleado?.area) === String(areaFiltro));
    }
    if (sectorFiltro !== "todos") {
      data = data.filter((r) => String(r.empleado?.sector?._id || r.empleado?.sector) === String(sectorFiltro));
    }
    if (empSelectedId) {
      data = data.filter((r) => String(r.empleado?._id) === String(empSelectedId));
    }
    return data;
  }, [rows, areaFiltro, sectorFiltro, empSelectedId]);

  // items planos (ya con tipoFiltro)
  const flatItems = useMemo(() => {
    const out = [];
    for (const r of filteredRows) {
      out.push(...flatItemsFromRow(r, tipoFiltro));
    }
    return out;
  }, [filteredRows, tipoFiltro]);

  // agrupación seleccionada
  const grouped = useMemo(() => groupItems(flatItems, groupBy), [flatItems, groupBy]);

  // agenda
  const agendaList = useMemo(() => {
    if (view !== "agenda") return [];
    const entries = [];
    grouped.forEach((g) => {
      g.items.forEach((it, idx) => {
        (it.hitos || []).forEach((h, j) => {
          const key = `${(it.empleados?.[0]?._id)||"x"}-${it._id}-${h.periodo}-${idx}-${j}`;
          entries.push({
            key,
            empleados: it.empleados,
            item: it.rawItem,
            periodo: h.periodo,
            fecha: h.fecha,
          });
        });
      });
    });
    return entries.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }, [grouped, view]);

const openHitoPage = (item, empleados = [], hito) => {
  const empId = Array.isArray(empleados) && empleados.length === 1 ? empleados[0]._id : null;
  navigate(`/evaluacion/${item._id}/${hito.periodo}/${empId ?? ""}`, {
    state: { from: "seguimiento", anio, itemSeleccionado: item, empleadosDelItem: empleados, hito },
    replace: false,
  });
};

  return (
    <div className="bg-slate-50 min-h-screen py-6">
      <div className="max-w-7xl mx-auto space-y-6 px-4">
        {/* Filtros */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <FilterBar
            {...{
              anio, setAnio,
              areaFiltro, setAreaFiltro, areasUnicas,
              sectorFiltro, setSectorFiltro, sectoresUnicos,
              empQuery, setEmpQuery,
              empSelectedId, setEmpSelectedId,
              empHints, showEmpHints, setShowEmpHints,
            }}
          />
        </div>

        {/* Controles */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant={view === "gantt" ? "default" : "outline"} onClick={() => setView("gantt")}>📊 Gantt</Button>
            <Button variant={view === "agenda" ? "default" : "outline"} onClick={() => setView("agenda")}>📅 Calendario</Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Tipo</span>
            <div className="inline-flex gap-1">
              <Button variant={tipoFiltro === "todos" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("todos")}>Todos</Button>
              <Button variant={tipoFiltro === "objetivo" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("objetivo")}>🎯 Objetivos</Button>
              <Button variant={tipoFiltro === "aptitud" ? "default" : "outline"} size="sm" onClick={() => setTipoFiltro("aptitud")}>💡 Aptitudes</Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Agrupar por</span>
            <div className="inline-flex gap-1">
              <Button size="sm" variant={groupBy === "item" ? "default" : "outline"} onClick={() => setGroupBy("item")}>Objetivo/Aptitud</Button>
              <Button size="sm" variant={groupBy === "empleado" ? "default" : "outline"} onClick={() => setGroupBy("empleado")}>Empleado</Button>
              <Button size="sm" variant={groupBy === "area" ? "default" : "outline"} onClick={() => setGroupBy("area")}>Área</Button>
              <Button size="sm" variant={groupBy === "sector" ? "default" : "outline"} onClick={() => setGroupBy("sector")}>Sector</Button>
            </div>
          </div>

<div className="flex items-center gap-2">
     <span className="text-xs text-slate-500">Vencimientos</span>
     <button
       className={`text-xs rounded-md border px-3 py-1 ${dueOnly ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-slate-50"}`}
       onClick={() => setDueOnly((v) => !v)}
     >
       {dueOnly ? "Solo vencidos  7d" : "Todos"}
     </button>
   </div>

   <div className="flex items-center gap-2">
     <span className="text-xs text-slate-500">Orden</span>
     <button
       className={`text-xs rounded-md border px-3 py-1 hover:bg-slate-50 ${sortDir==="asc"?"font-semibold":""}`}
       onClick={() => setSortDir("asc")}
     >
       ↑ Asc
     </button>
     <button
       className={`text-xs rounded-md border px-3 py-1 hover:bg-slate-50 ${sortDir==="desc"?"font-semibold":""}`}
       onClick={() => setSortDir("desc")}
     >
       ↓ Desc
     </button>
   </div>
          {view === "gantt" && (
            <div className="flex gap-2">
              <Button variant={zoom === "mes" ? "default" : "outline"} size="sm" onClick={() => setZoom("mes")}>Meses</Button>
              <Button variant={zoom === "trimestre" ? "default" : "outline"} size="sm" onClick={() => setZoom("trimestre")}>Trimestres</Button>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {view === "agenda" ? (
            <CalendarView agendaList={agendaList} openHitoModal={openHitoPage} />
          ) : (
            <GanttView
              grouped={grouped}        // <<--- NUEVO
              anio={anio}
              zoom={zoom}
              openHitoModal={openHitoPage}
              dueOnly={dueOnly}
            />
          )}
        </div>
      </div>
    </div>
  );
}
