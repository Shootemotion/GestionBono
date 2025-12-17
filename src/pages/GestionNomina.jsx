// src/pages/GestionNomina.jsx
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal.jsx";
import FormularioEmpleado from "@/components/FormularioEmpleado.jsx";
import EmpleadoCard from "@/components/EmpleadoCard.jsx";
import { Button } from "@/components/ui/button";


// -------- helper: trae TODAS las páginas de un endpoint ----------
async function fetchAll(path, { pageSize = 200 } = {}) {
  const out = [];
  let page = 1;
  let nextToken = null;

  while (true) {
    const qs = new URLSearchParams();
    if (pageSize) qs.set("pageSize", String(pageSize));
    // soportá contratos que usan "limit"
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

    // señales de “hay más”
    const total = Number(data?.total ?? data?.count ?? 0);
    const ps = Number(data?.pageSize ?? data?.limit ?? pageSize);
    const currentPage = Number(data?.page ?? page);
    const hasNextToken = !!data?.nextPageToken;

    if (hasNextToken) {
      nextToken = data.nextPageToken;
      // no toques "page" si usás token
      continue;
    }

    // si el backend publica total y page, usalo
    if (total && currentPage * ps < total) {
      page += 1;                 // <- ACÁ ESTABA TU BUG
      continue;
    }

    // fallback: si no hay total y vino vacío, cortá
    if (!total && chunk.length === 0) break;

    // si no hay “total” pero vinieron items == ps, probá otra página
    if (!total && chunk.length === ps) {
      page += 1;
      continue;
    }

    break;
  }
  return out;
}
// -------------------------------------------------------------------




function replaceById(arr, item) {
  const i = arr.findIndex((e) => String(e._id) === String(item._id));
  if (i === -1) return [item, ...arr];
  const next = arr.slice();
  next[i] = item;
  return next;
}

function GestionEstructura() {
  // Estado
  const [filtro, setFiltro] = useState({ tipo: "todos", id: null, nombre: "Todos" });
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false, modo: null, datos: null });
  const [empleadoExpandidoId, setEmpleadoExpandidoId] = useState(null); // (reservado si lo usás luego)
  const [terminoBusqueda, setTerminoBusqueda] = useState("");

  // Controles visuales (orden y animación del grid)
  const [sortBy, setSortBy] = useState("puesto"); // nombre | apellido | puesto
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [gridVisible, setGridVisible] = useState(true);

  // auth
  const { user, setUser } = useAuth();

  // Carga inicial (re-run cuando cambia user)
  useEffect(() => {
    (async () => {
      try {
        // ⚠️ Esperá a tener user definido para evitar filtrar con user null
        if (user === undefined) return;

        // Trae TODO (no solo primera página)
        const [dataAreas, dataSectores, dataEmpleados] = await Promise.all([
          fetchAll("/areas"),
          fetchAll("/sectores"),
          fetchAll("/empleados"),
        ]);

        // ✅ Normalizadores consistentes
        const allAreas = dataAreas;
        const allSectores = dataSectores;
        const allEmps = dataEmpleados;

        // ✅ Privilegiados: rol o flags
        const isPrivileged =
          ['superadmin', 'rrhh', 'directivo'].includes(String(user?.rol || '').toLowerCase()) ||
          user?.isSuper === true || user?.isRRHH === true || user?.isDirectivo === true;

        if (isPrivileged) {
          setAreas(allAreas);
          setSectores(allSectores);
          setEmpleados(allEmps);
          return;
        }

        // Caso restringido
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
        toast.error("No se pudieron cargar los datos iniciales.");
      }
    })();
  }, [user]);

  // Filtro + búsqueda + orden
  const empleadosFiltrados = useMemo(() => {
    let lista = Array.isArray(empleados) ? empleados : [];

    if (terminoBusqueda?.trim()) {
      const q = terminoBusqueda.toLowerCase();
      lista = lista.filter((emp) => {
        const n = emp?.nombre?.toLowerCase() ?? "";
        const a = emp?.apellido?.toLowerCase() ?? "";
        const dni = String(emp?.dni ?? "");
        const apodo = (emp?.apodo || "").toLowerCase();
        return n.includes(q) || a.includes(q) || apodo.includes(q) || dni.includes(q);
      });
    }

    if (filtro.tipo === "area") {
      lista = lista.filter((e) => String(e.area?._id) === String(filtro.id));
    } else if (filtro.tipo === "sector") {
      lista = lista.filter((e) => String(e.sector?._id) === String(filtro.id));
    }

    const norm = (v) => (v ?? "").toString().toLowerCase();
    const cmp = (a, b) => {
      let va = "", vb = "";
      if (sortBy === "nombre") {
        va = norm(a?.nombre); vb = norm(b?.nombre);
      } else if (sortBy === "apellido") {
        va = norm(a?.apellido); vb = norm(b?.apellido);
      } else {
        va = norm(a?.puesto); vb = norm(b?.puesto);
      }
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    };
    const sorted = [...lista].sort(cmp);
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [empleados, filtro, terminoBusqueda, sortBy, sortDir]);

  // Fade del grid
  useEffect(() => {
    setGridVisible(false);
    const t = setTimeout(() => setGridVisible(true), 120);
    return () => clearTimeout(t);
  }, [filtro, terminoBusqueda, sortBy, sortDir, empleados.length]);

  // Modales CRUD
  const handleOpenModal = (modo, datos = null) => setModalState({ isOpen: true, modo, datos });
  const handleCloseModal = () => setModalState({ isOpen: false, modo: null, datos: null });

  const handleGuardar = async (nuevosDatos) => {
    const { modo, datos } = modalState;
    const isEdit = modo?.startsWith("editar");
    const tipo = modo?.split("_")[1];

    let path = "";
    if (modo?.includes("empleado")) path = isEdit ? `/empleados/${datos._id}` : "/empleados";

    try {
      const { foto, ...resto } = nuevosDatos;

      // 1) Crear/editar empleado (sin foto)
      const empleadoGuardado = await api(path, {
        method: isEdit ? "PATCH" : "POST",
        body: resto,
      });

      // 2) Subir foto (si hay), usar SIEMPRE el que vuelve del upload
      let empleadoFinal = empleadoGuardado;
      if (foto) {
        const fd = new FormData();
        fd.append("foto", foto);
        const conFoto = await api(`/empleados/${empleadoGuardado._id}/foto`, {
          method: "POST",
          body: fd,
        });
        empleadoFinal = conFoto || empleadoGuardado;
      }

      // 3) Actualizar lista
      if (tipo === "empleado") {
        setEmpleados((prev) => replaceById(prev, empleadoFinal));
      }

      // 4) Si es el empleado del usuario actual, refrescar Auth (Navbar)
      if (user?.empleado?._id && String(user.empleado._id) === String(empleadoFinal._id)) {
        setUser((u) => ({
          ...u,
          empleado: {
            ...u.empleado,
            fotoUrl: empleadoFinal.fotoUrl,
            nombre: empleadoFinal.nombre,
            apellido: empleadoFinal.apellido,
            puesto: empleadoFinal.puesto,
          },
        }));
      }

      toast.success("¡Empleado guardado con éxito!");
      handleCloseModal();
    } catch (err) {
      console.error('guardar empleado', err);
      const status = err?.status || err?.response?.status;
      const data = err?.data || err?.response?.data;
      if (status === 409) {
        // conflictos típicos: DNI / email duplicado
        toast.error(data?.message || "Conflicto: DNI o Email ya registrado.");
      } else if (status === 400) {
        toast.error(data?.message || "Validación: revisá los campos requeridos.");
      } else {
        toast.error(data?.message || err?.message || "Error al guardar el empleado.");
      }
    }
  };

  const handleEliminar = async (id, tipo) => {
    if (!window.confirm(`¿Estás seguro de que querés eliminar este ${tipo}?`)) return;

    let path = "";
    if (tipo === "empleado") path = `/empleados/${id}`;

    try {
      await api(path, { method: "DELETE" });
      if (tipo === "empleado") setEmpleados((prev) => prev.filter((e) => e._id !== id));
      toast.success(`¡${tipo.charAt(0).toUpperCase() + tipo.slice(1)} eliminado!`);
    } catch (error) {
      console.error(error);
      toast.error(`Error al eliminar el ${tipo}.`);
    }
  };

  const getModalTitle = () => {
    if (!modalState.modo) return "";
    const [accion, tipo] = modalState.modo.split("_");
    return `${accion.charAt(0).toUpperCase() + accion.slice(1)} ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
  };

  const renderizarFormulario = () => {
    if (!modalState.isOpen) return null;
    const { modo, datos } = modalState;

    if (modo?.includes("empleado")) {
      return (
        <FormularioEmpleado
          onGuardar={handleGuardar}
          onCancelar={handleCloseModal}
          empleadoInicial={datos}
          areas={areas}
          sectores={sectores}
          size="xl"
        />
      );
    }
    return null;
  };

  const isActive = (tipo, id = null) => filtro.tipo === tipo && (id === null || filtro.id === id);

  // Render
  return (
    <div className="min-h-screen bg-[#f5f9fc] overflow-hidden">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-8 py-6 flex flex-col gap-6 h-screen">
        {/* Header (no scroll) */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Gestión de Personal</h1>
            <p className="text-sm text-muted-foreground">Consulta la nómina filtrada por áreas o sectores.</p>
          </div>
        </div>

        {/* Dos paneles con scroll independiente */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 flex-1 overflow-hidden">
          {/* Sidebar filtros: su propio scroll */}
          <aside className="space-y-4 overflow-y-auto pr-2">

            {/* Listado de áreas/sectores */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden pb-2">
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <button
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${filtro.tipo === "todos"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "text-slate-600 hover:bg-white hover:text-blue-600 border border-transparent hover:border-slate-200"
                    }`}
                  onClick={() => setFiltro({ tipo: "todos", id: null, nombre: "Todos" })}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                  Ver Toda la Nómina
                </button>
              </div>

              <div className="px-3 pt-4 pb-2">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Áreas & Sectores</h3>
                <ul className="space-y-1">
                  {areas.map((area) => (
                    <li key={area._id} className="group/area">
                      <div className="relative">
                        <button
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActive("area", area._id)
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          onClick={() => setFiltro({ tipo: "area", id: area._id, nombre: area.nombre })}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Icono Area (Edificio) */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isActive("area", area._id) ? "text-blue-600" : "text-slate-400"}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>
                            {area.nombre}
                          </div>
                        </button>
                      </div>

                      {/* Sectores */}
                      <ul className="pl-9 pr-2 space-y-0.5 mt-1 border-l border-slate-100 ml-4">
                        {sectores
                          .filter((s) => (s?.areaId?._id ?? s?.areaId) === area._id)
                          .map((sector) => (
                            <li key={sector._id}>
                              <button
                                className={`w-full text-left text-xs rounded-md px-2.5 py-1.5 transition-all flex items-center gap-2 ${isActive("sector", sector._id)
                                    ? "bg-blue-50/50 text-blue-700 font-medium"
                                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                  }`}
                                onClick={() =>
                                  setFiltro({ tipo: "sector", id: sector._id, nombre: sector.nombre })
                                }
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive("sector", sector._id) ? "bg-blue-500" : "bg-slate-300"}`}></span>
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

          {/* Main: Nómina (su propio scroll) */}
          <main className="overflow-y-auto pl-2 pr-2">
            {/* Barra de controles - sticky dentro del MAIN */}
            <div className="sticky top-0 z-40 pb-4">
              <div className="rounded-xl bg-white/80 backdrop-blur-md shadow-sm border border-slate-200/60 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Nómina de Empleados
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Mostrando: <span className="text-blue-600">{filtro.nombre}</span>
                    </p>
                  </div>
                  <Button
                    className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-sm transition-all"
                    variant="outline"
                    onClick={() => handleOpenModal("crear_empleado")}
                  >
                    + Nuevo Colaborador
                  </Button>
                </div>

                {/* Fila de controles */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Buscador grande */}
                  <div className="relative flex-1 min-w-[220px]">
                    <label className="sr-only">Buscar</label>
                    <input
                      value={terminoBusqueda}
                      onChange={(e) => setTerminoBusqueda(e.target.value)}
                      placeholder="Buscar por nombre, puesto o legajo..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 pl-10 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                    />
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    </span>
                  </div>

                  {/* Ordenar por */}
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    <select
                      className="bg-transparent text-sm text-slate-600 font-medium outline-none px-2 py-1.5 cursor-pointer"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="nombre">Nombre</option>
                      <option value="apellido">Apellido</option>
                      <option value="puesto">Puesto</option>
                    </select>

                    <div className="w-px h-4 bg-slate-300 mx-1"></div>

                    {/* Asc/Desc */}
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-slate-500 transition-all"
                      title={sortDir === "asc" ? "Ascendente" : "Descendente"}
                    >
                      {sortDir === "asc" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M11 4h4" /><path d="M11 8h7" /><path d="M11 12h10" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="M11 12h10" /><path d="M11 8h7" /><path d="M11 4h4" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid de Cards (con fade) */}
            <div
              className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-20 transition-all duration-300 ${gridVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
            >
              {empleadosFiltrados.map((emp) => (
                <EmpleadoCard
                  key={emp._id}
                  empleado={emp}
                  onEditar={() => handleOpenModal("editar_empleado", emp)}
                  onEliminar={() => handleEliminar(emp._id, "empleado")}
                />
              ))}
              {empleadosFiltrados.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">No se encontraron empleados</h3>
                  <p className="text-slate-500">Intenta ajustar los filtros o la búsqueda.</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Modal principal (empleado) */}
        <Modal isOpen={modalState.isOpen} onClose={handleCloseModal} title={getModalTitle()}>
          {renderizarFormulario()}
        </Modal>
      </div>
    </div>
  );
}

export default GestionEstructura;
