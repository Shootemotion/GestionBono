// src/pages/GestionPlantillas.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import usePlantillas from "@/hooks/usePlantillas";
import PlantillasList from "@/components/PlantillasList";
import PlantillaModal from "@/components/PlantillaModal";
import CloneModal from "@/components/CloneModal";
import useCan from "@/hooks/useCan";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";


// helper de paginación robusto
async function fetchAll(path, { pageSize = 200, params = {} } = {}) {
  const out = [];
  let page = 1;

  const [base, existing] = path.split("?");
  const baseQS = new URLSearchParams(existing || "");
  Object.entries(params).forEach(([k, v]) => baseQS.set(k, String(v)));

  for (; ;) {
    const qs = new URLSearchParams(baseQS);
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));

    const url = `${base}?${qs.toString()}`;
    const data = await api(url);

    const chunk =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.docs)
            ? data.docs
            : [];

    out.push(...chunk);

    const total = Number(data?.total ?? data?.count ?? 0);
    const ps = Number(data?.pageSize ?? data?.limit ?? pageSize);
    const cur = Number(data?.page ?? page);

    if (total && cur * ps < total) {
      page += 1;
      continue;
    }
    if (!total && chunk.length === ps) {
      page += 1;
      continue;
    }
    break;
  }

  return out;
}

// Normalizador genérico: lo que venga del back → array
const normAny = (res) =>
  Array.isArray(res)
    ? res
    : Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.results)
          ? res.results
          : Array.isArray(res?.rows)
            ? res.rows
            : [];

const MAX_LIST = 2000;

const qsFromObj = (o) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(o).filter(([_, v]) => v !== undefined && v !== "")
    )
  ).toString();

export default function GestionPlantillasPage() {
  const { user } = useAuth();
  const nav = useNavigate();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [empleados, setEmpleados] = useState([]); // empleados

  // Alcance: "area" | "sector" (o vacío para todos)
  const [scopeType, setScopeType] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("activas"); // activas | inactivas | todos
  // dentro del componente
  const [refreshKey, setRefreshKey] = useState(0);

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [modalFormType, setModalFormType] = useState(null); // 'objetivo' | 'aptitud'
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTpl, setCloneTpl] = useState(null);

  // 🔎 buscador de empleado (compartido, pero con input en header y sidebar)
  const [empleadoId, setEmpleadoId] = useState("");

  const [empQueryHeader, setEmpQueryHeader] = useState("");
  const [empOpenHeader, setEmpOpenHeader] = useState(false);
  const empBoxHeaderRef = useRef(null);

  const [empQuerySidebar, setEmpQuerySidebar] = useState("");
  const [empOpenSidebar, setEmpOpenSidebar] = useState(false);
  const empBoxSidebarRef = useRef(null);

  const selectedEmpleado = useMemo(
    () => empleados.find((e) => String(e._id) === String(empleadoId)) || null,
    [empleados, empleadoId]
  );

  const filterEmpleados = (q) => {
    const txt = q.trim().toLowerCase();
    if (!txt) return empleados.slice(0, MAX_LIST);
    return empleados
      .filter((e) => {
        const n = `${e?.apellido ?? ""} ${e?.nombre ?? ""}`.toLowerCase();
        const a = (e?.apodo ?? "").toLowerCase();
        return n.includes(txt) || a.includes(txt);
      })
      .slice(0, MAX_LIST);
  };


  const empleadosFiltradosHeader = useMemo(
    () => filterEmpleados(empQueryHeader),
    [empQueryHeader, empleados]
  );

  const empleadosFiltradosSidebar = useMemo(
    () => filterEmpleados(empQuerySidebar),
    [empQuerySidebar, empleados]
  );


  // cerrar dropdowns al click afuera
  useEffect(() => {
    function handleClickOutside(ev) {
      const target = ev.target;
      const inHeader =
        empBoxHeaderRef.current &&
        empBoxHeaderRef.current.contains(target);
      const inSidebar =
        empBoxSidebarRef.current &&
        empBoxSidebarRef.current.contains(target);

      if (!inHeader && !inSidebar) {
        setEmpOpenHeader(false);
        setEmpOpenSidebar(false);
      }
    }

    if (empOpenHeader || empOpenSidebar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [empOpenHeader, empOpenSidebar]);


  // Permisos
  const isDirectivo =
    user?.isDirectivo || user?.rol === "director" || user?.rol === "directivo";


  const permisos = {
    canCreateObjetivo: isDirectivo || useCan("objetivos:crear").ok,
    canCreateAptitud: isDirectivo || useCan("aptitudes:crear").ok,
    canEditObjetivo: isDirectivo || useCan("objetivos:editar").ok,
    canEditAptitud: isDirectivo || useCan("aptitudes:editar").ok,
    canDeleteObjetivo: isDirectivo || useCan("objetivos:eliminar").ok,
    canDeleteAptitud: isDirectivo || useCan("aptitudes:eliminar").ok,
  };

  // Catálogos
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);

  // ✅ Carga catálogos + empleados
  useEffect(() => {
    (async () => {
      // 1) Áreas y sectores
      try {
        const [a, s] = await Promise.all([api("/areas"), api("/sectores")]);

        const areasN = normAny(a);
        const sectoresN = normAny(s);

        setAreas(areasN);
        setSectores(sectoresN);

        window.__AREAS__ = areasN;
        window.__SECTORES__ = sectoresN;
      } catch (err) {
        console.error("❌ Error cargando áreas/sectores:", err);
        toast.error("No se pudieron cargar áreas/sectores");
      }

      // 2) Empleados
      try {
        const e = await fetchAll("/empleados", {
          pageSize: 500,
          params: { visibility: "all" },
        });

        const empleadosN = Array.isArray(e) ? e : [];
        setEmpleados(
          empleadosN.map((x) => ({ ...x, _id: String(x._id ?? x.id) }))
        );

        window.__EMPLEADOS__ = empleadosN;
      } catch (err) {
        console.error("❌ Error cargando empleados:", err);
        toast.error("No se pudieron cargar empleados");
      }
    })();
  }, []);

  // Alcance inicial según rol
  useEffect(() => {
    if (!user) return;
    const esAmplio = user.isSuper || user.isRRHH || user.isDirectivo;
    if (esAmplio) {
      setScopeType("");
      setScopeId("");
      return;
    }

    const refSectors = Array.isArray(user.referenteSectors)
      ? user.referenteSectors.map(String)
      : [];
    const refAreas = Array.isArray(user.referenteAreas)
      ? user.referenteAreas.map(String)
      : [];

    if (user.isJefeSector || refSectors.length > 0 || user.sectorId) {
      const candidate =
        refSectors[0] || (user.sectorId ? String(user.sectorId) : "");
      if (candidate) {
        setScopeType("sector");
        setScopeId(candidate);
        return;
      }
    }

    if (user.isJefeArea || refAreas.length > 0 || user.areaId) {
      const candidate =
        refAreas[0] || (user.areaId ? String(user.areaId) : "");
      if (candidate) {
        setScopeType("area");
        setScopeId(candidate);
        return;
      }
    }

    setScopeType("");
    setScopeId("");
  }, [user]);

  // Hook de plantillas (back ya filtra por estos params)
  const hookParams = useMemo(
    () => ({
      year,
      scopeType: scopeType || undefined,
      scopeId: scopeId || undefined,
      tipoFiltro,
    }),
    [year, scopeType, scopeId, tipoFiltro, refreshKey]
  );
  const hook = usePlantillas(hookParams);
  const { loading, reload, addLocal, updateLocal, removeLocal } = hook;

  const [plantillasByEmpRaw, setPlantillasByEmpRaw] = useState(null); // sin filtrar por overrides
  const [plantillasSector, setPlantillasSector] = useState(null); // cascada sector+área
  const [allPlantillas, setAllPlantillas] = useState(null); // modo “todas”
  const [empOverrides, setEmpOverrides] = useState([]); // overrides del empleado/año
  // Helper para normalizar respuestas a array

  const norm = (res) =>
    Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.results)
            ? res.results
            : Array.isArray(res?.rows)
              ? res.rows
              : [];

  // 🔁 Cascada: SECTOR -> sector + área padre (solo si NO hay empleado)
  useEffect(() => {
    (async () => {
      if (empleadoId) {
        setPlantillasSector(null);
        return;
      }
      if (scopeType !== "sector" || !scopeId) {
        setPlantillasSector(null);
        return;
      }

      try {
        const sectorObj = sectores.find(
          (s) => String(s._id) === String(scopeId)
        );
        const areaId = String(
          sectorObj?.areaId?._id || sectorObj?.areaId || ""
        );

        const calls = [
          api(
            `/templates?${qsFromObj({
              year,
              scopeType: "sector",
              scopeId: String(scopeId),
            })}`
          ),
        ];
        if (areaId) {
          calls.push(
            api(
              `/templates?${qsFromObj({
                year,
                scopeType: "area",
                scopeId: areaId,
              })}`
            )
          );
        }

        const results = await Promise.all(calls);
        const merged = results.flatMap(norm);
        const uniq = Object.values(
          merged.reduce((acc, tpl) => {
            acc[String(tpl._id)] = tpl;
            return acc;
          }, {})
        );
        setPlantillasSector(uniq);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar plantillas del sector/área");
        setPlantillasSector([]);
      }
    })();
  }, [year, scopeType, scopeId, empleadoId, sectores, refreshKey]);


  // 🔁 Empleado: empleado + sector + área (sin aplicar overrides todavía)
  useEffect(() => {
    (async () => {
      if (!empleadoId) {
        setPlantillasByEmpRaw(null);
        return;
      }
      try {
        const areaId = String(
          selectedEmpleado?.area?._id ?? selectedEmpleado?.area ?? ""
        );
        const sectorId = String(
          selectedEmpleado?.sector?._id ?? selectedEmpleado?.sector ?? ""
        );

        const calls = [];
        if (areaId) {
          calls.push(
            api(
              `/templates?${qsFromObj({
                year,
                scopeType: "area",
                scopeId: areaId,
              })}`
            )
          );
        }
        if (sectorId) {
          calls.push(
            api(
              `/templates?${qsFromObj({
                year,
                scopeType: "sector",
                scopeId: sectorId,
              })}`
            )
          );
        }
        calls.push(
          api(
            `/templates?${qsFromObj({
              year,
              scopeType: "empleado",
              scopeId: empleadoId,
            })}`
          )
        );

        const arrays = await Promise.all(calls);
        const merged = [...arrays.flatMap(norm)];
        const uniq = Object.values(
          merged.reduce((acc, tpl) => {
            acc[String(tpl._id)] = tpl;
            return acc;
          }, {})
        );
        setPlantillasByEmpRaw(uniq);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar plantillas del empleado");
        setPlantillasByEmpRaw([]);
      }
    })();
  }, [empleadoId, selectedEmpleado, year, refreshKey]);

  // Aplica overrides del empleado a las plantillas heredadas (oculta excluidas y marca overrides)
  const plantillasByEmp = useMemo(() => {
    if (plantillasByEmpRaw === null) return null;
    if (!empleadoId) return plantillasByEmpRaw;

    if (!empOverrides || empOverrides.length === 0) return plantillasByEmpRaw;

    const withOv = plantillasByEmpRaw.map((tpl) => {
      const ov = empOverrides.find(
        (o) =>
          String(o.template) === String(tpl._id) &&
          String(o.empleado) === String(empleadoId) &&
          Number(o.year) === Number(year)
      );

      if (!ov) return tpl;

      const basePeso = Number(tpl.pesoBase ?? 0);
      const hasPesoOverride =
        ov.peso !== null &&
        ov.peso !== undefined &&
        Number(ov.peso) !== basePeso;

      const baseMeta = tpl.target;
      const hasMetaOverride =
        ov.meta !== null &&
        ov.meta !== undefined &&
        ov.meta !== baseMeta;

      return {
        ...tpl,
        __override: ov,
        __excluido: !!ov.excluido,
        __hasOverride: !ov.excluido && (hasPesoOverride || hasMetaOverride),
      };
    });

    // 💥 acá se ocultan los excluidos
    return withOv.filter((tpl) => !tpl.__excluido);
  }, [plantillasByEmpRaw, empOverrides, empleadoId, year, refreshKey]);

  // 🔁 Fallback: TODAS (unión area/sector/empleado) cuando no hay alcance ni empleado
  useEffect(() => {
    (async () => {
      if (empleadoId || scopeType || scopeId) {
        setAllPlantillas(null);
        return;
      }
      try {
        setAllPlantillas("loading");
        const base = {
          year,
          tipoFiltro, // Backend now requires explicit 'todos' or 'inactivas' to show others
        };
        const [byArea, bySector, byEmpleado] = await Promise.all([
          api(`/templates?${qsFromObj({ ...base, scopeType: "area" })}`),
          api(`/templates?${qsFromObj({ ...base, scopeType: "sector" })}`),
          api(`/templates?${qsFromObj({ ...base, scopeType: "empleado" })}`),
        ]);
        const merged = [
          ...norm(byArea),
          ...norm(bySector),
          ...norm(byEmpleado),
        ];
        const uniq = Object.values(
          merged.reduce((acc, t) => {
            acc[String(t._id)] = t;
            return acc;
          }, {})
        );
        setAllPlantillas(uniq);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar todas las plantillas del año");
        setAllPlantillas([]);
      }
    })();
  }, [year, tipoFiltro, empleadoId, scopeType, scopeId, refreshKey]);



  // Overrides específicos del empleado seleccionado
  useEffect(() => {
    (async () => {
      if (!empleadoId) {
        setEmpOverrides([]);
        return;
      }
      try {
        const data = await api(
          `/overrides?${qsFromObj({
            year,
            empleado: empleadoId,
          })}`
        );
        setEmpOverrides(normAny(data));
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar overrides del empleado");
        setEmpOverrides([]);
      }
    })();
  }, [empleadoId, year, refreshKey]);

  const plantillas = useMemo(() => {
    if (plantillasByEmp !== null) return plantillasByEmp;
    if (plantillasSector !== null) return plantillasSector;
    if (allPlantillas !== null)
      return allPlantillas === "loading" ? [] : allPlantillas;
    return hook.plantillas;
  }, [plantillasByEmp, plantillasSector, allPlantillas, hook.plantillas]);

  // Derivados
  const objetivos = useMemo(
    () => plantillas.filter((p) => p.tipo === "objetivo"),
    [plantillas]
  );
  const aptitudes = useMemo(
    () => plantillas.filter((p) => p.tipo === "aptitud"),
    [plantillas]
  );
  const totalObjetivos = useMemo(
    () => objetivos.reduce((acc, o) => {
      const ov = o.__override?.peso;
      const peso = (ov !== undefined && ov !== null && !isNaN(Number(ov)))
        ? Number(ov)
        : (o.pesoBase || 0);
      return acc + peso;
    }, 0),
    [objetivos]
  );
  const totalAptitudes = useMemo(
    () => aptitudes.reduce((acc, a) => {
      const ov = a.__override?.peso;
      const peso = (ov !== undefined && ov !== null && !isNaN(Number(ov)))
        ? Number(ov)
        : (a.pesoBase || 0);
      return acc + peso;
    }, 0),
    [aptitudes]
  );

  const hasScopedFilter = !!(scopeType && scopeId) || !!empleadoId;

  // Acciones
  const openNew = (tipo) => {
    setEditing(null);
    setModalFormType(tipo);
    setFormOpen(true);
  };

  const openEdit = async (tpl) => {
    try {
      const fullTpl = await api(`/templates/${tpl._id}`);
      setEditing(fullTpl);
      setModalFormType(fullTpl.tipo);
      setFormOpen(true);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cargar la plantilla");
    }
  };

  const openClone = (tpl) => {
    setCloneTpl(tpl);
    setCloneOpen(true);
  };

  const handleAfterSave = (tpl) => {
    if (editing?._id) {
      updateLocal(tpl);
    } else {
      addLocal(tpl);
    }

    setEditing(null);
    setModalFormType(null);
    setFormOpen(false);

    setRefreshKey((k) => k + 1);  // 👈 dispara refetch en todos
    reload();                     // 👈 refresca el hook usePlantillas
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`¿Eliminar plantilla "${tpl.nombre}"?`)) return;
    try {
      await api(`/templates/${tpl._id}`, { method: "DELETE" });
      removeLocal(tpl._id);

      toast.success(`${tpl.tipo === 'objetivo' ? 'Objetivo' : 'Plantilla'} eliminado correctamente`);

      setRefreshKey((k) => k + 1);
      reload();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const handleToggleActive = async (tpl) => {
    // Definir estado actual seguro (default true)
    const isCurrentlyActive = tpl.activo !== false;
    const nuevoEstado = !isCurrentlyActive;
    const newItem = { ...tpl, activo: nuevoEstado };

    try {
      // Optimistic update en todos los estados posibles
      if (allPlantillas && Array.isArray(allPlantillas)) {
        setAllPlantillas(prev => prev.map(p => p._id === tpl._id ? newItem : p));
      }
      if (plantillasSector && Array.isArray(plantillasSector)) {
        setPlantillasSector(prev => prev.map(p => p._id === tpl._id ? newItem : p));
      }
      if (plantillasByEmpRaw && Array.isArray(plantillasByEmpRaw)) {
        setPlantillasByEmpRaw(prev => prev.map(p => p._id === tpl._id ? newItem : p));
      }

      // También actualizamos el hook
      updateLocal(newItem);

      await api(`/templates/${tpl._id}`, {
        method: "PUT",
        body: { activo: nuevoEstado },
      });
      // Comentamos para evitar duplicados si ya hay uno por ID, o usamos toastId
      toast.success(nuevoEstado ? "Activada" : "Desactivada", { toastId: `toggle-${tpl._id}` });
    } catch (e) {
      console.error(e);
      toast.error("Error al cambiar estado");
      // Revertir: forzar recarga
      setRefreshKey(k => k + 1);
      reload();
    }
  };
  const clearAlcance = () => {
    setScopeType("");
    setScopeId("");
    setEmpleadoId("");
    setEmpQueryHeader("");
    setEmpQuerySidebar("");
  };

  const scopeLabel = useMemo(() => {
    if (empleadoId && selectedEmpleado) {
      return `${selectedEmpleado.apellido}, ${selectedEmpleado.nombre}`;
    }
    if (!scopeType || !scopeId) return "Todos";
    if (scopeType === "area") {
      return (
        areas.find((a) => String(a._id) === String(scopeId))?.nombre || "Área"
      );
    }
    if (scopeType === "sector") {
      return (
        sectores.find((s) => String(s._id) === String(scopeId))?.nombre ||
        "Sector"
      );
    }
    return "Todos";
  }, [scopeType, scopeId, areas, sectores, empleadoId, selectedEmpleado]);

  const isActiveScope = (tipo, id = null) => {
    if (tipo === "todos") {
      return !scopeType && !scopeId && !empleadoId;
    }
    if (tipo === "area") {
      return scopeType === "area" && String(scopeId) === String(id);
    }
    if (tipo === "sector") {
      return scopeType === "sector" && String(scopeId) === String(id);
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-[#f5f9fc]">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-8 py-6 flex flex-col gap-6 h-screen">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Gestión de Plantillas
            </h1>
            <p className="text-sm text-muted-foreground">
              Creá y administrá objetivos y aptitudes base por Año y Alcance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => nav("/asignaciones")} variant="outline" className="gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-git-branch"><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
              Excepciones & Override
            </Button>
            <Button onClick={() => nav("/simulador")} variant="outline" className="gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calculator"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></svg>
              Simulador
            </Button>
          </div>
        </div>

        {/* Layout: sidebar + main */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 flex-1 overflow-hidden">
          {/* Sidebar filtros: su propio scroll */}
          <aside className="space-y-3 overflow-y-auto pr-2">
            {/* Buscador de empleado (sidebar) - Styled to match Nomina Sidebar Card */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden p-3 mb-4">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                Filtro por empleado
              </h3>
              {selectedEmpleado ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {selectedEmpleado.apellido}, {selectedEmpleado.nombre}
                  </span>
                  <button
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    onClick={clearAlcance}
                    title="Limpiar"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all placeholder:text-slate-400"
                    placeholder="Buscar empleado..."
                    value={empQuerySidebar}
                    onChange={(e) => {
                      setEmpQuerySidebar(e.target.value);
                      setEmpOpenSidebar(true);
                    }}
                    onFocus={() => setEmpOpenSidebar(true)}
                  />
                  {empOpenSidebar && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {empleadosFiltradosSidebar.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">
                          Sin resultados
                        </div>
                      )}
                      {empleadosFiltradosSidebar.map((e) => (
                        <button
                          key={e._id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700 transition-colors border-b border-slate-50 last:border-0"
                          onClick={() => {
                            setEmpleadoId(String(e._id));
                            setEmpOpenSidebar(false);
                            setEmpQuerySidebar("");
                            setScopeType("empleado"); // Ensure scope type is set!
                            setScopeId(String(e._id));
                          }}
                        >
                          <span className="font-medium">{e.apellido}</span>, {e.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Listado de áreas/sectores (sidebar) - Nomina Style */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden pb-2">
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <button
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${scopeType === "" && !selectedEmpleado
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "text-slate-600 hover:bg-white hover:text-blue-600 border border-transparent hover:border-slate-200"
                    }`}
                  onClick={() => {
                    clearAlcance();
                    // Also ensure employee filter is cleared if it wasn't
                    setEmpleadoId("");
                    setEmpQuerySidebar("");
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                  Ver Todas
                </button>
              </div>

              <div className="px-3 pt-4 pb-2">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Áreas & Dependencias</h3>
                <ul className="space-y-1">
                  {areas.map((area) => (
                    <li key={area._id} className="group/area">
                      <div className="relative">
                        <button
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActiveScope("area", area._id)
                            ? "bg-blue-50 text-blue-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          onClick={() => {
                            setScopeType("area");
                            setScopeId(area._id);
                            setEmpleadoId("");
                            setEmpQueryHeader("");
                            setEmpQuerySidebar("");
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Icono Area */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isActiveScope("area", area._id) ? "text-blue-600" : "text-slate-400"}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>
                            {area.nombre}
                          </div>
                        </button>
                      </div>

                      {/* Sectores Nested */}
                      <ul className="pl-9 pr-2 space-y-0.5 mt-1 border-l border-slate-100 ml-4">
                        {sectores
                          .filter((s) => (s?.areaId?._id ?? s?.areaId) === area._id)
                          .map((sector) => (
                            <li key={sector._id}>
                              <button
                                className={`w-full text-left text-xs rounded-md px-2.5 py-1.5 transition-all flex items-center gap-2 ${isActiveScope("sector", sector._id)
                                  ? "bg-blue-50/50 text-blue-700 font-medium"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                  }`}
                                onClick={() => {
                                  setScopeType("sector");
                                  setScopeId(sector._id);
                                  setEmpleadoId("");
                                  setEmpQueryHeader("");
                                  setEmpQuerySidebar("");
                                }}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActiveScope("sector", sector._id) ? "bg-blue-500" : "bg-slate-300"}`}></span>
                                {sector.nombre}
                              </button>
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          {/* Main: plantillas */}
          <main className="overflow-y-auto pl-1">
            {/* Controles (sticky dentro del main) */}
            <div className="sticky top-0 z-30 bg-[#f5f9fc]/80 backdrop-blur supports-[backdrop-filter]:bg-[#f5f9fc]/60">
              <div className="rounded-xl bg-card text-card-foreground shadow-md ring-1 ring-border/60 p-4 mb-5">
                {/* Fila 1 */}
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    Plantillas{" "}
                    <span className="text-muted-foreground">
                      ({scopeLabel} · {year})
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    {permisos.canCreateObjetivo && (
                      <Button
                        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0"
                        variant="outline"
                        onClick={() => openNew("objetivo")}
                      >
                        + Nuevo Objetivo
                      </Button>
                    )}
                    {permisos.canCreateAptitud && (
                      <Button
                        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0"
                        variant="outline"
                        onClick={() => openNew("aptitud")}
                      >
                        + Nueva Aptitud
                      </Button>
                    )}
                  </div>
                </div>

                {/* Fila 2: filtros + buscador empleado header */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_1fr_auto] items-center">
                  {/* Botones año */}
                  <div className="flex items-center gap-2">
                    {[year - 1, year, year + 1].map((y) => (
                      <button
                        key={y}
                        className={`px-3 py-1 rounded-full text-sm ${year === y
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                          }`}
                        onClick={() => setYear(y)}
                      >
                        {y}
                      </button>
                    ))}
                  </div>




                  {/* Bloque derecho: buscador empleado header + extras */}
                  <div className="flex items-center justify-end gap-3">
                    {/* 🔎 Buscador empleado (header) */}
                    <div className="relative" ref={empBoxHeaderRef}>
                      {selectedEmpleado ? (
                        <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-background">
                          <span className="text-sm">
                            {selectedEmpleado.apellido},{" "}
                            {selectedEmpleado.nombre}
                            {selectedEmpleado.apodo ? (
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                ({selectedEmpleado.apodo})
                              </span>
                            ) : null}
                          </span>
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={clearAlcance}
                            title="Limpiar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            className="w-72 rounded-md border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Buscar empleado por apellido o nombre…"
                            value={empQueryHeader}
                            onChange={(e) => {
                              setEmpQueryHeader(e.target.value);
                              setEmpOpenHeader(true);
                            }}
                            onFocus={() => setEmpOpenHeader(true)}
                          />
                          {empOpenHeader && (
                            <div className="absolute right-0 mt-1 z-20 max-h-64 w-72 overflow-auto rounded-md border bg-popover text-popover-foreground shadow">
                              {empleadosFiltradosHeader.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  Sin resultados
                                </div>
                              )}
                              {empleadosFiltradosHeader.map((e) => (
                                <button
                                  key={e._id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                                  onClick={() => {
                                    setEmpleadoId(String(e._id));
                                    setEmpOpenHeader(false);
                                    setEmpQueryHeader("");
                                    setScopeType("");
                                    setScopeId("");
                                  }}
                                >
                                  {e.apellido}, {e.nombre}
                                  {e.apodo ? (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      ({e.apodo})
                                    </span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Limpiar filtros alcance */}
                    <button
                      type="button"
                      onClick={clearAlcance}
                      className="px-3 py-2 rounded-md border text-sm bg-background"
                      title="Ver todas las plantillas (sin filtros de alcance)"
                    >
                      Limpiar filtros
                    </button>

                    {/* Totales SOLO si hay alcance (área/sector/empleado) */}
                    {hasScopedFilter && (
                      <div className="flex flex-wrap gap-4 px-3 py-2 bg-muted rounded-lg text-sm">
                        <div>
                          <span className="font-semibold">🎯 Objetivos:</span>{" "}
                          {totalObjetivos}%
                        </div>
                        <div>
                          <span className="font-semibold">💡 Aptitudes:</span>{" "}
                          {totalAptitudes}%
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() =>
                        setTipoFiltro(
                          tipoFiltro === "activas" ? "todos" : "activas"
                        )
                      }
                      className="px-3 py-2 rounded-md border text-sm bg-background"
                    >
                      {tipoFiltro === "activas"
                        ? "Mostrando Activas"
                        : "Todas"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Contenido: Objetivos / Aptitudes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              {/* Objetivos */}
              <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">🎯 Objetivos</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 items-center px-3 rounded-full bg-indigo-100 text-indigo-700 text-xs ring-1 ring-indigo-200">
                      {objetivos.length} objetivos
                    </span>
                    {hasScopedFilter && (
                      <span className="inline-flex h-7 items-center px-3 rounded-full bg-blue-100 text-blue-700 text-xs ring-1 ring-blue-200">
                        {totalObjetivos}% asignado
                      </span>
                    )}
                  </div>
                </div>

                {loading && allPlantillas === null && plantillasByEmp === null ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Cargando…
                  </div>
                ) : (
                  <PlantillasList
                    plantillas={objetivos}
                    onEdit={openEdit}
                    onClone={openClone}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    permisos={permisos}
                    areas={areas}
                    sectores={sectores}
                    empleados={empleados}
                  />
                )}
              </div>

              {/* Competencias */}
              <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">💡 Competencias</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 items-center px-3 rounded-full bg-indigo-100 text-indigo-700 text-xs ring-1 ring-indigo-200">
                      {aptitudes.length} competencias
                    </span>
                    {hasScopedFilter && (
                      <span className="inline-flex h-7 items-center px-3 rounded-full bg-blue-100 text-blue-700 text-xs ring-1 ring-blue-200">
                        {totalAptitudes}% asignado
                      </span>
                    )}
                  </div>
                </div>

                {loading && allPlantillas === null && plantillasByEmp === null ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Cargando…
                  </div>
                ) : (
                  <PlantillasList
                    plantillas={aptitudes}
                    onEdit={openEdit}
                    onClone={openClone}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    permisos={permisos}
                    areas={areas}
                    sectores={sectores}
                    empleados={empleados}
                  />
                )}
              </div>
            </div>
          </main>
        </div>

        {/* Modal Crear/Editar */}
        <PlantillaModal
          isOpen={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setModalFormType(null);
          }}
          modalType={modalFormType}
          editing={editing}
          onAfterSave={handleAfterSave}
          areas={areas}
          sectores={sectores}
          empleados={empleados}
          scopeType={scopeType}
        />

        {/* Modal Clonar */}
        <CloneModal
          isOpen={cloneOpen}
          onClose={() => {
            setCloneOpen(false);
            setCloneTpl(null);
          }}
          template={cloneTpl}
          areas={areas}
          sectores={sectores}
          empleados={empleados}
          onClone={async ({ year: newYear, scopeType: newType, scopeId: newId }) => {
            try {
              const body = {
                ...cloneTpl,
                _id: undefined,
                year: newYear,
                scopeType: newType,
                scopeId: newId,
                nombre: cloneTpl.nombre,
                proceso: cloneTpl.proceso,
              };
              await api("/templates", { method: "POST", body });
              await reload();
              setRefreshKey((k) => k + 1);

              setCloneOpen(false);
              setCloneTpl(null);
            } catch (e) {
              console.error(e);
              toast.error("No se pudo clonar");
            }
          }}
        />
      </div>
    </div>
  );
}
