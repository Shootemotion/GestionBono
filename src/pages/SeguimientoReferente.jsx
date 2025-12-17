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
import { BarChart3, Calendar, RefreshCw } from "lucide-react";

/* ========= utils de agrupación/normalización ========= */

// Helper seguro para obtener array de items
function getItemsArray(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.items)) return source.items;
  return [];
}

function flatItemsFromRow(row, tipoFiltro) {
  const out = [];

  // 1. Intentar obtener el empleado del objeto
  // Puede venir directo en 'row.empleado' o dentro de un array 'row.empleados'
  let emp = row.empleado;
  if (!emp && Array.isArray(row.empleados) && row.empleados.length > 0) {
    emp = row.empleados[0];
  }

  // Si no hay datos de empleado, esta fila no sirve
  if (!emp || !emp._id) return out;

  // ---------------------------------------------------------
  // ESTRATEGIA A: La fila es un DASHBOARD (Contiene listas)
  // (Esto pasa con dashEmpleado o si dashArea agrupa por persona)
  // ---------------------------------------------------------
  if (row.objetivos || row.aptitudes) {
    const pushItems = (itemsSource, _tipo) => {
      const lista = getItemsArray(itemsSource); // Usamos el helper seguro

      for (const it of lista) {
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
          metasCount: Array.isArray(it.metas) ? it.metas.length : 0,
        });
      }
    };

    if (tipoFiltro !== "aptitud") pushItems(row.objetivos, "objetivo");
    if (tipoFiltro !== "objetivo") pushItems(row.aptitudes, "aptitud");

    // Verificar singular y plural por seguridad
    pushItems(row.feedbacks || row.feedback, "feedback");

    return out;
  }

  // ---------------------------------------------------------
  // ESTRATEGIA B: La fila es un ITEM SUELTO (Objetivo directo)
  // (Esto pasa si dashArea devuelve una lista plana de objetivos)
  // ---------------------------------------------------------
  // Si tiene nombre y un ID, asumimos que ES el item
  if (row.nombre && row._id) {
    // Detectar tipo (o asumir objetivo por defecto)
    const myTipo = row._tipo || row.tipo || "objetivo";

    // Aplicar filtro
    if (tipoFiltro !== "todos" && tipoFiltro !== myTipo) return out;

    out.push({
      _id: row._id,
      _tipo: myTipo,
      nombre: row.nombre,
      peso: row.pesoBase ?? row.peso ?? null,
      empleados: [emp],
      area: emp.area || null,
      sector: emp.sector || null,
      hitos: Array.isArray(row.hitos) ? row.hitos : [],
      rawItem: row,
      metasCount: Array.isArray(row.metas) ? row.metas.length : 0,
    });

    return out;
  }

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
    return x.nombre;
  };

  const map = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        title: labelOf(it),
        kind: mode, // "item" | "empleado" | "area" | "sector"
        _tipo: it._tipo,
        items: [],
        empleados: new Map(),
        areas: new Map(),
        sectores: new Map(),
        periodos: new Set(),
      });
    }
    const g = map.get(k);
    g.items.push(it);

    for (const e of it.empleados || []) g.empleados.set(String(e._id), e);
    if (it.area)
      g.areas.set(String(it.area._id || it.area), it.area?.nombre || "—");
    if (it.sector)
      g.sectores.set(String(it.sector._id || it.sector), it.sector?.nombre || "—");
    for (const h of it.hitos || []) g.periodos.add(h.periodo);
  }

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/* ===================== Página ===================== */

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

  // Local calculation to ensure we catch "Hybrid" roles correctly
  // even if the backend flag hasn't updated or is strict.
  const isJefeArea = Boolean(
    user?.isJefeArea ||
    (Array.isArray(user?.referenteAreas) && user.referenteAreas.length > 0)
  );

  const currentYear = new Date().getFullYear();

  // estado
  const [anio, setAnio] = useState(currentYear);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [areaFiltro, setAreaFiltro] = useState("todas");
  const [sectorFiltro, setSectorFiltro] = useState("todos");
  const [empQuery, setEmpQuery] = useState("");
  const [empSelectedId, setEmpSelectedId] = useState(null);
  const [showEmpHints, setShowEmpHints] = useState(false);

  const [mainTab, setMainTab] = useState("objetivos"); // "objetivos" | "feedback"
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [view, setView] = useState("gantt");
  const [zoom, setZoom] = useState("mes");
  const [dueOnly, setDueOnly] = useState(false);
  const [sortDir, setSortDir] = useState("asc");
  const [ganttGrouping, setGanttGrouping] = useState("sector_estado"); // "sector_estado" | "estado_sector"
  const [groupBy, setGroupBy] = useState("empleado");

  // carga de datos robusta
  useEffect(() => {
    if (!puedeVer) return;
    (async () => {
      try {
        setLoading(true);
        let rawResponses = [];

        // 1. Recolectar respuestas crudas según rol
        if (esReferente) {
          const promises = [];

          // Hybrid Logic:
          // 1. If user is explicitly a Jefe de Area (or has areas assigned), fetch their areas.
          if (isJefeArea && user?.referenteAreas?.length) {
            promises.push(...user.referenteAreas.map((a) => dashArea(a, anio)));
          }

          // 2. Always fetch assigned sectors.
          //    (This handles Pure Sector Managers AND Hybrid users' extra sectors)
          if (user?.referenteSectors?.length) {
            promises.push(...user.referenteSectors.map((s) => dashSector(s, anio)));
          }

          const results = await Promise.all(promises);
          rawResponses = results.flat();
        } else if (esDirector) {
          // Director/RRHH: Traer TODO de una sola vez
          // dashArea(null) en el backend ya está optimizado para traer todos los empleados
          const allData = await dashArea(null, anio);
          rawResponses = Array.isArray(allData) ? allData : [];
        } else if (esVisor && user?.empleado?._id) {
          const resp = await api(
            `/dashboard/empleado/${user.empleado._id}?year=${anio}`
          );
          rawResponses = Array.isArray(resp) ? resp : [resp];
        }

        // 2. Aplanar la estructura (Normalización)
        let flatRows = [];

        const processEntry = (entry) => {
          if (!entry) return;

          // Caso: Objeto contenedor con propiedad 'items'
          if (Array.isArray(entry.items)) {
            entry.items.forEach(sub => processEntry(sub));
            return;
          }

          // Caso: Array anidado
          if (Array.isArray(entry)) {
            entry.forEach(sub => processEntry(sub));
            return;
          }

          // Caso: Objeto válido
          flatRows.push(entry);
        };

        rawResponses.forEach(r => processEntry(r));

        // --- INYECCIÓN DE FEEDBACK TRIMESTRAL ---
        // 1. Identificar empleados únicos
        const empleadosMap = new Map();
        flatRows.forEach(row => {
          if (row.empleado && row.empleado._id) {
            empleadosMap.set(String(row.empleado._id), row.empleado);
          }
          if (Array.isArray(row.empleados)) {
            row.empleados.forEach(e => {
              if (e && e._id) empleadosMap.set(String(e._id), e);
            });
          }
        });

        // 2. Crear item de Feedback
        const feedbackItems = [];
        for (const emp of empleadosMap.values()) {
          const dashObj = flatRows.find(r => r.empleado && String(r.empleado._id) === String(emp._id));
          const empFeedbacks = dashObj?.feedbacks || [];

          // CORREGIDO: Inyectar fila de feedback SOLO si tiene Objetivos asignados o ya tiene feedback histórico
          // (Si no tiene objetivos, no debería iniciar feedback este año)
          const hasObjectives = getItemsArray(dashObj?.objetivos).length > 0;
          const hasHistory = empFeedbacks.length > 0;

          if (hasObjectives || hasHistory) {
            feedbackItems.push({
              _id: `feedback-global`, // ID especial
              _tipo: "feedback",
              nombre: "Feedback Trimestral",
              empleado: emp,
              empleados: [emp],
              area: emp.area,
              sector: emp.sector,
              peso: 0,
              hitos: [
                { periodo: "Q1", fecha: `${anio}-11-01` },
                { periodo: "Q2", fecha: `${anio + 1}-02-01` },
                { periodo: "Q3", fecha: `${anio + 1}-05-01` },
                { periodo: "FINAL", fecha: `${anio + 1}-08-30` }
              ].map(h => {
                const fb = empFeedbacks.find(f => f.periodo === h.periodo);
                return {
                  ...h,
                  estado: fb ? fb.estado : "DRAFT", // fallback a DRAFT
                  feedbackId: fb?._id,
                  actual: fb ? (fb.estado === "CLOSED" ? 100 : null) : null
                };
              })
            });
          }
        }

        flatRows.push(...feedbackItems);
        setRows(flatRows);

      } catch (e) {
        console.error(e);
        toast.error("Error al cargar datos.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, anio, puedeVer, esReferente, esDirector, esVisor, isJefeArea]);

  if (!puedeVer) {
    return (
      <div className="container-app p-6">
        <div className="max-w-3xl mx-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6 text-center">
          <h2 className="text-lg font-semibold mb-1">Acceso restringido</h2>
          <p className="text-sm text-slate-600">
            Necesitás ser referente, directivo/RRHH o tener un usuario activo
            con objetivos propios.
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

  // hints del buscador
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
      if (
        label.toLowerCase().includes(t) ||
        sec.includes(t) ||
        ar.includes(t)
      ) {
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
      data = data.filter(
        (r) =>
          String(r.empleado?.area?._id || r.empleado?.area) ===
          String(areaFiltro)
      );
    }
    if (sectorFiltro !== "todos") {
      data = data.filter(
        (r) =>
          String(r.empleado?.sector?._id || r.empleado?.sector) ===
          String(sectorFiltro)
      );
    }
    if (empSelectedId) {
      data = data.filter(
        (r) => String(r.empleado?._id) === String(empSelectedId)
      );
    }
    return data;
  }, [rows, areaFiltro, sectorFiltro, empSelectedId]);

  // items planos (ya con tipoFiltro y mainTab)
  const flatItems = useMemo(() => {
    const out = [];
    for (const r of filteredRows) {
      out.push(...flatItemsFromRow(r, tipoFiltro)); // Pass filtered type directly
    }

    // Filtrado por Pestaña Principal
    if (mainTab === "feedback") {
      return out.filter(i => i._tipo === "feedback");
    } else {
      // Pestaña Objetivos: mostrar objetivos/aptitudes según sub-filtro
      return out.filter(i => {
        if (i._tipo === "feedback") return false;
        if (tipoFiltro === "todos") return true;
        return i._tipo === tipoFiltro;
      });
    }
  }, [filteredRows, tipoFiltro, mainTab]);

  // agrupación seleccionada + orden
  const grouped = useMemo(() => {
    const base = groupItems(flatItems, groupBy);
    if (sortDir === "desc") return [...base].reverse();
    return base;
  }, [flatItems, groupBy, sortDir]);


  // agenda (vista calendario) – una entrada POR EMPLEADO, igual que el Gantt
  const agendaList = useMemo(() => {
    if (view !== "agenda") return [];
    const entries = [];

    flatItems.forEach((it, idx) => {
      const empleados = Array.isArray(it.empleados) ? it.empleados : [];

      (it.hitos || []).forEach((h, j) => {
        empleados.forEach((emp, k) => {
          if (!emp || !emp._id) return;

          const key = `${emp._id}-${it._id}-${h.periodo}-${idx}-${j}-${k}`;

          entries.push({
            key,
            empleado: emp,          // 👈 empleado individual
            item: it.rawItem || it, // por las dudas
            periodo: h.periodo,
            fecha: h.fecha || null, // si no hay fecha, el calendario usa periodo
          });
        });
      });
    });

    return entries.sort((a, b) => {
      const fa = a.fecha ? new Date(a.fecha) : new Date(2100, 0, 1);
      const fb = b.fecha ? new Date(b.fecha) : new Date(2100, 0, 1);
      return fa - fb;
    });
  }, [flatItems, view]);



  // ID del empleado seleccionado (usado para resaltar en el Gantt)
  const selectedEmpleadoId = empSelectedId ? String(empSelectedId) : null;

  const openHitoPage = (item, empleados = [], hito) => {
    const empId =
      Array.isArray(empleados) && empleados.length === 1
        ? empleados[0]._id
        : null;

    // Si es feedback global
    const pId = item._tipo === "feedback" ? "feedback-global" : item._id;

    navigate(
      `/evaluacion/${pId}/${hito.periodo}/${empId ?? ""}`,
      {
        state: {
          from: "seguimiento",
          anio,
          itemSeleccionado: item,
          empleadosDelItem: empleados,
          hito,
        },
        replace: false,
      }
    );
  };

  const limpiarSeleccion = () => {
    setEmpSelectedId(null);
  };

  return (
    <div className="bg-slate-50 min-h-screen py-6">
      <div className="max-w-7xl mx-auto space-y-6 px-4">
        {/* Filtros originales */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <FilterBar
            {...{
              anio,
              setAnio,
              areaFiltro,
              setAreaFiltro,
              areasUnicas,
              sectorFiltro,
              setSectorFiltro,
              sectoresUnicos,
              empQuery,
              setEmpQuery,
              empSelectedId,
              setEmpSelectedId,
              empHints,
              showEmpHints,
              setShowEmpHints,
              mainTab,
              setMainTab,
              hideAreaFilter: !isJefeArea && !esDirector && !esSuperAdmin && !esVisor
            }}
          />
        </div>

        {/* LEYENDA DE COLORES */}
        <div className="flex flex-wrap gap-4 px-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-slate-400"></span>
            <span className="text-slate-600">Borrador</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-slate-600">Enviado al Empleado</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span>
            <span className="text-slate-600">Enviado a RRHH</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
            <span className="text-slate-600">Finalizado</span>
          </div>
          <div className="w-px h-4 bg-slate-300 mx-2"></div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
            <span className="text-slate-600">Obj. Completado</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-rose-500"></span>
            <span className="text-slate-600">Vencido</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-slate-600">Por Vencer</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
            <span className="text-slate-600">Futuro</span>
          </div>
        </div>

        {/* Controles superiores */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setView("gantt")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${view === "gantt"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                  }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Gantt
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${view === "calendar"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                  }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Calendario
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Filtros de estado rápidos */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
              <span className="text-[10px] font-medium text-slate-400 px-2 uppercase tracking-wider">Vencimientos</span>
              <button
                onClick={() => setDueOnly(false)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${!dueOnly
                  ? "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                Todos
              </button>
              <button
                onClick={() => setDueOnly(true)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${dueOnly
                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                  : "text-slate-500 hover:text-rose-600"
                  }`}
              >
                Vencidos/Por Vencer
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Selector de Agrupación */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Agrupar</span>
              <select
                className="rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-blue-100"
                value={ganttGrouping}
                onChange={(e) => setGanttGrouping(e.target.value)}
              >
                <option value="sector_estado">Sector &gt; Estado</option>
                <option value="estado_sector">Estado &gt; Sector</option>
              </select>
            </div>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Orden</span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setSortDir("asc")}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${sortDir === "asc"
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  ↑ Asc
                </button>
                <button
                  onClick={() => setSortDir("desc")}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${sortDir === "desc"
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  ↓ Desc
                </button>
              </div>
            </div>

            {view === "gantt" && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-1" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Meses</span>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg">
                    <button
                      onClick={() => setZoom("mes")}
                      className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${zoom === "mes"
                        ? "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                      Meses
                    </button>
                    <button
                      onClick={() => setZoom("trimestre")}
                      className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${zoom === "trimestre"
                        ? "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                      Trimestres
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="h-4 w-px bg-slate-200 mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={limpiarSeleccion}
              disabled={!selectedEmpleadoId}
              className="h-7 text-[10px] text-slate-500 hover:text-slate-700"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              Limpiar selección
            </Button>
          </div>
        </div>

        {/* Contenido: layout 1 columna (full-width Gantt) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[520px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900">
              {view === "gantt"
                ? "Agenda de evaluaciones (Gantt)"
                : "Agenda de evaluaciones (Calendario)"}
            </div>
            {loading && (
              <div className="text-[11px] text-slate-500">Cargando…</div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {view === "agenda" ? (
              <CalendarView
                agendaList={agendaList}
                openHitoModal={openHitoPage}
              />
            ) : (
              <GanttView
                grouped={flatItems}
                anio={anio}
                zoom={zoom}
                openHitoModal={openHitoPage}
                dueOnly={dueOnly}
                sortDir={sortDir}
                selectedEmpleadoId={selectedEmpleadoId}
                hideAreaGroup={!isJefeArea && !esDirector && !esSuperAdmin && !esVisor}
                ganttGrouping={ganttGrouping}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}