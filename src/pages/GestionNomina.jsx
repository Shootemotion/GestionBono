// src/pages/GestionNomina.jsx
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal.jsx";
import FormularioEmpleado from "@/components/FormularioEmpleado.jsx";
import EmpleadoCard from "@/components/EmpleadoCard.jsx";
import { Button } from "@/components/ui/button";

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
        const [dataAreas, dataSectores, dataEmpleados] = await Promise.all([
          api("/areas"),
          api("/sectores"),
          api("/empleados"),
        ]);

         // ✅ Normalizador: siempre dejá un array
 const allEmps = Array.isArray(dataEmpleados?.items)
  ? dataEmpleados.items
   : (Array.isArray(dataEmpleados) ? dataEmpleados : []);
        // Si es admin/rrhh/directivo -> ve todo
        if (user && (user.isSuper || user.isRRHH || user.isDirectivo)) {
          setAreas(dataAreas || []);
          setSectores(dataSectores || []);
          setEmpleados(allEmps || []);
          return;
        }

        // Caso restringido
        const referenteAreas = new Set((user?.referenteAreas || []).map(String));
        const referenteSectors = new Set((user?.referenteSectors || []).map(String));
        const userAreaId = user?.areaId ? String(user.areaId) : null;

        const visibleSectores = (dataSectores || []).filter((s) => {
          const sId = String(s._id);
          const sAreaId = String(s.areaId?._id || s.areaId);
          if (user?.isJefeArea && userAreaId && userAreaId === sAreaId) return true;
          if (referenteSectors.has(sId)) return true;
          if (referenteAreas.has(sAreaId)) return true;
          return false;
        });

        const visibleAreas = (dataAreas || []).filter((a) => {
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
        method: isEdit ? "PUT" : "POST",
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
          <aside className="space-y-3 overflow-y-auto pr-2">
            {/* Bloque 'ver todos' (sticky relativo a este aside) */}
            <div className="sticky top-0 z-30">
              <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
                <button
                  className="w-full text-left text-sm rounded-lg px-3 py-2 border bg-background/30 border-border shadow-sm hover:bg-accent hover:text-foreground hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setFiltro({ tipo: "todos", id: null, nombre: "Todos" })}
                  title="Ver todos"
                >
                  Ver todos los empleados
                </button>
              </div>
            </div>

            {/* Listado de áreas/sectores (scrollea con el aside) */}
            <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3">
              <ul className="space-y-2">
                {areas.map((area) => (
                  <li key={area._id} className="rounded-lg ring-1 ring-border/60 bg-background">
                    <div className="flex items-center justify-between px-3 py-2">
                      <button
                        className={`w-full text-left font-medium rounded-md px-2 py-1 transition-all ${
                          isActive("area", area._id) ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                        } hover:ring-1 hover:ring-primary/20`}
                        onClick={() => setFiltro({ tipo: "area", id: area._id, nombre: area.nombre })}
                        title="Filtrar por esta área"
                      >
                        {area.nombre}
                      </button>
                    </div>

                    <ul className="px-2 pb-2 space-y-1.5">
                      {sectores
                        .filter((s) => (s?.areaId?._id ?? s?.areaId) === area._id)
                        .map((sector) => (
                          <li key={sector._id} className="rounded-md">
                            <div className="flex items-center justify-between gap-1">
                              <button
                                className={`w-full text-left text-sm rounded-md px-3 py-1.5 transition-all ${
                                  isActive("sector", sector._id)
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                } hover:ring-1 hover:ring-primary/20`}
                                onClick={() =>
                                  setFiltro({ tipo: "sector", id: sector._id, nombre: sector.nombre })
                                }
                                title="Filtrar por este sector"
                              >
                                {sector.nombre}
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main: Nómina (su propio scroll) */}
          <main className="overflow-y-auto pl-1">
            {/* Barra de controles - sticky dentro del MAIN */}
            <div className="sticky top-0 z-40">
              <div className="rounded-xl bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 text-card-foreground shadow-md ring-1 ring-border/60 p-4 mb-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    Nómina de Empleados <span className="text-muted-foreground">({filtro.nombre})</span>
                  </h2>
                  <Button
                    className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0"
                    variant="outline"
                    onClick={() => handleOpenModal("crear_empleado")}
                  >
                    + Nuevo Empleado
                  </Button>
                </div>

                {/* Fila de controles */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {/* Buscador grande */}
                  <div className="relative flex-1 min-w-[220px] sm:min-w-[320px] md:min-w-[420px]">
                    <label className="sr-only">Buscar</label>
                    <input
                      value={terminoBusqueda}
                      onChange={(e) => setTerminoBusqueda(e.target.value)}
                      placeholder="Nombre, apellido, apodo o DNI…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                      ⌕
                    </span>
                  </div>

                  {/* Ordenar por */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ordenar:</span>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="nombre">Nombre</option>
                      <option value="apellido">Apellido</option>
                      <option value="puesto">Puesto</option>
                    </select>

                    {/* Asc/Desc */}
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="rounded-md border border-input bg-background px-2 py-2 text-sm hover:bg-accent"
                      title={sortDir === "asc" ? "Ascendente" : "Descendente"}
                    >
                      {sortDir === "asc" ? "⬆︎" : "⬇︎"}
                    </button>
                  </div>

                  {/* Contador a la derecha */}
                  <div className="ml-auto">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
                      {empleadosFiltrados.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid de Cards (con fade) */}
            <div
              className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 transition-opacity duration-200 ${
                gridVisible ? "opacity-100" : "opacity-0"
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
                <p className="text-sm text-muted-foreground col-span-full">No se encontraron empleados.</p>
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
