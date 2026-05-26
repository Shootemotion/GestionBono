// src/pages/GestionPlantillas.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import usePlantillas from "@/hooks/usePlantillas";
import PlantillasList from "@/components/PlantillasList";
import PlantillaModal from "@/components/PlantillaModal";
import CloneModal from "@/components/CloneModal";
import useCan from "@/hooks/useCan";
import { api } from "@/lib/api";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { XCircle, History, Plus, MoreHorizontal, GitBranch, Calculator, Target, Lightbulb, User, Search } from "lucide-react";
import VersionesTimelineDialog from "@/components/VersionesTimelineDialog";

// Agrupa plantillas por linaje (parentPlantillaId encadenado) y devuelve un
// solo "representante" por linaje. Representante = activa, o la última versión
// si no hay ninguna activa. Cuando hay una versión pendiente distinta del
// representante, se expone en __lineagePendiente para que la card la muestre.
function agruparPorLinaje(items) {
  if (!items || items.length === 0) return [];
  const idMap = new Map(items.map((p) => [String(p._id), p]));
  const childrenByParent = new Map();
  items.forEach((p) => {
    if (p.parentPlantillaId) {
      const pid = String(p.parentPlantillaId);
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(p);
    }
  });

  const roots = items.filter(
    (p) => !p.parentPlantillaId || !idMap.has(String(p.parentPlantillaId))
  );

  const result = [];
  for (const root of roots) {
    const chain = [root];
    const queue = [String(root._id)];
    while (queue.length) {
      const cid = queue.shift();
      const hijos = childrenByParent.get(cid) || [];
      for (const c of hijos) {
        chain.push(c);
        queue.push(String(c._id));
      }
    }
    chain.sort((a, b) => (a.version || 1) - (b.version || 1));

    const activa = chain.find(
      (c) => c.activo === true && c.estadoAprobacion !== "pendiente"
    );
    const pendiente = chain.find((c) => c.estadoAprobacion === "pendiente");
    const ultima = chain[chain.length - 1];
    const rep = activa || ultima;

    result.push({
      ...rep,
      __lineageCount: chain.length,
      __lineageChain: chain,
      __lineagePendiente:
        pendiente && String(pendiente._id) !== String(rep._id) ? pendiente : null,
      __lineageRootId: String(root._id),
    });
  }
  return result;
}
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

  const currentYear = getCurrentFiscalYear();
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

  // Toolbar dropdowns
  const [crearMenuOpen, setCrearMenuOpen] = useState(false);
  const [masMenuOpen, setMasMenuOpen] = useState(false);
  const crearMenuRef = useRef(null);
  const masMenuRef = useRef(null);

  // Buscador por nombre de actividad (objetivo / competencia)
  const [nombreQuery, setNombreQuery] = useState("");

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

  // Click-outside para los dropdowns del toolbar
  useEffect(() => {
    function handleClickOutside(ev) {
      const t = ev.target;
      if (crearMenuRef.current && !crearMenuRef.current.contains(t)) {
        setCrearMenuOpen(false);
      }
      if (masMenuRef.current && !masMenuRef.current.contains(t)) {
        setMasMenuOpen(false);
      }
    }
    if (crearMenuOpen || masMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [crearMenuOpen, masMenuOpen]);


  // Ensure role is normalized
  const userRole = String(user?.rol || "").toLowerCase();

  const isDirectivo =
    user?.isDirectivo || userRole === "director" || userRole === "directivo";

  // Permitir a Jefes de Area/Sector (y RRHH explícito si se requiere, pero usuario solo pidió Jefes)
  // Agregamos chequeo robusto
  const isManager = userRole === 'jefe_area' || userRole === 'jefe_sector';

  // Asumimos que si pueden ver la página (Navbar allows RRHH), RRHH debería poder editar también?
  // Por ahora seguimos la instrucción: "en gestion deobjetivos deberian tener la posiblidad..." -> Jefes.
  // Pero si RRHH no puede, sería extraño. Agrego 'rrhh' para seguridad, o me ciño a Jefes?
  // El usuario dijo "los jefes... deberian".

  const canManage = isDirectivo || isManager;

  const permisos = {
    canCreateObjetivo: canManage || useCan("objetivos:crear").ok,
    canCreateAptitud: canManage || useCan("aptitudes:crear").ok,
    canEditObjetivo: canManage || useCan("objetivos:editar").ok,
    canEditAptitud: canManage || useCan("aptitudes:editar").ok,
    canDeleteObjetivo: canManage || useCan("objetivos:eliminar").ok,
    canDeleteAptitud: canManage || useCan("aptitudes:eliminar").ok,
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

  // Cuando hay búsqueda por nombre de actividad, forzamos a "todos" en el
  // backend para que el filtro de Vista (activas/inactivas/etc.) no oculte
  // matches. La búsqueda es global por nombre, no acotada al estado.
  const effectiveTipoFiltro = nombreQuery.trim() ? "todos" : tipoFiltro;

  // Hook de plantillas (back ya filtra por estos params)
  const hookParams = useMemo(
    () => ({
      year,
      scopeType: scopeType || undefined,
      scopeId: scopeId || undefined,
      tipoFiltro: effectiveTipoFiltro,
    }),
    [year, scopeType, scopeId, effectiveTipoFiltro, refreshKey]
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
              tipoFiltro: effectiveTipoFiltro,
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
                tipoFiltro: effectiveTipoFiltro,
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
  }, [year, scopeType, scopeId, empleadoId, sectores, refreshKey, effectiveTipoFiltro]);


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
                tipoFiltro: effectiveTipoFiltro,
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
                tipoFiltro: effectiveTipoFiltro,
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
              tipoFiltro: effectiveTipoFiltro,
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
  }, [empleadoId, selectedEmpleado, year, refreshKey, effectiveTipoFiltro]);

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
          tipoFiltro: effectiveTipoFiltro, // Backend now requires explicit 'todos' or 'inactivas' to show others
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
  }, [year, tipoFiltro, empleadoId, scopeType, scopeId, refreshKey, effectiveTipoFiltro]);



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

  // Helper: matchea texto contra un único doc plantilla
  const matchTextoPlantilla = (p, q) => {
    const hay = `${p?.nombre ?? ""} ${p?.descripcion ?? ""} ${p?.proceso ?? ""}`.toLowerCase();
    return hay.includes(q);
  };

  // Helper: matchea contra el linaje completo (cualquier versión cuenta como hit)
  const matchLinaje = (rep) => {
    const q = nombreQuery.trim().toLowerCase();
    if (!q) return true;
    const chain = Array.isArray(rep.__lineageChain) && rep.__lineageChain.length > 0
      ? rep.__lineageChain
      : [rep];
    return chain.some((v) => matchTextoPlantilla(v, q));
  };

  // SIEMPRE agrupamos por linaje — el usuario quiere ver 1 card por objetivo
  // conceptual, con indicador del historial. La búsqueda matchea si cualquier
  // versión del linaje contiene el texto, así no se pierden hits que viven en
  // versiones no-representantes (renombradas, históricas, etc.).
  const objetivos = useMemo(() => {
    const base = plantillas.filter((p) => p.tipo === "objetivo");
    const agrupado = agruparPorLinaje(base);
    return agrupado.filter(matchLinaje);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas, nombreQuery]);

  const aptitudes = useMemo(() => {
    const base = plantillas.filter((p) => p.tipo === "aptitud");
    const agrupado = agruparPorLinaje(base);
    return agrupado.filter(matchLinaje);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas, nombreQuery]);

  // Dialog de historial de un linaje específico
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historialLineageRootId, setHistorialLineageRootId] = useState(null);
  const [historialYear, setHistorialYear] = useState(null);

  const openHistorial = (plantilla) => {
    setHistorialLineageRootId(plantilla.__lineageRootId || String(plantilla._id));
    setHistorialYear(plantilla.year || year);
    setHistorialOpen(true);
  };
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

  const handleAprobarVersion = async (tpl) => {
    if (!confirm(`¿Estás seguro de que querés aprobar la nueva versión de "${tpl.nombre}"? Esto desactivará la versión anterior y migrará los datos de evaluación en curso.`)) {
      return;
    }

    try {
      const res = await api(`/templates/${tpl._id}/aprobar-version`, { method: "PUT" });
      toast.success(`Versión aprobada: ${res.message || "Cambios guardados."}`);

      setRefreshKey((k) => k + 1);
      reload();
    } catch (e) {
      console.error(e);
      toast.error("Error al intentar aprobar la versión de la plantilla");
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Actividad
            </h1>
            <p className="text-sm text-muted-foreground">
              Creá y administrá objetivos y competencias base por Año y Alcance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Dropdown: + Crear */}
            {(permisos.canCreateObjetivo || permisos.canCreateAptitud) && (
              <div className="relative" ref={crearMenuRef}>
                <Button
                  onClick={() => { setCrearMenuOpen((v) => !v); setMasMenuOpen(false); }}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border-0"
                >
                  <Plus className="w-4 h-4" />
                  Crear
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${crearMenuOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                </Button>
                {crearMenuOpen && (
                  <div className="absolute right-0 mt-1 z-50 w-56 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
                    {permisos.canCreateObjetivo && (
                      <button
                        type="button"
                        onClick={() => { setCrearMenuOpen(false); openNew("objetivo"); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-emerald-50 transition-colors"
                      >
                        <Target className="w-4 h-4 text-indigo-600" />
                        <span className="font-medium text-slate-700">Nuevo Objetivo</span>
                      </button>
                    )}
                    {permisos.canCreateAptitud && (
                      <button
                        type="button"
                        onClick={() => { setCrearMenuOpen(false); openNew("aptitud"); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-emerald-50 transition-colors border-t border-slate-100"
                      >
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <span className="font-medium text-slate-700">Nueva Competencia</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Dropdown: Más (herramientas) */}
            <div className="relative" ref={masMenuRef}>
              <Button
                variant="outline"
                onClick={() => { setMasMenuOpen((v) => !v); setCrearMenuOpen(false); }}
                className="gap-2"
                title="Más herramientas"
              >
                <MoreHorizontal className="w-4 h-4" />
                Más
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${masMenuOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
              </Button>
              {masMenuOpen && (
                <div className="absolute right-0 mt-1 z-50 w-56 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMasMenuOpen(false); nav("/asignaciones"); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                  >
                    <GitBranch className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-slate-700">Excepciones & Override</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMasMenuOpen(false); nav("/simulador"); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors border-t border-slate-100"
                  >
                    <Calculator className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-slate-700">Simulador</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMasMenuOpen(false); nav(`/versiones-timeline?year=${year}`); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors border-t border-slate-100"
                  >
                    <History className="w-4 h-4 text-indigo-500" />
                    <span className="font-medium text-slate-700">Línea de Versiones</span>
                  </button>
                </div>
              )}
            </div>
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
                {/* Fila 1: Año + Vista + Limpiar */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Año fiscal */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Año</span>
                    <div className="inline-flex items-center bg-slate-100 rounded-full p-0.5">
                      {[year - 1, year, year + 1].map((y) => (
                        <button
                          key={y}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                            year === y
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                          onClick={() => setYear(y)}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="hidden sm:block h-6 w-px bg-slate-200" />

                  {/* Vista (tipoFiltro) */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Vista</span>
                    {(isDirectivo || userRole === "rrhh") ? (
                      <div className="relative">
                        <select
                          value={tipoFiltro}
                          onChange={(e) => setTipoFiltro(e.target.value)}
                          className="appearance-none pl-3 pr-8 py-1.5 rounded-md border border-slate-200 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer shadow-sm transition-all"
                        >
                          <option value="activas">⭐ Activas (+ Pendientes)</option>
                          <option value="pendientes">⏳ Solo Pendientes</option>
                          <option value="inactivas">🚫 Archivo / Inactivas</option>
                          <option value="todos">📦 Todas</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                          <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setTipoFiltro(tipoFiltro === "activas" ? "todos" : "activas")
                        }
                        className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
                      >
                        {tipoFiltro === "activas" ? "⭐ Activas" : "📦 Todas"}
                      </button>
                    )}
                  </div>

                  {/* Limpiar todo (sólo si hay filtros activos) */}
                  {(empleadoId || scopeType || nombreQuery) && (
                    <button
                      type="button"
                      onClick={() => { clearAlcance(); setNombreQuery(""); }}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      title="Limpiar empleado, alcance y búsqueda"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {/* Fila 2: Búsquedas etiquetadas */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Buscador empleado */}
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Filtrar por empleado
                    </label>
                    <div className="relative" ref={empBoxHeaderRef}>
                      {selectedEmpleado ? (
                        <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                          <span className="text-sm font-medium text-blue-900 truncate">
                            {selectedEmpleado.apellido}, {selectedEmpleado.nombre}
                            {selectedEmpleado.apodo && (
                              <span className="ml-1 text-xs text-blue-700/70">({selectedEmpleado.apodo})</span>
                            )}
                          </span>
                          <button
                            className="text-blue-600 hover:text-blue-900 shrink-0"
                            onClick={clearAlcance}
                            title="Quitar empleado"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all placeholder:text-slate-400"
                            placeholder="Apellido, nombre o apodo…"
                            value={empQueryHeader}
                            onChange={(e) => {
                              setEmpQueryHeader(e.target.value);
                              setEmpOpenHeader(true);
                            }}
                            onFocus={() => setEmpOpenHeader(true)}
                          />
                          {empOpenHeader && (
                            <div className="absolute left-0 right-0 mt-1 z-20 max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
                              {empleadosFiltradosHeader.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground italic">
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
                                  {e.apodo && (
                                    <span className="ml-1 text-xs text-muted-foreground">({e.apodo})</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Buscador por nombre de actividad */}
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                      <Search className="w-3 h-3" /> Buscar actividad
                      {nombreQuery.trim() && (
                        <span
                          className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-bold normal-case tracking-normal"
                          title="La búsqueda ignora el filtro de Vista — muestra activas, pendientes, históricas e inactivas que matchean."
                        >
                          🌐 Buscando en todas las vistas
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={nombreQuery}
                        onChange={(e) => setNombreQuery(e.target.value)}
                        placeholder="Por nombre, descripción o proceso…"
                        className="w-full pl-9 pr-8 py-2 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all placeholder:text-slate-400"
                      />
                      {nombreQuery && (
                        <button
                          type="button"
                          onClick={() => setNombreQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 rounded-full p-0.5 hover:bg-slate-100"
                          title="Limpiar búsqueda"
                          aria-label="Limpiar búsqueda"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contenido: Objetivos / Aptitudes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              {/* Objetivos */}
              <div className="rounded-2xl bg-slate-50/60 ring-1 ring-slate-200/70 p-3">
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
                    onAprobarVersion={handleAprobarVersion}
                    onHistorial={openHistorial}
                    permisos={permisos}
                    areas={areas}
                    sectores={sectores}
                    empleados={empleados}
                    isRealRRHH={user?.isRRHH || userRole === "rrhh"}
                    hasRoleDirectivo={isDirectivo}
                  />
                )}
              </div>

              {/* Competencias */}
              <div className="rounded-2xl bg-slate-50/60 ring-1 ring-slate-200/70 p-3">
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
                    onAprobarVersion={handleAprobarVersion}
                    onHistorial={openHistorial}
                    permisos={permisos}
                    areas={areas}
                    sectores={sectores}
                    empleados={empleados}
                    isRealRRHH={user?.isRRHH || userRole === "rrhh"}
                    hasRoleDirectivo={isDirectivo}
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

        {/* Dialog Historial de Linaje */}
        <VersionesTimelineDialog
          open={historialOpen}
          onOpenChange={setHistorialOpen}
          year={historialYear || year}
          lineageRootId={historialLineageRootId}
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
