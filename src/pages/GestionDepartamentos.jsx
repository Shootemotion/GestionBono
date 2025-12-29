// src/pages/GestionDepartamentos.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal.jsx";
import FormularioEstructura from "@/components/FormularioEstructura.jsx";
import AreaEditModal from "@/components/AreaEditModal.jsx";
import { Button } from "@/components/ui/button";

// Helper genérico para paginar cualquier endpoint tipo /empleados
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
      Array.isArray(data) ? data :
        Array.isArray(data?.docs) ? data.docs :
          Array.isArray(data?.items) ? data.items :
            Array.isArray(data?.data) ? data.data :
              Array.isArray(data?.rows) ? data.rows :
                [];

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

export default function GestionDepartamentos() {
  const { user } = useAuth();

  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  const [modal, setModal] = useState({ open: false, modo: null, data: null });
  const [editArea, setEditArea] = useState(null);
  const [globalEditMode, setGlobalEditMode] = useState(false); // Si true, el modal de área permite cambiar de área

  // Para unión visual / reorden / filtro por área
  const [hoveredAreaId, setHoveredAreaId] = useState(null);
  const [areaFilterId, setAreaFilterId] = useState(null); // al hacer click filtra

  // 🔐 Permisos
  const rolLower = String(user?.rol || "").toLowerCase();
  const isDirectivo =
    user?.isDirectivo ||
    rolLower === "director" ||
    rolLower === "directivo";

  const canEditStructure = user?.isSuper || user?.isRRHH || isDirectivo; // crear / eliminar áreas y sectores
  const canEditReferentes = canEditStructure || isDirectivo; // agregar / quitar referentes

  useEffect(() => {
    (async () => {
      try {
        const [a, s] = await Promise.all([api("/areas"), api("/sectores")]);

        // empleados: traemos TODAS las páginas y con visibilidad total
        const e = await fetchAll("/empleados", {
          pageSize: 500,
          params: { visibility: "all" },
        });

        const norm = (res) =>
          Array.isArray(res) ? res :
            Array.isArray(res?.data) ? res.data :
              Array.isArray(res?.items) ? res.items :
                Array.isArray(res?.results) ? res.results :
                  Array.isArray(res?.rows) ? res.rows :
                    Array.isArray(res?.docs) ? res.docs :
                      [];

        const areasN = norm(a);
        const sectoresN = norm(s);
        const empleadosN = Array.isArray(e) ? e : [];

        setAreas(areasN);
        setSectores(sectoresN);
        // normalizo _id a string para que ReferentesModal / AreaEditModal funcionen 1:1
        setEmpleados(empleadosN.map((x) => ({ ...x, _id: String(x._id ?? x.id) })));

        console.log("🟦 areas", { len: areasN.length, sample: areasN[0] });
        console.log("🟩 sectores", { len: sectoresN.length, sample: sectoresN[0] });
        console.log("🟨 empleados", { len: empleadosN.length, sample: empleadosN[0] });
      } catch (err) {
        console.error("❌ Error cargando áreas/sectores/empleados:", err);
        toast.error("No se pudieron cargar áreas/sectores/empleados.");
      }
    })();
  }, []);

  const open = (modo, data = null) => setModal({ open: true, modo, data });
  const close = () => setModal({ open: false, modo: null, data: null });

  const save = async (payload) => {
    const { modo, data } = modal;
    const isEdit = modo.startsWith("editar");
    const tipo = modo.split("_")[1];

    const path =
      tipo === "area"
        ? isEdit
          ? `/areas/${data._id}`
          : "/areas"
        : isEdit
          ? `/sectores/${data._id}`
          : "/sectores";

    try {
      const saved = await api(path, {
        method: isEdit ? "PUT" : "POST",
        body: payload,
      });

      if (tipo === "area") {
        setAreas((prev) =>
          isEdit ? prev.map((a) => (a._id === saved._id ? saved : a)) : [...prev, saved]
        );
      } else {
        setSectores((prev) =>
          isEdit ? prev.map((s) => (s._id === saved._id ? saved : s)) : [...prev, saved]
        );
      }

      toast.success("Guardado correcto.");
      close();
    } catch {
      toast.error("Error al guardar.");
    }
  };

  const delItem = async (tipo, id) => {
    if (!confirm("¿Eliminar definitivamente?")) return;
    try {
      await api(`/${tipo === "area" ? "areas" : "sectores"}/${id}`, {
        method: "DELETE",
      });
      if (tipo === "area") setAreas((p) => p.filter((a) => a._id !== id));
      else setSectores((p) => p.filter((s) => s._id !== id));
      toast.success("Eliminado.");
    } catch {
      toast.error("No se pudo eliminar.");
    }
  };

  // Helpers presentación
  const sectoresPorArea = useMemo(() => {
    const map = new Map();
    for (const s of sectores) {
      const aId = String(s?.areaId?._id ?? s?.areaId ?? "");
      if (!map.has(aId)) map.set(aId, []);
      map.get(aId).push(s);
    }
    return map;
  }, [sectores]);

  const empleadosPorArea = useMemo(() => {
    const cnt = new Map();
    for (const e of empleados) {
      const aId = String(e?.area?._id ?? e?.area ?? "");
      cnt.set(aId, (cnt.get(aId) || 0) + 1);
    }
    return cnt;
  }, [empleados]);

  const empleadosPorSector = useMemo(() => {
    const cnt = new Map();
    for (const e of empleados) {
      const sId = String(e?.sector?._id ?? e?.sector ?? "");
      cnt.set(sId, (cnt.get(sId) || 0) + 1);
    }
    return cnt;
  }, [empleados]);

  const countSectoresDeArea = (areaId) =>
    (sectoresPorArea.get(String(areaId)) || []).length;

  const nombresReferentes = (refs) =>
    (refs || [])
      .map(
        (r) =>
          [r?.apellido, r?.nombre].filter(Boolean).join(", ") ||
          r?.email ||
          "—"
      )
      .filter(Boolean)
      .join(" · ");

  // Reorden dinámico de sectores (hover) y filtro (click)
  const sectoresView = useMemo(() => {
    const base = Array.isArray(sectores) ? sectores : [];
    const list = [...base];

    if (areaFilterId) {
      return list.filter(
        (s) =>
          String(s?.areaId?._id ?? s?.areaId ?? "") ===
          String(areaFilterId)
      );
    }

    if (hoveredAreaId) {
      const first = [];
      const rest = [];
      for (const s of list) {
        const aId = String(s?.areaId?._id ?? s?.areaId ?? "");
        (aId === String(hoveredAreaId) ? first : rest).push(s);
      }
      return [...first, ...rest];
    }

    return list;
  }, [sectores, areaFilterId, hoveredAreaId]);

  const clearAreaFilter = () => setAreaFilterId(null);

  return (
    <div className="min-h-screen bg-[#f5f9fc]">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-8 py-6 space-y-6">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Gestión de Departamentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Alta/edición de áreas, sectores y referentes.
            </p>
          </div>
          {canEditStructure && (
            <div className="flex gap-2">
              {/* Botón Global de Asignación */}
              {canEditReferentes && (
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  onClick={() => {
                    if (areas.length > 0) {
                      setEditArea(areas[0]);
                      setGlobalEditMode(true);
                    } else {
                      toast.info("No hay áreas cargadas para asignar referentes.");
                    }
                  }}
                >
                  Asignar Referentes
                </Button>
              )}
              <Button
                className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0"
                onClick={() => open("crear_area")}
              >
                + Nueva Área
              </Button>
              <Button variant="outline" onClick={() => open("crear_sector")}>
                + Nueva Dependencia
              </Button>
            </div>
          )}
        </div>

        {/* Dos columnas ejecutivas */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ÁREAS */}
          <section className="rounded-xl bg-card text-card-foreground shadow-md ring-1 ring-border/60">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-semibold">Áreas</h2>
              <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
                {areas.length}
              </span>
            </div>

            <ul className="p-4 grid gap-3">
              {areas.map((a) => {
                const aId = String(a._id);
                const cantEmps = empleadosPorArea.get(aId) || 0;
                const refs = nombresReferentes(a?.referentes);

                const conectado = hoveredAreaId === aId;

                return (
                  <li
                    key={aId}
                    className={`group rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all cursor-pointer overflow-hidden ${conectado ? "ring-2 ring-primary ring-offset-2" : ""}`}
                    onMouseEnter={() => setHoveredAreaId(aId)}
                    onMouseLeave={() =>
                      setHoveredAreaId((v) => (v === aId ? null : v))
                    }
                    onClick={() => setAreaFilterId(prev => prev === aId ? null : aId)}
                    title={conectado ? "Click para quitar filtro" : "Click para filtrar dependencias"}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Icono / Inicial */}
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm transition-colors ${conectado ? "bg-blue-600 text-white shadow-blue-200" : "bg-white border border-slate-200 text-slate-500"}`}>
                        {a.nombre.charAt(0).toUpperCase()}
                      </div>

                      {/* Info Central: Nombre + Referente */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h3 className={`text-sm font-bold leading-none mb-1.5 transition-colors ${conectado ? "text-blue-700" : "text-slate-800"}`}>
                          {a.nombre}
                        </h3>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                          <span className="shrink-0 text-slate-400 font-medium">Líder:</span>
                          <span className="font-semibold text-slate-600">{refs || "—"}</span>
                        </div>
                      </div>

                      {/* Métricas (Lado derecho) */}
                      <div className="flex items-center gap-3 pr-2">
                        <div className="text-center bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 min-w-[60px]">
                          <div className="text-sm font-black text-slate-700 leading-none">{cantEmps}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Colab.</div>
                        </div>
                        <div className="text-center bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100 min-w-[60px]">
                          <div className="text-sm font-black text-blue-700 leading-none">{countSectoresDeArea(aId)}</div>
                          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mt-0.5">Deps.</div>
                        </div>
                      </div>

                      {/* Acciones flotantes (Hover) - Solo Eliminar/Editar datos. Referentes es global ahora */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-4 border-l pl-4">
                        {canEditStructure && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              delItem("area", aId);
                            }}
                            title="Eliminar área"
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}

              {areas.length === 0 && (
                <li className="text-sm text-muted-foreground py-10 text-center">
                  No hay áreas cargadas.
                </li>
              )}
            </ul>
          </section>

          {/* SECTORES */}
          <section className="rounded-xl bg-card text-card-foreground shadow-md ring-1 ring-border/60 relative">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">Dependencias</h2>
                {areaFilterId && (
                  <button
                    className="text-xs rounded-full bg-blue-50 text-blue-700 px-2 py-1 border border-blue-200 hover:bg-blue-100"
                    onClick={clearAreaFilter}
                    title="Quitar filtro"
                  >
                    Mostrar todos
                  </button>
                )}
              </div>
              <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
                {sectoresView.length}
              </span>
            </div>

            <ul className="p-4 grid gap-3">
              {sectoresView.map((s) => {
                const sId = String(s._id);
                const aId = String(s?.areaId?._id ?? s?.areaId ?? "");
                const cantEmps = empleadosPorSector.get(sId) || 0;

                const conectadoHover =
                  hoveredAreaId && hoveredAreaId === aId;

                const refs = nombresReferentes(s?.referentes);

                return (
                  <li
                    key={sId}
                    className={`group rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all overflow-hidden cursor-pointer ${conectadoHover ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Icono / Inicial */}
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-base font-bold shadow-sm ${conectadoHover ? "bg-blue-100 text-blue-700" : "bg-slate-50 text-slate-400"}`}>
                        {s.nombre.charAt(0).toUpperCase()}
                      </div>

                      {/* Info Central */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 leading-none">
                            {s.nombre}
                          </h3>
                          <span className="text-[10px] text-muted-foreground border px-1.5 rounded-full bg-slate-50">
                            {s?.areaId?.nombre || "—"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate mt-1">
                          <span className="shrink-0 text-slate-400">Líder:</span>
                          <span className="font-medium text-slate-700">{refs || "—"}</span>
                        </div>
                        {/* Líder Heredado del Área */}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
                          <span className="shrink-0 text-slate-400">Líder Área:</span>
                          <span className="font-medium text-slate-600">{nombresReferentes(areas.find(a => String(a._id) === aId)?.referentes) || "—"}</span>
                        </div>
                      </div>

                      {/* Métricas */}
                      <div className="flex items-center gap-4 pr-2">
                        <div className="text-center bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 min-w-[60px]">
                          <div className="text-sm font-black text-slate-700 leading-none">{cantEmps}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Colab.</div>
                        </div>
                      </div>

                      {/* Acciones flotantes */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-4 border-l pl-4">
                        {canEditStructure && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => open("editar_sector", s)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full"
                            title="Editar dependencia"
                          >
                            ✎
                          </Button>
                        )}
                        {canEditStructure && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-full"
                            onClick={() => delItem("sector", sId)}
                            title="Eliminar dependencia"
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}

              {sectoresView.length === 0 && (
                <li className="text-sm text-muted-foreground py-10 text-center">
                  {areaFilterId
                    ? "No hay dependencias para esta área."
                    : "No hay dependencias cargadas."}
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Modal crear/editar simple */}
        <Modal
          isOpen={modal.open}
          onClose={close}
          title={modal.modo?.replace("_", " ").toUpperCase()}
        >
          {modal.open && (
            <FormularioEstructura
              modo={modal.modo.includes("area") ? "area" : "sector"}
              onGuardar={save}
              onCancelar={close}
              areas={areas}
              datosIniciales={
                modal.modo.startsWith("editar") ? modal.data : null
              }
            />
          )}
        </Modal>

        {/* Modal edición completa de área + referentes */}
        <Modal
          isOpen={!!editArea}
          onClose={() => setEditArea(null)}
          title={`Editar Área: ${editArea?.nombre ?? ""}`}
          size="xxl"
        >
          {editArea && (
            <AreaEditModal
              area={editArea}
              empleados={empleados}
              initialTab="referentes"
              canEditReferentes={canEditReferentes}
              onClose={() => {
                setEditArea(null);
                setGlobalEditMode(false);
              }}
              // Props para selector de área
              allAreas={globalEditMode ? areas : []}
              onSwitchArea={(id) => {
                const found = areas.find(a => String(a._id) === String(id));
                if (found) setEditArea(found);
              }}
              onAreaUpdated={(upd) =>
                setAreas((p) =>
                  p.map((a) => (a._id === upd._id ? upd : a))
                )
              }
              onSectorUpdated={(upd) =>
                setSectores((p) =>
                  p.map((s) => (s._id === upd._id ? upd : s))
                )
              }
              onAreaDeleted={(id) =>
                setAreas((p) => p.filter((a) => a._id !== id))
              }
              onSectorDeleted={(id) =>
                setSectores((p) => p.filter((s) => s._id !== id))
              }
            />
          )}
        </Modal>
      </div>
    </div>
  );
}
