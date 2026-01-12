// src/pages/EditorAsignacion.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ================== helpers ================== */
const asArray = (x) => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.items)) return x.items;
  if (Array.isArray(x?.results)) return x.results;
  if (Array.isArray(x?.rows)) return x.rows;
  return [];
};

// Trae TODAS las páginas de un endpoint (mismo helper que en Nómina)
async function fetchAll(path, { pageSize = 200 } = {}) {
  const out = [];
  let page = 1;
  let nextToken = null;

  while (true) {
    const qs = new URLSearchParams();
    if (pageSize) qs.set("pageSize", String(pageSize));
    if (!qs.has("pageSize")) qs.set("limit", String(pageSize));
    qs.set("page", String(page));
    if (nextToken) qs.set("nextPageToken", nextToken);

    const url = qs.toString() ? `${path}?${qs}` : path;
    const data = await api(url);

    const chunk =
      Array.isArray(data) ? data
        : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.docs) ? data.docs
            : [];

    if (chunk.length) out.push(...chunk);

    const total = Number(data?.total ?? data?.count ?? 0);
    const ps = Number(data?.pageSize ?? data?.limit ?? pageSize);
    const currentPage = Number(data?.page ?? page);
    const hasNextToken = !!data?.nextPageToken;

    if (hasNextToken) {
      nextToken = data.nextPageToken;
      continue;
    }

    if (total && currentPage * ps < total) {
      page += 1;
      continue;
    }

    if (!total && chunk.length === 0) break;

    if (!total && chunk.length === ps) {
      page += 1;
      continue;
    }

    break;
  }
  return out;
}

/* ================== componentes UI ================== */

// Barra flotante de guardado
function FloatingSaveBar({ show, onSave, onDiscard }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-xl border border-slate-200 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2 text-slate-700 font-medium text-sm border-r border-slate-200 pr-4 mr-1">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
        Tenés cambios sin guardar
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDiscard}
        className="text-slate-500 hover:text-slate-800 hover:bg-slate-100"
      >
        Descartar
      </Button>
      <Button
        onClick={onSave}
        size="sm"
        className="bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all active:scale-95"
      >
        Guardar cambios
      </Button>
    </div>
  );
}

/* ================== componente principal ================== */

export default function EditorAsignacion() {
  const currentYear = new Date().getFullYear();

  /* Estado base */
  const [year, setYear] = useState(currentYear);
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [participaciones, setParticipaciones] = useState([]);
  const [overrides, setOverrides] = useState([]);

  // Filtro de estructura
  const [filtro, setFiltro] = useState({ tipo: "todos", id: null, nombre: "Todos" });

  // Modo de trabajo
  const [mode, setMode] = useState("scope"); // 'scope' | 'employee'

  // auth
  const { user } = useAuth();

  // Refs
  const empSearchRef = useRef(null);

  /* Índice empleados */
  const empleadosIndex = useMemo(
    () => Object.fromEntries(empleados.map((e) => [String(e._id), e])),
    [empleados]
  );

  /* --------------------- MODO ALCANCE --------------------- */
  const [scopeType, setScopeType] = useState("area"); // 'area' | 'sector'
  const [scopeId, setScopeId] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [selectedTpl, setSelectedTpl] = useState(null);

  // Borrador por alcance
  const [draftScope, setDraftScope] = useState({});
  const [searchSel, setSearchSel] = useState("");

  const empleadosEnScope = useMemo(() => {
    if (!scopeId) return [];
    if (scopeType === "sector") {
      return empleados
        .filter((e) => String(e?.sector?._id || e?.sector) === String(scopeId))
        .map((e) => ({ empleadoId: String(e._id) }));
    }
    return empleados
      .filter((e) => String(e?.area?._id || e?.area) === String(scopeId))
      .map((e) => ({ empleadoId: String(e._id) }));
  }, [empleados, scopeId, scopeType]);

  const rowsScope = useMemo(() => {
    if (!selectedTpl) return [];

    const q = searchSel.trim().toLowerCase();

    return empleadosEnScope
      .map(({ empleadoId }) => {
        const ov = overrides.find(
          (o) =>
            String(o.template) === String(selectedTpl._id) &&
            String(o.empleado) === String(empleadoId) &&
            Number(o.year) === Number(year)
        );

        const d = draftScope[empleadoId] || {};
        const excluido = d.excluido ?? ov?.excluido ?? false;
        const peso = d.peso !== undefined ? d.peso : ov?.peso ?? null;

        const base = Number(selectedTpl.pesoBase ?? 0);
        const finalPeso = excluido ? 0 : Number((peso ?? base).toFixed(2));
        const isOverridden = !excluido && peso != null && Number(peso) !== base;

        const nombre = `${empleadosIndex[empleadoId]?.apellido || ""}, ${empleadosIndex[empleadoId]?.nombre || ""
          }`.trim();

        return {
          empleadoId,
          nombre,
          base,
          excluido,
          peso,
          finalPeso,
          isOverridden,
          overrideId: ov?._id || null,
        };
      })
      .filter((r) => !q || r.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [selectedTpl, empleadosEnScope, overrides, draftScope, empleadosIndex, searchSel, year]);

  const hasChangesScope = useMemo(
    () => Object.keys(draftScope).length > 0,
    [draftScope]
  );

  const setRowDraftScope = (empleadoId, patch) => {
    setDraftScope((prev) => ({
      ...prev,
      [empleadoId]: { ...(prev[empleadoId] || {}), ...patch },
    }));
  };

  const resetChangesScope = () => setDraftScope({});

  const saveChangesScope = async () => {
    if (!selectedTpl) return;
    const tplId = selectedTpl._id;

    try {
      const ops = [];
      for (const empleadoId of Object.keys(draftScope)) {
        const { excluido, peso } = draftScope[empleadoId];

        const existing = overrides.find(
          (ov) =>
            String(ov.template) === String(tplId) &&
            String(ov.empleado) === String(empleadoId) &&
            Number(ov.year) === Number(year)
        );

        const noOverride =
          !excluido &&
          (peso === null || peso === undefined);

        if (noOverride) {
          if (existing?._id) {
            ops.push(api(`/overrides/${existing._id}`, { method: "DELETE" }));
          }
          continue;
        }

        ops.push(
          api(`/overrides`, {
            method: "POST",
            body: {
              empleado: String(empleadoId),
              year: Number(year),
              template: String(tplId),
              excluido: !!excluido,
              peso:
                peso === "" || peso === null || peso === undefined
                  ? null
                  : Number(peso),
            },
          })
        );
      }

      await Promise.all(ops);
      toast.success("Cambios guardados");
      const ov = await api(`/overrides?year=${Number(year)}`);
      setOverrides(asArray(ov));
      setDraftScope({});
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron guardar los cambios");
    }
  };

  /* --------------------- MODO EMPLEADO --------------------- */
  const [empleadoId, setEmpleadoId] = useState("");
  const [empleadoTemplates, setEmpleadoTemplates] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [draftEmp, setDraftEmp] = useState({});

  // Buscador de empleados
  const [empSearchTerm, setEmpSearchTerm] = useState("");
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (empSearchRef.current && !empSearchRef.current.contains(event.target)) {
        setShowEmpDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!empSearchTerm.trim()) return [];
    const term = empSearchTerm.toLowerCase();
    return empleados
      .filter(e =>
        e.nombre.toLowerCase().includes(term) ||
        e.apellido.toLowerCase().includes(term) ||
        (e.documento && e.documento.includes(term))
      )
      .slice(0, 10);
  }, [empleados, empSearchTerm]);

  const hasChangesEmp = useMemo(
    () => Object.keys(draftEmp).length > 0,
    [draftEmp]
  );

  const setTplDraft = (tplId, patch) => {
    setDraftEmp((prev) => ({ ...prev, [tplId]: { ...(prev[tplId] || {}), ...patch } }));
  };
  const resetChangesEmp = () => setDraftEmp({});

  const saveChangesEmp = async () => {
    if (!empleadoId) return;
    try {
      const ops = [];
      for (const tplId of Object.keys(draftEmp)) {
        const { excluido, peso } = draftEmp[tplId];

        const existing = overrides.find(
          (ov) =>
            String(ov.template) === String(tplId) &&
            String(ov.empleado) === String(empleadoId) &&
            Number(ov.year) === Number(year)
        );

        const noOverride =
          !excluido &&
          (peso === null || peso === undefined);

        if (noOverride) {
          if (existing?._id) {
            ops.push(api(`/overrides/${existing._id}`, { method: "DELETE" }));
          }
          continue;
        }

        ops.push(
          api(`/overrides`, {
            method: "POST",
            body: {
              empleado: String(empleadoId),
              year: Number(year),
              template: String(tplId),
              excluido: !!excluido,
              peso:
                peso === "" || peso === null || peso === undefined
                  ? null
                  : Number(peso),
            },
          })
        );
      }

      await Promise.all(ops);
      toast.success("Cambios guardados");
      const ov = await api(`/overrides?year=${Number(year)}`);
      setOverrides(asArray(ov));
      setDraftEmp({});
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron guardar los cambios");
    }
  };

  /* --------------------- CARGAS (Data Fetching) --------------------- */
  useEffect(() => {
    (async () => {
      try {
        if (user === undefined) return;

        const [dataAreas, dataSectores, dataEmpleados] = await Promise.all([
          fetchAll("/areas"),
          fetchAll("/sectores"),
          fetchAll("/empleados"),
        ]);

        const allAreas = dataAreas;
        const allSectores = dataSectores;
        const allEmps = dataEmpleados;

        const isPrivileged =
          ["superadmin", "rrhh", "directivo"].includes(String(user?.rol || "").toLowerCase()) ||
          user?.isSuper === true ||
          user?.isRRHH === true ||
          user?.isDirectivo === true;

        if (isPrivileged) {
          setAreas(allAreas);
          setSectores(allSectores);
          setEmpleados(allEmps);
          return;
        }

        const referenteAreas = new Set((user?.referenteAreas || []).map(String));
        const referenteSectors = new Set((user?.referenteSectors || []).map(String));
        const userAreaId = user?.areaId ? String(user.areaId) : null;

        const visibleSectores = (allSectores || []).filter((s) => {
          const sId = String(s._id);
          const sAreaId = String(s.areaId?._id || s.areaId);
          if (user?.isJefeArea && userAreaId && userAreaId === sAreaId) return true;
          if (referenteSectors.has(sId)) return true;
          if (referenteAreas.has(sAreaId)) return true;
          return false;
        });

        const visibleAreas = (allAreas || []).filter((a) => {
          const aId = String(a._id);
          if (referenteAreas.has(aId)) return true;
          if (user?.isJefeArea && userAreaId && userAreaId === aId) return true;
          return visibleSectores.some((s) => String(s.areaId?._id || s.areaId) === aId);
        });

        const visibleAreaIds = new Set(visibleAreas.map((a) => String(a._id)));
        const visibleSectorIds = new Set(visibleSectores.map((s) => String(s._id)));

        const visibleEmpleados = (allEmps || []).filter((e) => {
          const empArea = String(e.area?._id || e.area || "");
          const empSector = String(e.sector?._id || e.sector || "");
          if (visibleAreaIds.has(empArea)) return true;
          if (visibleSectorIds.has(empSector)) return true;
          return false;
        });

        setAreas(visibleAreas);
        setSectores(visibleSectores);
        setEmpleados(visibleEmpleados);
      } catch (err) {
        console.error(err);
        toast.error("No se pudieron cargar datos base");
      }
    })();
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const [p, ov] = await Promise.all([
          api(`/participaciones?year=${Number(year)}`),
          api(`/overrides?year=${Number(year)}`),
        ]);
        setParticipaciones(asArray(p));
        setOverrides(asArray(ov));
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar participaciones/overrides");
      }
    })();
  }, [year]);

  // Plantillas por alcance
  useEffect(() => {
    (async () => {
      if (mode !== "scope") return;
      if (!scopeId) {
        setPlantillas([]);
        setSelectedTpl(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          year: String(year),
          scopeType,
          scopeId,
        });
        const data = await api(`/templates?${params.toString()}`);
        setPlantillas(asArray(data));
        setSelectedTpl(null);
        setDraftScope({});
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar plantillas");
      }
    })();
  }, [mode, year, scopeType, scopeId]);

  // Plantillas por empleado (heredadas + propias)
  useEffect(() => {
    (async () => {
      if (mode !== "employee") return;
      if (!empleadoId) {
        setEmpleadoTemplates([]);
        setDraftEmp({});
        return;
      }
      try {
        const emp = empleadosIndex[empleadoId];
        const empAreaId = emp?.area?._id || emp?.area;
        const empSectorId = emp?.sector?._id || emp?.sector;

        const promises = [
          api(`/templates?${new URLSearchParams({
            year: String(year),
            scopeType: "empleado",
            scopeId: String(empleadoId),
          }).toString()}`
          )
        ];

        if (empSectorId) {
          promises.push(
            api(`/templates?${new URLSearchParams({
              year: String(year),
              scopeType: "sector",
              scopeId: String(empSectorId),
            }).toString()}`)
          );
        }

        if (empAreaId) {
          promises.push(
            api(`/templates?${new URLSearchParams({
              year: String(year),
              scopeType: "area",
              scopeId: String(empAreaId),
            }).toString()}`)
          );
        }

        const results = await Promise.all(promises);
        const allTemplates = results.flatMap(asArray);

        const uniqueTemplates = Array.from(new Map(allTemplates.map(item => [item._id, item])).values());

        const finalRows = [];

        uniqueTemplates.forEach((tpl) => {
          const ov = overrides.find(
            (o) =>
              String(o.template) === String(tpl._id) &&
              String(o.empleado) === String(empleadoId) &&
              Number(o.year) === Number(year)
          );

          let scope = "Empleado";
          if (empSectorId && String(tpl.sector) === String(empSectorId)) scope = "Sector";
          if (empAreaId && String(tpl.area) === String(empAreaId)) scope = "Área";

          finalRows.push({
            tpl,
            scopeType: scope,
            scopeId: String(empleadoId),
            base: Number(tpl.pesoBase ?? 0),
            excluido: ov?.excluido ?? false,
            peso: ov?.peso ?? null,
            overrideId: ov?._id || null,
          });
        });

        finalRows.sort(
          (a, b) =>
            (a.tpl.tipo || "").localeCompare(b.tpl.tipo || "") ||
            (a.tpl.nombre || "").localeCompare(b.tpl.nombre || "")
        );

        setEmpleadoTemplates(finalRows);
        setDraftEmp({});
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar plantillas del empleado");
      }
    })();
  }, [mode, empleadoId, year, overrides, empleadosIndex]);

  /* --------------------- sidebar / helpers --------------------- */
  const isActive = (tipo, id = null) => filtro.tipo === tipo && (id === null || filtro.id === id);

  const handleVerTodos = () => {
    setFiltro({ tipo: "todos", id: null, nombre: "Todos" });
    setScopeType("area");
    setScopeId("");
    setSelectedTpl(null);
    setDraftScope({});
    setSearchSel("");
  };

  const handleSelectArea = (area) => {
    setFiltro({ tipo: "area", id: area._id, nombre: area.nombre });
    setScopeType("area");
    setScopeId(String(area._id));
    setSelectedTpl(null);
    setDraftScope({});
    setSearchSel("");
  };

  const handleSelectSector = (sector) => {
    setFiltro({ tipo: "sector", id: sector._id, nombre: sector.nombre });
    setScopeType("sector");
    setScopeId(String(sector._id));
    setSelectedTpl(null);
    setDraftScope({});
    setSearchSel("");
  };

  /* --------------------- RENDER --------------------- */

  const StatusBadge = ({ excluido, onClick }) => {
    if (excluido) {
      return (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Excluido
        </button>
      );
    }
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Incluido
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f9fc] pb-12 relative">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Editor de Asignación y Excepciones
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Ciclo {year} • Gestión de pesos, metas y exclusiones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Year Selector */}
            <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
              <button
                onClick={() => setYear(year - 1)}
                className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-400 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <span className="text-sm font-semibold text-slate-700 w-12 text-center">{year}</span>
              <button
                onClick={() => setYear(year + 1)}
                className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-400 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${mode === "scope"
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
                onClick={() => {
                  setMode("scope");
                  setEmpleadoId("");
                  setEmpleadoTemplates([]);
                  setDraftEmp({});
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                Por Alcance
              </button>
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${mode === "employee"
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
                onClick={() => {
                  setMode("employee");
                  setScopeId("");
                  setSelectedTpl(null);
                  setDraftScope({});
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Por Empleado
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">

        {/* Layout: Sidebar + Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">

          {/* Sidebar */}
          <aside className="space-y-6 sticky top-24">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                Filtros de Estructura
              </h3>

              <div className="space-y-1">
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${filtro.tipo === "todos"
                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-blue-100"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={handleVerTodos}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${filtro.tipo === "todos" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                  </div>
                  Todos los alcances
                </button>
              </div>

              <div className="mt-4 space-y-1">
                {areas.map((area) => {
                  const isOpen = isActive("area", area._id) || isActive("sector") && String(area._id) === String(sectores.find(s => s._id === filtro.id)?.areaId?._id || sectores.find(s => s._id === filtro.id)?.areaId);

                  return (
                    <div key={area._id} className="space-y-1">
                      <button
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all group ${isActive("area", area._id)
                          ? "bg-white text-blue-600 font-semibold shadow-sm ring-1 ring-blue-100"
                          : "text-slate-600 hover:bg-slate-50"
                          }`}
                        onClick={() => handleSelectArea(area)}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center ${isActive("area", area._id) ? "bg-blue-50 text-blue-600" : "bg-white border border-slate-200 text-slate-400 group-hover:border-slate-300"}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7" /><path d="M19 21V7" /><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14" /><line x1="12" x2="12" y1="11" y2="17" /></svg>
                          </div>
                          <span className="truncate">{area.nombre}</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" /></svg>
                      </button>

                      {isOpen && (
                        <div className="pl-11 space-y-1 relative">
                          <div className="absolute left-7 top-0 bottom-0 w-px bg-slate-200"></div>
                          {sectores
                            .filter((s) => String(s?.areaId?._id || s?.areaId) === String(area._id))
                            .map((sector) => (
                              <button
                                key={sector._id}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all relative ${isActive("sector", sector._id)
                                  ? "text-blue-600 font-medium bg-blue-50/50"
                                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                  }`}
                                onClick={() => handleSelectSector(sector)}
                              >
                                {sector.nombre}
                              </button>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main>
            {mode === "scope" ? (
              filtro.tipo === "todos" ? (
                <div className="flex flex-col items-center justify-center h-96 bg-white rounded-2xl border border-dashed border-slate-300 text-center p-8">
                  {/* ... placeholder ... */}
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Seleccioná un alcance</h3>
                  <p className="text-slate-500 max-w-sm">
                    Para comenzar a gestionar plantillas y excepciones, elegí un área o sector del menú lateral.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col xl:flex-row gap-6">
                  {/* Templates List */}
                  <div className="w-full xl:w-72 flex-shrink-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plantillas</h3>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {plantillas.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {/* Groups: Objetivos / Competencias */}
                      {plantillas.filter(p => !['aptitud', 'competencia'].includes(p.tipo?.toLowerCase())).length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                            Objetivos
                          </h4>
                          {plantillas
                            .filter(p => !['aptitud', 'competencia'].includes(p.tipo?.toLowerCase()))
                            .map((p) => {
                              const isSelected = selectedTpl?._id === p._id;
                              return (
                                <button
                                  key={p._id}
                                  onClick={() => {
                                    setSelectedTpl(p);
                                    setDraftScope({});
                                  }}
                                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden ${isSelected
                                    ? "bg-white border-blue-200 shadow-md ring-1 ring-blue-100"
                                    : "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm"
                                    }`}
                                >
                                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}

                                  <div className="flex items-start justify-between mb-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide bg-indigo-50 text-indigo-600">
                                      {p.tipo}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-400">{p.pesoBase ?? 0}%</span>
                                  </div>

                                  <h4 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                    {p.nombre}
                                  </h4>

                                  {p.metodo && (
                                    <p className="text-xs text-slate-400 line-clamp-1">{p.metodo}</p>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}

                      {plantillas.filter(p => ['aptitud', 'competencia'].includes(p.tipo?.toLowerCase())).length > 0 && (
                        <div className="space-y-3 pt-2">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 border-t border-slate-100 pt-3">
                            Competencias
                          </h4>
                          {plantillas
                            .filter(p => ['aptitud', 'competencia'].includes(p.tipo?.toLowerCase()))
                            .map((p) => {
                              const isSelected = selectedTpl?._id === p._id;
                              return (
                                <button
                                  key={p._id}
                                  onClick={() => {
                                    setSelectedTpl(p);
                                    setDraftScope({});
                                  }}
                                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden ${isSelected
                                    ? "bg-white border-blue-200 shadow-md ring-1 ring-blue-100"
                                    : "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm"
                                    }`}
                                >
                                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}

                                  <div className="flex items-start justify-between mb-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide bg-emerald-50 text-emerald-600">
                                      {p.tipo}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-400">{p.pesoBase ?? 0}%</span>
                                  </div>

                                  <h4 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                    {p.nombre}
                                  </h4>

                                  {p.metodo && (
                                    <p className="text-xs text-slate-400 line-clamp-1">{p.metodo}</p>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}


                      {!plantillas.length && (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-sm text-slate-500">No hay plantillas asignadas a este alcance.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Main Details Panel */}
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] mb-20">
                    {selectedTpl ? (
                      <>
                        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                          {/* ... header ... */}
                          <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${selectedTpl.tipo === 'aptitud' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                              {selectedTpl.tipo === 'aptitud'
                                ? <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="22" x2="18" y1="12" y2="12" /><line x1="6" x2="2" y1="12" y2="12" /><line x1="12" x2="12" y1="6" y2="2" /><line x1="12" x2="12" y1="22" y2="18" /></svg>
                              }
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-slate-900">{selectedTpl.nombre}</h2>
                              <p className="text-sm text-slate-500">
                                {filtro.nombre} • Base: <span className="font-semibold text-slate-700">{selectedTpl.pesoBase}%</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                              <input
                                type="text"
                                placeholder="Buscar empleado..."
                                className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 transition-all"
                                value={searchSel}
                                onChange={(e) => setSearchSel(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-auto">
                          <table className="w-full">
                            <thead className="bg-white sticky top-0 z-10">
                              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <th className="text-left px-6 py-4">Empleado</th>
                                <th className="text-center px-6 py-4">Estado</th>
                                <th className="text-center px-6 py-4">Base</th>
                                <th className="text-center px-6 py-4 w-32">Peso Override</th>
                                <th className="text-center px-6 py-4">Peso Final</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {rowsScope.map((r) => (
                                <tr key={r.empleadoId} className="hover:bg-slate-50/80 transition-colors group">
                                  <td className="px-6 py-4">
                                    <div className="font-medium text-slate-700 group-hover:text-slate-900">{r.nombre}</div>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <StatusBadge
                                      excluido={r.excluido}
                                      onClick={() => {
                                        setRowDraftScope(r.empleadoId, { excluido: !r.excluido });
                                      }}
                                    />
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm text-slate-500 font-medium">
                                    {r.base}%
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      disabled={r.excluido}
                                      className={`w-full text-center py-1.5 rounded border text-sm transition-all focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${r.excluido ? 'bg-slate-50 text-slate-300 border-slate-100' :
                                        (r.peso !== null && r.peso !== undefined ? 'border-amber-300 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-700')
                                        }`}
                                      placeholder="-"
                                      value={r.excluido ? "" : r.peso ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setRowDraftScope(r.empleadoId, { peso: val === "" ? null : Number(val) });
                                      }}
                                    />
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={`text-sm font-bold ${r.excluido ? 'text-slate-300' : 'text-slate-700'}`}>
                                      {r.finalPeso}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {!rowsScope.length && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                                    No se encontraron empleados para este criterio.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 p-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Seleccioná una plantilla</h3>
                        <p className="text-slate-500 max-w-xs">
                          Elegí una plantilla de la lista de la izquierda para ver y editar los pesos y metas de los empleados.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Save Bar (Scope Mode) */}
                  <FloatingSaveBar
                    show={hasChangesScope}
                    onSave={saveChangesScope}
                    onDiscard={resetChangesScope}
                  />
                </div>
              )
            ) : (
              /* MODO EMPLEADO */
              <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden mb-20 min-h-[500px]">
                <div className="p-3 border-b bg-muted/20">
                  <h3 className="text-sm font-semibold">
                    {empleadoId
                      ? `Plantillas del empleado · ${empleadosIndex[empleadoId]?.apellido || ""
                      }, ${empleadosIndex[empleadoId]?.nombre || ""}`
                      : "Seleccioná un empleado"}
                  </h3>
                </div>

                <div className="p-4 border-b bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                    {/* ... Filters ... */}
                    <button
                      onClick={() => setFilterType('all')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterType === 'all' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFilterType('objetivo')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterType === 'objetivo' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      Objetivos
                    </button>
                    <button
                      onClick={() => setFilterType('aptitud')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterType === 'aptitud' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      Competencias
                    </button>
                  </div>

                  <div className="w-full md:w-80 relative" ref={empSearchRef}>
                    {/* Búsqueda inteligente */}
                    {!empleadoId ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        </div>
                        <input
                          type="text"
                          className="w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          placeholder="Buscar empleado..."
                          value={empSearchTerm}
                          onChange={(e) => {
                            setEmpSearchTerm(e.target.value);
                            setShowEmpDropdown(true);
                          }}
                          onFocus={() => setShowEmpDropdown(true)}
                        />

                        {/* Dropdown de resultados */}
                        {showEmpDropdown && empSearchTerm && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-100 z-50 max-h-60 overflow-y-auto">
                            {filteredEmployees.length > 0 ? (
                              <ul className="py-1">
                                {filteredEmployees.map(emp => (
                                  <li key={emp._id}>
                                    <button
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 flex flex-col"
                                      onClick={() => {
                                        setEmpleadoId(emp._id);
                                        setEmpSearchTerm("");
                                        setShowEmpDropdown(false);
                                      }}
                                    >
                                      <span className="text-sm font-medium text-slate-700">{emp.apellido}, {emp.nombre}</span>
                                      <span className="text-xs text-slate-400">{emp.documento || "Sin DNI"}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="px-4 py-3 text-sm text-slate-500 text-center">
                                No se encontraron empleados.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-md px-3 py-1.5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                            {empleadosIndex[empleadoId]?.nombre?.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-blue-900 truncate">
                            {empleadosIndex[empleadoId]?.apellido}, {empleadosIndex[empleadoId]?.nombre}
                          </span>
                        </div>
                        <button
                          onClick={() => setEmpleadoId("")}
                          className="p-1 hover:bg-blue-100 rounded-full text-blue-400 hover:text-blue-600 transition-colors ml-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-0 overflow-x-auto min-h-[400px]">
                  {empleadoId ? (
                    <table className="w-full text-sm table-auto border-colapse">
                      <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-200">
                        <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-bold">
                          <th className="text-left px-6 py-4">Plantilla / Objetivo</th>
                          <th className="text-center px-6 py-4">Estado</th>
                          <th className="text-center px-6 py-4">Base</th>
                          <th className="text-center px-6 py-4 w-32">Peso Override</th>
                          <th className="text-center px-6 py-4">Peso Final</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {empleadoTemplates
                          .filter(row => {
                            if (filterType === 'all') return true;
                            if (filterType === 'aptitud') return ['aptitud', 'competencia'].includes(row.tpl.tipo?.toLowerCase());
                            if (filterType === 'objetivo') return !['aptitud', 'competencia'].includes(row.tpl.tipo?.toLowerCase());
                            return true;
                          })
                          .map((row) => {
                            const base = Number(row.base ?? 0);
                            const isOverridden =
                              !row.excluido && row.peso != null && Number(row.peso) !== base;
                            const finalPeso = row.excluido
                              ? 0
                              : Number((row.peso ?? base).toFixed(2));

                            const excluidoActual =
                              draftEmp[row.tpl._id]?.excluido ?? row.excluido;

                            return (
                              <tr
                                key={row.tpl._id}
                                className="group hover:bg-slate-50/50 transition-colors"
                              >
                                <td className="px-6 py-4">
                                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                                    <span>{row.tpl.nombre}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${['aptitud', 'competencia'].includes(row.tpl.tipo?.toLowerCase())
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : 'bg-indigo-50 text-indigo-600'
                                      }`}>
                                      {row.tpl.tipo}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 bg-slate-100 rounded">
                                      {row.scopeType}
                                    </span>
                                  </div>
                                </td>

                                <td className="px-6 py-4 text-center">
                                  <StatusBadge
                                    excluido={excluidoActual}
                                    onClick={() => {
                                      setTplDraft(row.tpl._id, { excluido: !excluidoActual });
                                    }}
                                  />
                                </td>

                                <td className="px-6 py-4 text-center font-medium text-slate-500">{base}%</td>

                                <td className="px-6 py-4 text-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.01}
                                    className={`w-full text-center py-1.5 rounded border text-sm transition-all focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${excluidoActual ? 'bg-slate-50 text-slate-300 border-slate-100' :
                                      (draftEmp[row.tpl._id]?.peso !== undefined || (row.peso !== null && row.peso !== undefined) ? 'border-amber-300 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-700')
                                      }`}
                                    value={
                                      excluidoActual
                                        ? ""
                                        : draftEmp[row.tpl._id]?.peso ?? row.peso ?? ""
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTplDraft(row.tpl._id, {
                                        peso: val === "" ? null : Number(val),
                                      });
                                    }}
                                    disabled={!!excluidoActual}
                                    placeholder={String(base)}
                                    title="Dejar vacío para usar el peso base"
                                  />
                                </td>
                                <td className="px-6 py-4 font-bold text-center text-slate-700">{finalPeso}%</td>
                              </tr>
                            );
                          })}
                        {!empleadoTemplates.length && (
                          <tr>
                            <td className="px-6 py-12 text-center text-slate-400" colSpan={5}>
                              No hay plantillas que apliquen a este empleado para el año
                              seleccionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">Seleccioná un empleado</h3>
                      <p className="text-slate-500 text-sm mt-1">
                        Buscá un empleado para ver y gestionar sus plantillas y excepciones personalizadas.
                      </p>
                    </div>
                  )}
                </div>

                {/* Save Bar (Employee Mode) */}
                <FloatingSaveBar
                  show={hasChangesEmp}
                  onSave={saveChangesEmp}
                  onDiscard={resetChangesEmp}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
