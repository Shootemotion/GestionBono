// src/pages/EditorAsignacion.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
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

/* ================== componente ================== */

export default function EditorAsignacion() {
  const currentYear = new Date().getFullYear();

  /* Estado base */
  const [year, setYear] = useState(currentYear);
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [participaciones, setParticipaciones] = useState([]);
  const [overrides, setOverrides] = useState([]);

  // Filtro de estructura (igual concepto que en Nómina)
  const [filtro, setFiltro] = useState({ tipo: "todos", id: null, nombre: "Todos" });

  // Modo de trabajo
  const [mode, setMode] = useState("scope"); // 'scope' | 'employee'

  // auth para aplicar mismo filtro de visibilidad que Nómina
  const { user } = useAuth();

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

  // Borrador por empleado (solo para el item seleccionado)
  // { empleadoId: { excluido?:bool, peso?:number|null, meta?:number|null } }
  const [draftScope, setDraftScope] = useState({});

  // Filtro de búsqueda para la tabla derecha
  const [searchSel, setSearchSel] = useState("");

  // Empleados alcanzados por el alcance (área/sector)
  const empleadosEnScope = useMemo(() => {
    if (!scopeId) return [];
    if (scopeType === "sector") {
      return empleados
        .filter((e) => String(e?.sector?._id || e?.sector) === String(scopeId))
        .map((e) => ({ empleadoId: String(e._id) }));
    }
    // área
    return empleados
      .filter((e) => String(e?.area?._id || e?.area) === String(scopeId))
      .map((e) => ({ empleadoId: String(e._id) }));
  }, [empleados, scopeId, scopeType]);

  // Filas panel derecho (aplica overrides guardados + borradores locales + filtro búsqueda)
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
        const meta = d.meta !== undefined ? d.meta : ov?.meta ?? null;

        const base = Number(selectedTpl.pesoBase ?? 0);
        const finalPeso = excluido ? 0 : Number((peso ?? base).toFixed(2));
        const isOverridden = !excluido && peso != null && Number(peso) !== base;

        const nombre = `${empleadosIndex[empleadoId]?.apellido || ""}, ${
          empleadosIndex[empleadoId]?.nombre || ""
        }`.trim();

        return {
          empleadoId,
          nombre,
          base,
          excluido,
          peso,
          meta,
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
        const { excluido, peso, meta } = draftScope[empleadoId];

        const existing = overrides.find(
          (ov) =>
            String(ov.template) === String(tplId) &&
            String(ov.empleado) === String(empleadoId) &&
            Number(ov.year) === Number(year)
        );

        const noOverride =
          !excluido &&
          (peso === null || peso === undefined) &&
          (meta === null || meta === undefined);

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
              meta:
                meta === "" || meta === null || meta === undefined
                  ? null
                  : Number(meta),
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
  const [draftEmp, setDraftEmp] = useState({}); // { tplId: { excluido?, peso?, meta? } }
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
        const { excluido, peso, meta } = draftEmp[tplId];

        const existing = overrides.find(
          (ov) =>
            String(ov.template) === String(tplId) &&
            String(ov.empleado) === String(empleadoId) &&
            Number(ov.year) === Number(year)
        );

        const noOverride =
          !excluido &&
          (peso === null || peso === undefined) &&
          (meta === null || meta === undefined);

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
              meta:
                meta === "" || meta === null || meta === undefined
                  ? null
                  : Number(meta),
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

  /* --------------------- CARGAS (mismo criterio que Nómina) --------------------- */
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

  // Plantillas por alcance (solo si NO estamos en "todos")
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

  // Plantillas que aplican al empleado (modo employee)
  useEffect(() => {
    (async () => {
      if (mode !== "employee") return;
      if (!empleadoId) {
        setEmpleadoTemplates([]);
        setDraftEmp({});
        return;
      }
      try {
        const employeeTpls = asArray(
          await api(
            `/templates?${new URLSearchParams({
              year: String(year),
              scopeType: "empleado",
              scopeId: String(empleadoId),
            }).toString()}`
          )
        );

        const all = [];

        employeeTpls.forEach((tpl) => {
          const ov = overrides.find(
            (o) =>
              String(o.template) === String(tpl._id) &&
              String(o.empleado) === String(empleadoId) &&
              Number(o.year) === Number(year)
          );
          all.push({
            tpl,
            scopeType: "empleado",
            scopeId: String(empleadoId),
            base: Number(tpl.pesoBase ?? 0),
            excluido: ov?.excluido ?? false,
            peso: ov?.peso ?? null,
            meta: ov?.meta ?? null,
            overrideId: ov?._id || null,
          });
        });

        all.sort(
          (a, b) =>
            (a.tpl.tipo || "").localeCompare(b.tpl.tipo || "") ||
            (a.tpl.nombre || "").localeCompare(b.tpl.nombre || "")
        );

        setEmpleadoTemplates(all);
        setDraftEmp({});
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar plantillas del empleado");
      }
    })();
  }, [mode, empleadoId, year, overrides]);

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

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      {/* Header principal + modos */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Editor de Asignación</h1>
          <p className="text-sm text-muted-foreground">
            Excluí o ajustá pesos y metas del objetivo/aptitud seleccionado. Cambios por año.
          </p>
        </div>

        <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-1 flex gap-1">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm ${
              mode === "scope" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => {
              setMode("scope");
              setEmpleadoId("");
              setEmpleadoTemplates([]);
              setDraftEmp({});
            }}
          >
            Por alcance
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm ${
              mode === "employee" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => {
              setMode("employee");
              setScopeId("");
              setSelectedTpl(null);
              setDraftScope({});
            }}
          >
            Por empleado
          </button>
        </div>
      </div>

      {/* Layout: sidebar estructura + contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* Sidebar con mismo estilo de Nómina */}
        <aside className="space-y-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1">
          <div className="sticky top-0 z-30">
            <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
              <button
                className="w-full text-left text-sm rounded-lg px-3 py-2 border bg-background/30 border-border shadow-sm hover:bg-accent hover:text-foreground hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={handleVerTodos}
                title="Ver todos"
              >
                Ver todos los alcances
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
            <ul className="space-y-2">
              {areas.map((area) => (
                <li key={area._id} className="rounded-lg ring-1 ring-border/60 bg-background">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button
                      className={`w-full text-left font-medium rounded-md px-2 py-1 transition-all ${
                        isActive("area", area._id)
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/60"
                      } hover:ring-1 hover:ring-primary/20`}
                      onClick={() => handleSelectArea(area)}
                      title="Filtrar por esta área"
                    >
                      {area.nombre}
                    </button>
                  </div>

                  <ul className="px-2 pb-2 space-y-1.5">
                    {sectores
                      .filter((s) => String(s?.areaId?._id || s?.areaId) === String(area._id))
                      .map((sector) => (
                        <li key={sector._id} className="rounded-md">
                          <button
                            className={`w-full text-left text-sm rounded-md px-3 py-1.5 transition-all ${
                              isActive("sector", sector._id)
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            } hover:ring-1 hover:ring-primary/20`}
                            onClick={() => handleSelectSector(sector)}
                            title="Filtrar por este sector"
                          >
                            {sector.nombre}
                          </button>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Contenido principal */}
        <div className="space-y-4">
          {/* Filtros superiores (año + búsqueda) */}
          <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">
                  {mode === "scope"
                    ? `Overrides por alcance · ${filtro.nombre}`
                    : "Overrides por empleado"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {mode === "scope"
                    ? "Elegí un área o sector en el lateral y después una plantilla."
                    : "Elegí un empleado para ver todos sus objetivos/aptitudes."}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Año</label>
                  <input
                    type="number"
                    className="w-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={year}
                    onChange={(e) =>
                      setYear(Number(e.target.value || currentYear))
                    }
                  />
                </div>

                {mode === "scope" && (
                  <div className="hidden md:flex flex-col min-w-[220px]">
                    <label className="text-xs text-muted-foreground">Buscar empleado</label>
                    <input
                      value={searchSel}
                      onChange={(e) => setSearchSel(e.target.value)}
                      placeholder="Apellido, nombre o apodo…"
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {mode === "scope" && (
              <div className="mt-3 md:hidden">
                <label className="text-xs text-muted-foreground">Buscar empleado</label>
                <input
                  value={searchSel}
                  onChange={(e) => setSearchSel(e.target.value)}
                  placeholder="Apellido, nombre o apodo…"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {/* Contenido según modo */}
          {mode === "scope" ? (
            filtro.tipo === "todos" ? (
              // Cuando estás viendo TODOS, no mostramos objetivos/aptitudes ni tabla
              <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-4 text-sm text-muted-foreground">
                Seleccioná un área o un sector en el panel izquierdo para ver las plantillas
                (objetivos/aptitudes) y sus empleados.  
                Mientras estés en <strong>Todos</strong>, no se muestran sumas ni detalles.
              </div>
            ) : (
              // Layout: plantillas + tabla (solo si hay área/sector seleccionado)
              <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,2.25fr)] gap-6">
                {/* Izquierda: plantillas */}
                <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Plantillas del alcance</h3>
                    <span className="text-xs text-muted-foreground">
                      {plantillas.length} ítems
                    </span>
                  </div>
                  <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {plantillas.map((p) => (
                      <li key={p._id}>
                        <button
                          className={`w-full text-left rounded-md px-3 py-2 border transition-colors ${
                            selectedTpl?._id === p._id
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-background border-border hover:bg-muted/60"
                          }`}
                          onClick={() => {
                            setSelectedTpl(p);
                            setDraftScope({});
                          }}
                        >
                          <div className="font-medium">{p.nombre}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span className="px-2 py-0.5 rounded-full bg-background/60 ring-1 ring-border/60">
                              {p.tipo}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-background/60 ring-1 ring-border/60">
                              Peso base {p.pesoBase ?? 0}%
                            </span>
                            {p.metodo && (
                              <span className="px-2 py-0.5 rounded-full bg-background/60 ring-1 ring-border/60">
                                {p.metodo}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                    {!plantillas.length && (
                      <li className="text-sm text-muted-foreground px-1">
                        No hay plantillas para este alcance.
                      </li>
                    )}
                  </ul>
                </div>

                {/* Derecha: overrides */}
                <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden min-w-0">
                  <div className="p-3 border-b bg-muted/20">
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                      {selectedTpl ? `Empleados – ${selectedTpl.nombre}` : "Seleccioná una plantilla"}
                    </h3>
                  </div>

                  <div className="p-0 overflow-x-auto">
                    {selectedTpl ? (
                      <table className="w-full text-sm table-auto">
                        <thead className="sticky top-0 bg-card z-10 shadow-sm">
                          <tr className="text-[11px] uppercase text-muted-foreground tracking-wide">
                            <th className="text-left px-3 py-2">Empleado</th>
                            <th className="text-center px-3 py-2">Base</th>
                            <th className="text-center px-3 py-2">Override</th>
                            <th className="text-center px-3 py-2">Final</th>
                            <th className="text-center px-3 py-2">Meta base</th>
                            <th className="text-center px-3 py-2">Meta override</th>
                            <th className="text-center px-3 py-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsScope.map((r) => (
                            <tr
                              key={r.empleadoId}
                              className="border-t border-border/50 odd:bg-background even:bg-muted/40 hover:bg-accent/30 transition"
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate">{r.nombre}</span>
                                  {r.isOverridden && !r.excluido && (
                                    <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 ring-1 ring-amber-200">
                                      Override
                                    </span>
                                  )}
                                  {r.excluido && (
                                    <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 ring-1 ring-rose-200">
                                      Excluido
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2 text-center">{r.base}%</td>

                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  className="w-16 text-right rounded-md border border-border bg-background px-2 py-1 placeholder:text-muted-foreground disabled:bg-muted/40 disabled:text-muted-foreground"
                                  value={r.excluido ? "" : r.peso ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setRowDraftScope(r.empleadoId, {
                                      peso: val === "" ? null : Number(val),
                                    });
                                  }}
                                  disabled={!!r.excluido}
                                  placeholder={String(r.base)}
                                  title="Dejar vacío para usar el peso base"
                                />
                              </td>

                              <td className="px-3 py-2 text-center font-medium">
                                {r.finalPeso}%
                              </td>

                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                {selectedTpl?.target
                                  ? `${selectedTpl.target} ${selectedTpl.unidad || ""}`
                                  : "—"}
                              </td>

                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="w-16 text-right rounded-md border border-border bg-background px-2 py-1 placeholder:text-muted-foreground disabled:bg-muted/40 disabled:text-muted-foreground"
                                  value={r.excluido ? "" : r.meta ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setRowDraftScope(r.empleadoId, {
                                      meta: val === "" ? null : Number(val),
                                    });
                                  }}
                                  disabled={!!r.excluido}
                                  placeholder={selectedTpl?.target ? String(selectedTpl.target) : "—"}
                                  title="Dejar vacío para usar la meta base"
                                />
                              </td>

                              <td className="px-3 py-2 text-center">
                                <label className="inline-flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={!!r.excluido}
                                    onChange={(e) => {
                                      const ex = e.target.checked;
                                      setRowDraftScope(r.empleadoId, {
                                        excluido: ex,
                                        ...(ex ? { peso: null, meta: null } : {}),
                                      });
                                    }}
                                  />
                                  <span className="text-muted-foreground">Excluir</span>
                                </label>
                              </td>
                            </tr>
                          ))}

                          {!rowsScope.length && (
                            <tr>
                              <td
                                className="px-3 py-4 text-muted-foreground text-center"
                                colSpan={7}
                              >
                                No hay empleados para este alcance / criterio de búsqueda.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-3 text-sm text-muted-foreground">
                        Elegí una plantilla del listado izquierdo.
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t bg-card flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={resetChangesScope}
                      disabled={!hasChangesScope}
                    >
                      Descartar cambios
                    </Button>
                    <Button
                      onClick={saveChangesScope}
                      disabled={!hasChangesScope || !selectedTpl}
                    >
                      Guardar cambios
                    </Button>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* MODO EMPLEADO */
            <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden">
              <div className="p-3 border-b bg-muted/20">
                <h3 className="text-sm font-semibold">
                  {empleadoId
                    ? `Plantillas del empleado · ${
                        empleadosIndex[empleadoId]?.apellido || ""
                      }, ${empleadosIndex[empleadoId]?.nombre || ""}`
                    : "Seleccioná un empleado"}
                </h3>
              </div>

              {/* selector de empleado */}
              <div className="p-3 border-b bg-card flex flex-wrap gap-3 items-center">
                <div className="w-full md:w-80">
                  <label className="text-xs text-muted-foreground">Empleado</label>
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={empleadoId}
                    onChange={(e) => setEmpleadoId(e.target.value)}
                  >
                    <option value="">Seleccioná…</option>
                    {empleados
                      .slice()
                      .sort((a, b) =>
                        `${a.apellido}, ${a.nombre}`.localeCompare(
                          `${b.apellido}, ${b.nombre}`
                        )
                      )
                      .map((e) => (
                        <option key={e._id} value={e._id}>
                          {e.apellido}, {e.nombre} {e.apodo ? `(${e.apodo})` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="p-0 overflow-x-auto">
                {empleadoId ? (
                  <table className="w-full text-sm table-auto">
                    <thead className="sticky top-0 bg-card z-10 shadow-sm">
                      <tr className="text-[11px] uppercase text-muted-foreground tracking-wide">
                        <th className="text-left px-3 py-2">Plantilla</th>
                        <th className="text-left px-3 py-2">Alcance</th>
                        <th className="text-left px-3 py-2">Base</th>
                        <th className="text-left px-3 py-2">Override</th>
                        <th className="text-left px-3 py-2">Final</th>
                        <th className="text-left px-3 py-2">Meta base</th>
                        <th className="text-left px-3 py-2">Meta override</th>
                        <th className="text-left px-3 py-2">Excluir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empleadoTemplates.map((row) => {
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
                            className="border-t border-border/60 odd:bg-background even:bg-muted/20 hover:bg-accent/30"
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium flex items-center gap-2">
                                <span>{row.tpl.nombre}</span>
                                {isOverridden && !row.excluido && (
                                  <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 ring-1 ring-amber-200">
                                    Override
                                  </span>
                                )}
                                {row.excluido && (
                                  <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 ring-1 ring-rose-200">
                                    Excluido
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.tpl.tipo} · {row.tpl.metodo || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {row.scopeType === "sector"
                                ? "Sector"
                                : row.scopeType === "area"
                                ? "Área"
                                : "Empleado"}
                            </td>
                            <td className="px-3 py-2">{base}%</td>

                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right placeholder:text-muted-foreground disabled:bg-muted/40 disabled:text-muted-foreground"
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
                            <td className="px-3 py-2 font-medium">{finalPeso}%</td>

                            <td className="px-3 py-2">
                              {row.tpl?.target
                                ? `${row.tpl.target} ${row.tpl.unidad || ""}`
                                : "—"}
                            </td>

                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right placeholder:text-muted-foreground disabled:bg-muted/40 disabled:text-muted-foreground"
                                value={
                                  excluidoActual
                                    ? ""
                                    : draftEmp[row.tpl._id]?.meta ?? row.meta ?? ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTplDraft(row.tpl._id, {
                                    meta: val === "" ? null : Number(val),
                                  });
                                }}
                                disabled={!!excluidoActual}
                                placeholder={
                                  row.tpl?.target ? String(row.tpl.target) : "—"
                                }
                                title="Dejar vacío para usar la meta base"
                              />
                            </td>

                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={!!excluidoActual}
                                onChange={(e) =>
                                  setTplDraft(row.tpl._id, {
                                    excluido: e.target.checked,
                                    ...(e.target.checked
                                      ? { peso: null, meta: null }
                                      : {}),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {!empleadoTemplates.length && (
                        <tr>
                          <td className="px-3 py-4 text-muted-foreground" colSpan={8}>
                            No hay plantillas que apliquen a este empleado para el año
                            seleccionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-3 text-sm text-muted-foreground">
                    Elegí un empleado arriba.
                  </div>
                )}
              </div>

              <div className="p-3 border-t bg-card flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={resetChangesEmp}
                  disabled={!hasChangesEmp}
                >
                  Descartar cambios
                </Button>
                <Button
                  onClick={saveChangesEmp}
                  disabled={!hasChangesEmp || !empleadoId}
                >
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
