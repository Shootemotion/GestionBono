// src/components/AreaEditModal.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * AreaEditModal - versión con columnas iguales y bloques alineados
 */
export default function AreaEditModal({
  area,
  empleados = [],
  initialTab = "datos",
  focusSectorId = null,
  onClose,
  onAreaUpdated,
  onSectorUpdated,
  onAreaDeleted,
  // Nuevas props para "Selector de Área" dentro del modal
  allAreas = [],
  onSwitchArea, // (areaId) => ...

  onSectorDeleted,
}) {
  const [nombre, setNombre] = useState(area?.nombre || "");
  const [editingName, setEditingName] = useState(false); // Para editar nombre rápido
  const [saving, setSaving] = useState(false);

  // sectores del área
  const [sectores, setSectores] = useState([]);
  const [loadingSectores, setLoadingSectores] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSectores(true);
      try {
        const all = await api("/sectores");
        if (!mounted) return;
        const list = (all || []).filter(
          (s) => String(s?.areaId?._id || s?.areaId) === String(area._id)
        );
        setSectores(list);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar los sectores del área.");
      } finally {
        setLoadingSectores(false);
      }
    })();
    return () => { mounted = false; };
  }, [area?._id]);

  // --- REFERENTES DE ÁREA ---
  const preSelArea = useMemo(() => {
    const ids = new Set((area?.referentes || []).map((r) => String(r?._id || r)));
    return ids;
  }, [area?.referentes]);

  const [selArea, setSelArea] = useState(() => new Set());
  useEffect(() => setSelArea(new Set(preSelArea)), [preSelArea]);

  const toggleAreaRef = (id) => {
    setSelArea((prev) => {
      const next = new Set(prev);
      const sid = String(id);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  };

  const saveAreaReferentes = async () => {
    try {
      const body = { referentes: Array.from(selArea) };
      const updated = await api(`/areas/${area._id}/referentes`, { method: "PUT", body });
      toast.success("Referentes de área guardados");
      onAreaUpdated?.(updated);
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron guardar los referentes del área");
    }
  };

  // --- REFERENTES POR SECTOR ---
  const inicialSectorState = (s) => {
    const current = (s?.referentes || []).map((r) => String(r?._id || r));
    const hereda = current.length === 0; // vacío => hereda del área
    return { hereda, sel: new Set(current) };
  };

  const [sectorState, setSectorState] = useState({});
  useEffect(() => {
    const map = {};
    sectores.forEach((s) => (map[s._id] = inicialSectorState(s)));
    setSectorState(map);
  }, [sectores]);

  const setSectorHereda = (id, hereda) =>
    setSectorState((prev) => ({ ...prev, [id]: { ...prev[id], hereda } }));

  const toggleSectorRef = (sectorId, empId) =>
    setSectorState((prev) => {
      const st = prev[sectorId] || { hereda: true, sel: new Set() };
      const nextSel = new Set(st.sel);
      const sid = String(empId);
      nextSel.has(sid) ? nextSel.delete(sid) : nextSel.add(sid);
      return { ...prev, [sectorId]: { ...st, sel: nextSel } };
    });

  const saveOneSector = async (s) => {
    try {
      const st = sectorState[s._id] || { hereda: true, sel: new Set() };
      const body = {
        heredaReferentes: !!st.hereda,
        referentes: st.hereda ? [] : Array.from(st.sel),
      };
      const updated = await api(`/sectores/${s._id}/referentes`, { method: "PUT", body });
      toast.success(`Referentes guardados: ${s.nombre}`);
      onSectorUpdated?.(updated);
      setSectorState((prev) => ({ ...prev, [s._id]: { hereda: !!updated.heredaReferentes, sel: new Set((updated.referentes || []).map(r => String(r._id || r))) } }));
      setSectores((prev) => prev.map(x => x._id === updated._id ? updated : x));
    } catch (e) {
      console.error(e);
      toast.error(`No se pudieron guardar referentes de ${s.nombre}`);
    }
  };

  // --- DATOS DEL ÁREA ---
  const saveAreaDatos = async () => {
    try {
      setSaving(true);
      const updated = await api(`/areas/${area._id}`, { method: "PUT", body: { nombre } });
      toast.success("Área actualizada");
      onAreaUpdated?.(updated);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el área");
    } finally {
      setSaving(false);
    }
  };

  const deleteArea = async () => {
    if (!confirm("¿Eliminar esta área? Se validará que no tenga sectores/empleados.")) return;
    try {
      await api(`/areas/${area._id}`, { method: "DELETE" });
      toast.success("Área eliminada");
      onAreaDeleted?.(area._id);
      onClose?.();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo eliminar el área");
    }
  };

  // buscadores: qArea + qSectorMap
  const [qArea, setQArea] = useState("");
  const [qSectorMap, setQSectorMap] = useState({});
  const setQSector = (id, val) => setQSectorMap(prev => ({ ...prev, [id]: val }));

  const refsCount = (s) => (Array.isArray(s) ? s.length : (s ? s.size || 0 : 0));

  // helpers para filtrar empleados segun query
  const filterEmpleados = (q) => {
    const t = (q || "").trim().toLowerCase();
    if (!t) return empleados;
    return empleados.filter(e => {
      const nom = `${e.apellido || ""} ${e.nombre || ""}`.toLowerCase();
      return nom.includes(t) || (e.dni || "").includes(t) || (e.puesto || "").toLowerCase().includes(t);
    });
  };

  // lista filtrada para AREA y para cada sector según su query
  // lista filtrada para AREA (selected arriba)
  const listaAreaFiltered = useMemo(() => {
    const arr = filterEmpleados(qArea).slice(); // copia
    arr.sort((a, b) => {
      const aSel = selArea.has(String(a._id));
      const bSel = selArea.has(String(b._id));
      if (aSel === bSel) {
        // si ambos igual, ordenar por apellido/nombre
        const an = `${a.apellido || ''} ${a.nombre || ''}`.toLowerCase();
        const bn = `${b.apellido || ''} ${b.nombre || ''}`.toLowerCase();
        return an.localeCompare(bn);
      }
      return aSel ? -1 : 1; // seleccionado primero
    });
    return arr;
  }, [qArea, empleados, selArea]);


  const sectorFiltered = (sectorId) => {
    const q = qSectorMap[sectorId] || "";
    const arr = filterEmpleados(q).slice();

    const st = sectorState[sectorId];
    const selSet = st?.sel || new Set();

    arr.sort((a, b) => {
      const aSel = selSet.has(String(a._id));
      const bSel = selSet.has(String(b._id));
      if (aSel === bSel) {
        const an = `${a.apellido || ''} ${a.nombre || ''}`.toLowerCase();
        const bn = `${b.apellido || ''} ${b.nombre || ''}`.toLowerCase();
        return an.localeCompare(bn);
      }
      return aSel ? -1 : 1;
    });

    return arr;
  };

  return (
    <div className="space-y-4" size="XxL">
      {/* Header Compacto: Selector o Título Editable */}
      <div className="flex items-center justify-between gap-4 mb-4 border-b pb-3 border-slate-100">
        <div className="flex-1 min-w-0">
          {allAreas.length > 0 && onSwitchArea ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Area:</span>
              <select
                className="flex-1 max-w-xs rounded-md border-0 bg-slate-50 py-1.5 pl-3 pr-8 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 sm:text-sm sm:leading-6"
                value={area._id}
                onChange={(e) => onSwitchArea(e.target.value)}
              >
                {allAreas.map(a => (
                  <option key={a._id} value={a._id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          ) : (
            editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="px-2 py-1 text-lg font-bold border rounded w-full"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  onBlur={() => setEditingName(false)}
                />
                <Button size="xs" onClick={() => { saveAreaDatos(); setEditingName(false); }}>OK</Button>
              </div>
            ) : (
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 cursor-pointer hover:text-slate-600" onClick={() => setEditingName(true)} title="Click para editar nombre">
                {area.nombre}
                <span className="text-slate-300 text-xs font-normal">✎</span>
              </h2>
            )
          )}
        </div>
      </div>

      {/* Grid Principal Compacto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[60vh]">
        {/* COLUMNA IZQUIERDA: Área Referentes */}
        <div className="flex flex-col h-full bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Referentes Globales</span>
            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-medium">
              {refsCount(selArea)} Asignados
            </span>
          </div>

          <div className="flex-1 flex flex-col p-2 overflow-hidden">
            {/* Buscador minimalista */}
            <div className="mb-2 relative">
              <input
                className="w-full rounded-md border-0 bg-white py-1.5 pl-8 text-xs ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500"
                placeholder="Buscar..."
                value={qArea}
                onChange={(e) => setQArea(e.target.value)}
              />
              <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
            </div>

            <div className="flex gap-2 mb-3">
              <Button variant="outline" onClick={() => {
                setSelArea(new Set(listaAreaFiltered.map(e => String(e._id))));
              }}>Seleccionar visibles</Button>
              <Button variant="outline" onClick={() => setSelArea(new Set(preSelArea))}>Revertir selección</Button>
            </div>

            <div className="flex-1 max-h-[44vh] overflow-auto border rounded p-2">
              <div className="grid grid-cols-1 gap-2">
                {listaAreaFiltered.map((e) => {
                  const id = String(e._id);
                  const checked = selArea.has(id);
                  return (
                    <label key={id} className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer ${checked ? "bg-accent/50" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleAreaRef(id)} />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.apellido}, {e.nombre}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.puesto || "—"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end mt-3 gap-2">
              <Button variant="outline" onClick={() => setSelArea(new Set(preSelArea))}>Revertir</Button>
              <Button onClick={saveAreaReferentes}>Guardar referentes de área</Button>
            </div>
          </div>
        </div>

        {/* DERECHA: Referentes por Sector */}
        <div>
          <div className="flex items-center justify-between mb-3 min-h-[44px] bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="text-sm font-semibold text-slate-800">Referentes por Dependencia</div>
            <div className="text-[11px] text-muted-foreground">{sectores.length} dependencia(s)</div>
          </div>

          <div className="space-y-4">
            {loadingSectores ? (
              <div className="text-sm text-muted-foreground">Cargando sectores…</div>
            ) : sectores.length === 0 ? (
              <div className="text-sm text-muted-foreground">Esta área no tiene dependencias.</div>
            ) : (
              sectores.map((s) => {
                const st = sectorState[s._id] || { hereda: true, sel: new Set() };
                const filtered = sectorFiltered(s._id);
                return (
                  <div key={s._id} className="rounded-md border p-3 bg-white flex flex-col h-full">
                    <div className="flex items-start justify-between mb-2 min-h-[44px]">
                      <div>
                        <div className="font-medium">{s.nombre}</div>
                        <div className="text-xs text-muted-foreground">Dependencia</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">Referentes: {refsCount(st.sel)}</div>
                        <label className="text-xs inline-flex items-center gap-2">
                          <input type="checkbox" checked={!!st.hereda} onChange={(e) => setSectorHereda(s._id, e.target.checked)} />
                          <span className="text-xs">Hereda referentes del área</span>
                        </label>
                      </div>
                    </div>

                    <div className="mb-3">
                      <input
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        placeholder={`Buscar en ${s.nombre}...`}
                        value={qSectorMap[s._id] || ""}
                        onChange={(e) => setQSector(s._id, e.target.value)}
                        disabled={!!st.hereda}
                      />
                    </div>

                    {!st.hereda ? (
                      <>
                        <div className="mb-3 flex gap-2">
                          <Button variant="outline" onClick={() => {
                            setSectorState(prev => ({ ...prev, [s._id]: { ...(prev[s._id] || inicialSectorState(s)), sel: new Set(filtered.map(e => String(e._id))) } }));
                          }}>Seleccionar visibles</Button>
                          <Button variant="outline" onClick={() => setSectorState(prev => ({ ...prev, [s._id]: inicialSectorState(s) }))}>Revertir</Button>
                        </div>

                        <div className="flex-1 max-h-[36vh] overflow-auto border rounded p-2">
                          <div className="grid grid-cols-1 gap-2">
                            {filtered.map((e) => {
                              const id = String(e._id);
                              const checked = (st.sel || new Set()).has(id);
                              return (
                                <label key={id} className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer ${checked ? "bg-accent/50" : ""}`}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleSectorRef(s._id, id)} />
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{e.apellido}, {e.nombre}</div>
                                    <div className="text-xs text-muted-foreground truncate">{e.puesto || "—"}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-2">
                          <Button variant="outline" onClick={() => setSectorState(prev => ({ ...prev, [s._id]: inicialSectorState(s) }))}>Revertir</Button>
                          <Button onClick={() => saveOneSector(s)}>Guardar referentes</Button>
                          <Button variant="destructive" onClick={async () => {
                            if (!confirm(`Eliminar sector ${s.nombre}?`)) return;
                            try {
                              await api(`/sectores/${s._id}`, { method: "DELETE" });
                              toast.success("Sector eliminado");
                              onSectorDeleted?.(s._id);
                              setSectores(prev => prev.filter(x => x._id !== s._id));
                            } catch (err) {
                              console.error(err);
                              toast.error(err?.data?.message || "No se pudo eliminar el sector");
                            }
                          }}>Eliminar sector</Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground mt-2">
                        Esta dependencia está heredando los referentes del área. Desmarcá la opción para asignar referentes personalizados.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
