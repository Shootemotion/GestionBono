// src/pages/GestionDepartamentos.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal.jsx";
import FormularioEstructura from "@/components/FormularioEstructura.jsx";
import AreaEditModal from "@/components/AreaEditModal.jsx";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

// Helper generico para paginar cualquier endpoint tipo /empleados
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
    if (total && cur * ps < total) { page += 1; continue; }
    if (!total && chunk.length === ps) { page += 1; continue; }
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
  const [globalEditMode, setGlobalEditMode] = useState(false);

  const [hoveredAreaId, setHoveredAreaId] = useState(null);
  const [areaFilterId, setAreaFilterId] = useState(null);

  // Permisos
  const rolLower = String(user?.rol || "").toLowerCase();
  const isDirectivo = user?.isDirectivo || rolLower === "director" || rolLower === "directivo";
  const canEditStructure = user?.isSuper || user?.isRRHH || isDirectivo;
  const canEditReferentes = canEditStructure || isDirectivo;

  useEffect(() => {
    (async () => {
      try {
        const [a, s] = await Promise.all([api("/areas"), api("/sectores")]);
        const e = await fetchAll("/empleados", { pageSize: 500, params: { visibility: "all" } });
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
        setEmpleados(empleadosN.map((x) => ({ ...x, _id: String(x._id ?? x.id) })));
        console.log("areas", areasN.length, "sectores", sectoresN.length, "empleados", empleadosN.length);
      } catch (err) {
        console.error("Error cargando datos:", err);
        toast.error("No se pudieron cargar areas/sectores/empleados.");
      }
    })();
  }, []);

  const open = (modo, data = null) => setModal({ open: true, modo, data });
  const close = () => setModal({ open: false, modo: null, data: null });

  const save = async (payload) => {
    const { modo, data } = modal;
    const isEdit = modo.startsWith("editar");
    const tipo = modo.split("_")[1];
    const path = tipo === "area"
      ? isEdit ? `/areas/${data._id}` : "/areas"
      : isEdit ? `/sectores/${data._id}` : "/sectores";
    try {
      const saved = await api(path, { method: isEdit ? "PUT" : "POST", body: payload });
      if (tipo === "area") {
        setAreas((prev) => isEdit ? prev.map((a) => (a._id === saved._id ? saved : a)) : [...prev, saved]);
      } else {
        setSectores((prev) => isEdit ? prev.map((s) => (s._id === saved._id ? saved : s)) : [...prev, saved]);
      }
      toast.success("Guardado correcto.");
      close();
    } catch { toast.error("Error al guardar."); }
  };

  const delItem = async (tipo, id) => {
    if (!confirm("\u00bfEliminar definitivamente?")) return;
    try {
      await api(`/${tipo === "area" ? "areas" : "sectores"}/${id}`, { method: "DELETE" });
      if (tipo === "area") setAreas((p) => p.filter((a) => a._id !== id));
      else setSectores((p) => p.filter((s) => s._id !== id));
      toast.success("Eliminado.");
    } catch { toast.error("No se pudo eliminar."); }
  };

  // Helpers
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
      .map((r) => [r?.apellido, r?.nombre].filter(Boolean).join(", ") || r?.email || "\u2014")
      .filter(Boolean)
      .join(" \u00b7 ");

  const sectoresView = useMemo(() => {
    const base = Array.isArray(sectores) ? sectores : [];
    const list = [...base];
    if (areaFilterId) {
      return list.filter((s) => String(s?.areaId?._id ?? s?.areaId ?? "") === String(areaFilterId));
    }
    if (hoveredAreaId) {
      const first = [], rest = [];
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
      <div className="mx-auto max-w-[1500px] px-4 lg:px-8 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Gesti&oacute;n de Departamentos</h1>
            <p className="text-sm text-muted-foreground">Alta y edici&oacute;n de &aacute;reas, dependencias y referentes.</p>
          </div>
          {canEditStructure && (
            <div className="flex gap-2">
              {canEditReferentes && (
                <Button
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm gap-1.5"
                  onClick={() => {
                    if (areas.length > 0) { setEditArea(areas[0]); setGlobalEditMode(true); }
                    else toast.info("No hay areas cargadas para asignar referentes.");
                  }}
                >
                  <Users size={14} /> Asignar Referentes
                </Button>
              )}
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm gap-1.5" onClick={() => open("crear_area")}>
                <Plus size={14} /> Nueva &Aacute;rea
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 shadow-sm" onClick={() => open("crear_sector")}>
                <Plus size={14} /> Nueva Dependencia
              </Button>
            </div>
          )}
        </div>

        {/* Breadcrumb filtro activo */}
        {areaFilterId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={clearAreaFilter} className="text-blue-600 hover:underline">Todas las &aacute;reas</button>
            <span>/</span>
            <span className="text-slate-700 font-medium">
              {areas.find((a) => String(a._id) === areaFilterId)?.nombre || "\u00c1rea"}
            </span>
            <button onClick={clearAreaFilter} className="ml-1 text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100">
              &times; limpiar
            </button>
          </div>
        )}

        {/* Dos columnas */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* COL 1: Areas */}
          <section className="rounded-xl bg-white shadow-md ring-1 ring-border/60 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">&Aacute;reas</h2>
                <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{areas.length}</span>
              </div>
              {canEditStructure && (
                <Button size="sm" variant="ghost" className="h-7 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs" onClick={() => open("crear_area")}>
                  <Plus size={13} /> Nueva
                </Button>
              )}
            </div>

            <ul className="p-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "72vh" }}>
              {areas.map((a) => {
                const aId = String(a._id);
                const cantEmps = empleadosPorArea.get(aId) || 0;
                const cantDeps = countSectoresDeArea(aId);
                const refs = nombresReferentes(a?.referentes);
                const selected = areaFilterId === aId;
                const hovered = hoveredAreaId === aId;
                const active = selected || hovered;

                return (
                  <li
                    key={aId}
                    className={[
                      "group rounded-xl border cursor-pointer transition-all hover:shadow-md",
                      selected ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200"
                        : hovered ? "ring-1 ring-blue-300 bg-blue-50/50 border-blue-200"
                          : "bg-white border-slate-200 hover:border-blue-200",
                    ].join(" ")}
                    onMouseEnter={() => setHoveredAreaId(aId)}
                    onMouseLeave={() => setHoveredAreaId((v) => (v === aId ? null : v))}
                    onClick={() => setAreaFilterId((prev) => (prev === aId ? null : aId))}
                    title={selected ? "Click para quitar filtro" : "Click para filtrar dependencias"}
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <div className={[
                        "shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-black shadow-sm transition-colors",
                        active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
                      ].join(" ")}>
                        {a.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={["text-sm font-semibold leading-tight", active ? "text-blue-800" : "text-slate-800"].join(" ")}>
                          {a.nombre}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          <span className="text-slate-400 font-medium">L&iacute;der:</span>{" "}
                          <span className="text-slate-600">{refs || "\u2014"}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={["text-center px-2.5 py-1 rounded-lg border min-w-[48px]", active ? "bg-blue-100 border-blue-200" : "bg-slate-50 border-slate-100"].join(" ")}>
                          <div className={["text-xs font-black leading-none", active ? "text-blue-800" : "text-slate-700"].join(" ")}>{cantEmps}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Colab.</div>
                        </div>
                        <div className={["text-center px-2.5 py-1 rounded-lg border min-w-[48px]", active ? "bg-blue-200 border-blue-300" : "bg-blue-50/50 border-blue-100"].join(" ")}>
                          <div className={["text-xs font-black leading-none", active ? "text-blue-900" : "text-blue-700"].join(" ")}>{cantDeps}</div>
                          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mt-0.5">Deps.</div>
                        </div>
                      </div>
                      {canEditStructure && (
                        <div className="flex gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={(e) => { e.stopPropagation(); open("editar_area", a); }}
                            className="p-1.5 rounded-full hover:bg-blue-100 text-blue-500 hover:text-blue-700" title="Editar area">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); delItem("area", aId); }}
                            className="p-1.5 rounded-full hover:bg-rose-100 text-rose-500 hover:text-rose-700" title="Eliminar area">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              {areas.length === 0 && (
                <li className="text-xs text-muted-foreground text-center py-10">
                  No hay &aacute;reas cargadas.{" "}
                  {canEditStructure && <button className="text-blue-600 underline" onClick={() => open("crear_area")}>Crear una</button>}
                </li>
              )}
            </ul>
          </section>

          {/* COL 2: Dependencias */}
          <section className="rounded-xl bg-white shadow-md ring-1 ring-border/60 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">Dependencias</h2>
                <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{sectoresView.length}</span>
                {areaFilterId && (
                  <button onClick={clearAreaFilter}
                    className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100">
                    &times; {areas.find((a) => String(a._id) === areaFilterId)?.nombre}
                  </button>
                )}
              </div>
              {canEditStructure && (
                <Button size="sm" variant="ghost" className="h-7 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs" onClick={() => open("crear_sector")}>
                  <Plus size={13} /> Nueva
                </Button>
              )}
            </div>

            <ul className="p-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "72vh" }}>
              {sectoresView.map((s) => {
                const sId = String(s._id);
                const aId = String(s?.areaId?._id ?? s?.areaId ?? "");
                const cantEmps = empleadosPorSector.get(sId) || 0;
                const refs = nombresReferentes(s?.referentes);
                const areaRefs = nombresReferentes(areas.find((a) => String(a._id) === aId)?.referentes);
                const conectado = !!(hoveredAreaId && hoveredAreaId === aId);

                return (
                  <li
                    key={sId}
                    className={[
                      "group rounded-xl border transition-all hover:shadow-md",
                      conectado ? "ring-2 ring-emerald-400 bg-emerald-50 border-emerald-200"
                        : "bg-white border-slate-200 hover:border-emerald-200",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <div className={[
                        "shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-sm font-black shadow-sm",
                        conectado ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500",
                      ].join(" ")}>
                        {s.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={["text-sm font-semibold leading-tight", conectado ? "text-emerald-800" : "text-slate-800"].join(" ")}>
                            {s.nombre}
                          </p>
                          <span className={[
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                            conectado ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-slate-50 text-slate-500 border-slate-200",
                          ].join(" ")}>
                            {s?.areaId?.nombre || "\u2014"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          <span className="text-slate-400">L&iacute;der:</span>{" "}
                          <span className="text-slate-600 font-medium">{refs || "\u2014"}</span>
                        </p>
                        {areaRefs && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            <span className="text-slate-400">L&iacute;der &Aacute;rea:</span>{" "}
                            <span className="text-slate-500">{areaRefs}</span>
                          </p>
                        )}
                      </div>
                      <div className={[
                        "shrink-0 text-center px-2.5 py-1 rounded-lg border min-w-[48px]",
                        conectado ? "bg-emerald-100 border-emerald-200" : "bg-slate-50 border-slate-100",
                      ].join(" ")}>
                        <div className={["text-xs font-black leading-none", conectado ? "text-emerald-800" : "text-slate-700"].join(" ")}>{cantEmps}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Colab.</div>
                      </div>
                      {canEditStructure && (
                        <div className="flex gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => open("editar_sector", s)}
                            className="p-1.5 rounded-full hover:bg-blue-100 text-blue-500 hover:text-blue-700" title="Editar dependencia">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => delItem("sector", sId)}
                            className="p-1.5 rounded-full hover:bg-rose-100 text-rose-500 hover:text-rose-700" title="Eliminar dependencia">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              {sectoresView.length === 0 && (
                <li className="text-xs text-muted-foreground text-center py-10">
                  {areaFilterId ? "No hay dependencias para esta area." : "No hay dependencias cargadas."}{" "}
                  {canEditStructure && <button className="text-blue-600 underline" onClick={() => open("crear_sector")}>Crear una</button>}
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Modal crear/editar simple */}
        <Modal isOpen={modal.open} onClose={close} title={modal.modo?.replace("_", " ").toUpperCase()}>
          {modal.open && (
            <FormularioEstructura
              modo={modal.modo.includes("area") ? "area" : "sector"}
              onGuardar={save}
              onCancelar={close}
              areas={areas}
              datosIniciales={modal.modo.startsWith("editar") ? modal.data : null}
            />
          )}
        </Modal>

        {/* Modal edicion completa de area + referentes */}
        <Modal isOpen={!!editArea} onClose={() => setEditArea(null)} title={`Editar Area: ${editArea?.nombre ?? ""}`} size="xxl">
          {editArea && (
            <AreaEditModal
              area={editArea}
              empleados={empleados}
              initialTab="referentes"
              canEditReferentes={canEditReferentes}
              onClose={() => { setEditArea(null); setGlobalEditMode(false); }}
              allAreas={globalEditMode ? areas : []}
              onSwitchArea={(id) => {
                const found = areas.find((a) => String(a._id) === String(id));
                if (found) setEditArea(found);
              }}
              onAreaUpdated={(upd) => setAreas((p) => p.map((a) => (a._id === upd._id ? upd : a)))}
              onSectorUpdated={(upd) => setSectores((p) => p.map((s) => (s._id === upd._id ? upd : s)))}
              onAreaDeleted={(id) => setAreas((p) => p.filter((a) => a._id !== id))}
              onSectorDeleted={(id) => setSectores((p) => p.filter((s) => s._id !== id))}
            />
          )}
        </Modal>
      </div>
    </div>
  );
}
