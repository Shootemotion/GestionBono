import { useEffect, useState, useRef } from "react";
import { api, API_ORIGIN } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Building, Briefcase, Calendar, FileText, Upload, X, Loader2, Star } from "lucide-react";

export default function CarreraTable({ empleadoId, canEdit, areas = [], sectores = [], initialData = null, autoOpen = false, onAutoOpenComplete }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ puesto: "", area: "", sector: "", desde: "", hasta: "", motivo: "", principal: false });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Perfil de puesto firmado (adjunto por puesto)
  const fileInputRef = useRef(null);
  const [targetId, setTargetId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const buildFileUrl = (url) => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
    return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
  };

  const pickPerfil = (itemId) => {
    setTargetId(itemId);
    fileInputRef.current?.click();
  };

  const onPerfilChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permitir re-seleccionar el mismo archivo
    if (!file || !targetId) return;
    const itemId = targetId;
    try {
      setBusyId(itemId);
      const fd = new FormData();
      fd.append("archivo", file);
      const updated = await api(`/empleados/${empleadoId}/carrera/${itemId}/perfil`, { method: "POST", body: fd });
      setItems((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
      toast.success("Perfil de puesto adjuntado.");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "No se pudo adjuntar el perfil.");
    } finally {
      setBusyId(null);
      setTargetId(null);
    }
  };

  const onDeletePerfil = async (itemId) => {
    if (!window.confirm("¿Eliminar el perfil de puesto adjunto?")) return;
    try {
      setBusyId(itemId);
      const updated = await api(`/empleados/${empleadoId}/carrera/${itemId}/perfil`, { method: "DELETE" });
      setItems((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
      toast.success("Perfil eliminado.");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "No se pudo eliminar el perfil.");
    } finally {
      setBusyId(null);
    }
  };

  // Filter sectors based on selected area
  const filteredSectores = form.area
    ? sectores.filter(s => {
      // areaId might be populated object or raw ID
      const sAreaId = s.areaId?._id || s.areaId;
      return String(sAreaId) === String(form.area);
    })
    : [];

  const load = async () => {
    try {
      setLoading(true);
      const data = await api(`/empleados/${empleadoId}/carrera`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cargar la carrera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [empleadoId]);

  // Handle auto-open from redirection
  const handledAutoOpen = useRef(false);
  useEffect(() => {
    if (autoOpen && initialData && !handledAutoOpen.current) {
      setForm((prev) => ({
        ...prev,
        puesto: initialData.puesto || "",
        area: initialData.area || "",
        sector: initialData.sector || "",
        desde: new Date().toISOString().split("T")[0], // Default to today
        motivo: "Cambio de Estructura / Promoción",
      }));
      setOpen(true);
      handledAutoOpen.current = true;
      if (onAutoOpenComplete) onAutoOpenComplete();
    }
  }, [autoOpen, initialData, onAutoOpenComplete]);

  const onAdd = async () => {
    try {
      if (!form.puesto || !form.desde) return toast.error("Puesto y Desde son obligatorios.");
      const payload = {
        puesto: form.puesto,
        desde: new Date(form.desde),
        hasta: form.hasta ? new Date(form.hasta) : null,
        motivo: form.motivo || "",
        area: form.area || undefined,
        sector: form.sector || undefined,
        principal: !!form.principal,
      };
      await api(`/empleados/${empleadoId}/carrera`, { method: "POST", body: payload });
      // Recargamos: si se marcó principal, el backend desmarcó a los demás.
      await load();
      setForm({ puesto: "", area: "", sector: "", desde: "", hasta: "", motivo: "", principal: false });
      setOpen(false);
      toast.success("Registro agregado.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo agregar.");
    }
  };

  const onDelete = async (itemId) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    try {
      await api(`/empleados/${empleadoId}/carrera/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x._id !== itemId));
      toast.success("Registro eliminado.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo eliminar.");
    }
  };

  const onSetPrincipal = async (itemId) => {
    try {
      await api(`/empleados/${empleadoId}/carrera/${itemId}/principal`, { method: "PATCH" });
      // El backend desmarca a los demás: recargamos para reflejarlo.
      await load();
      toast.success("Puesto principal actualizado.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo actualizar el principal.");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {/* <h3 className="text-sm font-semibold">Desarrollo Profesional</h3> */}
        {/* Header content managed by parent usually, but button goes here */}
        <div className="flex-1"></div>
        {canEdit && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Agregar Puesto
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="text-left px-4 py-3">Puesto</th>
                <th className="text-left px-4 py-3">Organización</th>
                <th className="text-left px-4 py-3">Período</th>
                <th className="text-left px-4 py-3">Motivo / Detalle</th>
                <th className="text-left px-4 py-3">Perfil de puesto</th>
                {canEdit && <th className="px-4 py-3 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={canEdit ? 6 : 5}>Cargando historial...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={canEdit ? 6 : 5}>Sin registros de carrera.</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                        <Briefcase size={14} className="text-slate-400" />
                        {it.puesto}
                        {it.principal && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                            <Star size={10} className="fill-amber-500 text-amber-500" /> Principal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-medium">{it.area?.nombre || it.area || "—"}</span>
                        <span className="text-xs text-slate-500">{it.sector?.nombre || it.sector || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-xs">
                        <span className="text-emerald-700 font-medium">
                          {new Date(it.desde).toLocaleDateString()}
                        </span>
                        {it.hasta && (
                          <span className="text-slate-400">
                            hasta {new Date(it.hasta).toLocaleDateString()}
                          </span>
                        )}
                        {!it.hasta && <span className="text-emerald-600/70 text-[10px] uppercase font-bold tracking-wide mt-0.5">Actual</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs italic max-w-[200px] truncate" title={it.motivo}>
                      {it.motivo || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {it.perfilPuestoUrl ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={buildFileUrl(it.perfilPuestoUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                            title={it.perfilPuestoNombre || "Ver perfil de puesto firmado"}
                          >
                            <FileText size={13} />
                            Ver
                          </a>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => pickPerfil(it._id)}
                                disabled={busyId === it._id}
                                className="p-1 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
                                title="Reemplazar archivo"
                              >
                                {busyId === it._id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                              </button>
                              <button
                                onClick={() => onDeletePerfil(it._id)}
                                disabled={busyId === it._id}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                                title="Eliminar perfil"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      ) : canEdit ? (
                        <button
                          onClick={() => pickPerfil(it._id)}
                          disabled={busyId === it._id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
                          title="Adjuntar perfil de puesto firmado"
                        >
                          {busyId === it._id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          Adjuntar
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!it.principal && (
                            <button
                              onClick={() => onSetPrincipal(it._id)}
                              className="p-1 text-slate-300 hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Marcar como puesto principal"
                            >
                              <Star size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(it._id)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Eliminar registro"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Input oculto para adjuntar perfil de puesto firmado */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        className="hidden"
        onChange={onPerfilChosen}
      />

      {/* Modal Agregar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Puesto / Movimiento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Puesto *</label>
              <input
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Ej. Analista Sr."
                value={form.puesto}
                onChange={(e) => setForm(f => ({ ...f, puesto: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Área</label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.area}
                  onChange={(e) => setForm(f => ({ ...f, area: e.target.value, sector: "" }))}
                >
                  <option value="">Seleccionar Área</option>
                  {areas.map(a => (
                    <option key={a._id} value={a._id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Dependencia</label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.sector}
                  onChange={(e) => setForm(f => ({ ...f, sector: e.target.value }))}
                  disabled={!form.area}
                >
                  <option value="">Seleccionar Dependencia</option>
                  {filteredSectores.map(s => (
                    <option key={s._id} value={s._id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Desde *</label>
                <input
                  type="date"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.desde}
                  onChange={(e) => setForm(f => ({ ...f, desde: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Hasta</label>
                <input
                  type="date"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.hasta}
                  onChange={(e) => setForm(f => ({ ...f, hasta: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Motivo</label>
              <input
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Promoción, Cambio de área..."
                value={form.motivo}
                onChange={(e) => setForm(f => ({ ...f, motivo: e.target.value }))}
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/30"
                checked={form.principal}
                onChange={(e) => setForm(f => ({ ...f, principal: e.target.checked }))}
              />
              <span className="text-xs text-slate-600 leading-snug">
                <span className="font-semibold text-slate-700 flex items-center gap-1"><Star size={12} className="text-amber-500" /> Marcar como puesto principal</span>
                Define el área/sector/puesto del empleado. Podés tener varios puestos vigentes a la vez (simultáneos); solo uno es el principal.
              </span>
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onAdd}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-colors"
            >
              Guardar Puesto
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
