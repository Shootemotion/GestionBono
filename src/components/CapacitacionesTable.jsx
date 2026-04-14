import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Calendar, FileText, Clock, AlertTriangle, ExternalLink, CheckCircle, XCircle, Edit } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function CapacitacionesTable({ empleadoId, canEdit, onChange }) {
  const { user } = useAuth();
  const isSelf = user?.empleadoId === empleadoId || user?.empleado === empleadoId;
  const canModify = canEdit || isSelf;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: "", proveedor: "", horas: "", fecha: "",
    vence: false, fechaVto: "", estado: "PENDIENTE", lugar: "", certificado: null
  });
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api(`/empleados/${empleadoId}/capacitaciones`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar las capacitaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [empleadoId]);

  const onAdd = async () => {
    try {
      if (!form.nombre || !form.fecha) return toast.error("Nombre y Fecha son obligatorios.");
      const fd = new FormData();
      fd.append("nombre", form.nombre);
      fd.append("proveedor", form.proveedor || "");
      fd.append("horas", String(form.horas || 0));
      fd.append("fecha", new Date(form.fecha).toISOString());
      fd.append("vence", String(!!form.vence));
      if (form.vence && form.fechaVto) fd.append("fechaVto", new Date(form.fechaVto).toISOString());
      fd.append("lugar", form.lugar || "");
      fd.append("estado", form.estado || "PENDIENTE");
      if (form.certificado) fd.append("certificado", form.certificado);

      if (editingId) {
        const updated = await api(`/empleados/${empleadoId}/capacitaciones/${editingId}`, { method: "PUT", body: fd });
        setItems(prev => prev.map(x => x._id === editingId ? updated : x));
        toast.success("Capacitación actualizada.");
      } else {
        const created = await api(`/empleados/${empleadoId}/capacitaciones`, { method: "POST", body: fd });
        setItems((prev) => [created, ...prev]);
        toast.success("Capacitación registrada.");
      }

      setForm({ nombre: "", proveedor: "", horas: "", fecha: "", vence: false, fechaVto: "", lugar: "", estado: "PENDIENTE", certificado: null });
      setEditingId(null);
      setOpen(false);
      onChange?.();
    } catch (e) {
      console.error(e);
      toast.error(editingId ? "No se pudo actualizar." : "No se pudo registrar.");
    }
  };

  const onDelete = async (itemId) => {
    if (!window.confirm("¿Eliminar esta capacitación?")) return;
    try {
      await api(`/empleados/${empleadoId}/capacitaciones/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter(x => x._id !== itemId));
      toast.success("Capacitación eliminada.");
      onChange?.();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo eliminar.");
    }
  };

  const onUpdateStatus = async (itemId, newStatus) => {
    try {
      const updated = await api(`/empleados/${empleadoId}/capacitaciones/${itemId}`, {
        method: "PUT",
        body: { estado: newStatus }
      });
      setItems(prev => prev.map(x => x._id === itemId ? updated : x));
      toast.success(`Estado actualizado a ${newStatus}.`);
      onChange?.();
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar estado.");
    }
  };

  const onUploadAssignedCertificate = async (itemId, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("estado", "PENDIENTE");
      fd.append("certificado", file);
      const updated = await api(`/empleados/${empleadoId}/capacitaciones/${itemId}`, {
        method: "PUT",
        body: fd
      });
      setItems(prev => prev.map(x => x._id === itemId ? updated : x));
      toast.success("Certificado subido correctamente. Enviado para aprobación.");
      onChange?.();
    } catch (e) {
      console.error(e);
      toast.error("Error al subir el certificado.");
    }
  };

  const getStatusBadge = (estado) => {
    switch (estado) {
      case "PENDIENTE":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><Clock size={10} /> Pendiente</span>;
      case "VERIFICADO":
      case "COMPLETO":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle size={10} /> Validado</span>;
      case "RECHAZADO":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700"><XCircle size={10} /> Rechazado</span>;
      case "POR_REALIZAR":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700"><AlertTriangle size={10} /> Por Realizar</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {/* <h3 className="text-sm font-semibold">Capacitaciones</h3> */}
        <div className="flex-1"></div>
        {canModify && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm({ nombre: "", proveedor: "", horas: "", fecha: "", vence: false, fechaVto: "", lugar: "", estado: "PENDIENTE", certificado: null });
              setOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Agregar Capacitación
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Curso / Taller</th>
                <th className="text-left px-4 py-3">Proveedor</th>
                <th className="text-left px-4 py-3">Horas / Lugar</th>
                <th className="text-left px-4 py-3">Vencimiento</th>
                <th className="text-left px-4 py-3">Certificado</th>
                {canModify && <th className="px-4 py-3 w-28 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={7}>Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={7}>Sin registros.</td></tr>
              ) : (
                items.map(it => (
                  <tr key={it._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {it.fecha ? new Date(it.fecha).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{it.nombre}</div>
                      <div className="mt-1">{getStatusBadge(it.estado)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{it.proveedor || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          {it.horas ?? 0} hs
                        </div>
                        {it.lugar && (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 opacity-80">
                            • {it.lugar}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {it.vence ? (
                        <span className={`flex items-center gap-1 text-xs font-medium ${new Date(it.fechaVto) < new Date() ? "text-amber-600" : "text-slate-600"}`}>
                          {it.fechaVto ? new Date(it.fechaVto).toLocaleDateString() : "—"}
                          {new Date(it.fechaVto) < new Date() && <AlertTriangle size={12} />}
                        </span>
                      ) : <span className="text-slate-400 text-xs">No vence</span>}
                    </td>
                    <td className="px-4 py-3">
                      {it.certificadoUrl ? (
                        <a
                          href={(() => {
                            const url = it.certificadoUrl;
                            if (/^https?:\/\//i.test(url)) return url;
                            const apiOrigin = typeof API_ORIGIN !== 'undefined' ? API_ORIGIN : window.location.origin;
                            const base = typeof process !== 'undefined' && process.env?.VITE_API_URL ? process.env.VITE_API_URL : apiOrigin;
                            // Clean up base to avoid duplicate slashes if needed, though simple concat often works
                            // Just relative path if same domain... usually API returns relative /uploads/... 
                            // The original code used a simple leading slash, so we'll stick to that or logic used elsewhere.
                            // Checking generic usage:
                            return url.startsWith('/') ? url : `/${url}`;
                          })()}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 underline decoration-indigo-200 hover:decoration-indigo-800 transition-all"
                        >
                          <FileText size={12} /> Ver PDF
                        </a>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {canModify && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                          {/* HR Verification Options */}
                          {canEdit && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(it._id);
                                  setForm({
                                    nombre: it.nombre || "",
                                    proveedor: it.proveedor || "",
                                    horas: it.horas || "",
                                    fecha: it.fecha ? String(it.fecha).slice(0, 10) : "",
                                    vence: !!it.vence,
                                    fechaVto: it.fechaVto ? String(it.fechaVto).slice(0, 10) : "",
                                    lugar: it.lugar || "",
                                    estado: it.estado || "PENDIENTE",
                                    certificado: null
                                  });
                                  setOpen(true);
                                }}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Editar Capacitación"
                              >
                                <Edit size={16} />
                              </button>
                            </>
                          )}

                          {canEdit && it.estado === "PENDIENTE" && (
                            <>
                              <button
                                onClick={() => onUpdateStatus(it._id, "VERIFICADO")}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Aprobar"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={() => onUpdateStatus(it._id, "RECHAZADO")}
                                className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                title="Rechazar"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}

                          {/* Employee Upload Option for assigned trainings */}
                          {isSelf && it.estado === "POR_REALIZAR" && (
                            <div>
                              <label className="cursor-pointer inline-flex items-center justify-center p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Subir Certificado">
                                <Plus size={16} />
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.doc,.docx"
                                  onChange={(e) => onUploadAssignedCertificate(it._id, e.target.files?.[0])}
                                />
                              </label>
                            </div>
                          )}

                          {/* Delete Action */}
                          {(canEdit || (isSelf && it.estado === "PENDIENTE")) && (
                            <button
                              onClick={() => onDelete(it._id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
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

      {/* Modal Agregar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Capacitación" : "Nueva Capacitación"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Curso / Taller *</label>
              <input
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Ej. Liderazgo Efectivo"
                value={form.nombre}
                onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Proveedor</label>
                <input
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.proveedor}
                  onChange={(e) => setForm(f => ({ ...f, proveedor: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Horas</label>
                <input
                  type="number"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.horas}
                  onChange={(e) => setForm(f => ({ ...f, horas: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Lugar de Impartición</label>
                <input
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Ej. Sede Central, Virtual, etc."
                  value={form.lugar}
                  onChange={(e) => setForm(f => ({ ...f, lugar: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Fecha *</label>
                <input
                  type="date"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.fecha}
                  onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border rounded-lg p-3 bg-slate-50">
              <input
                type="checkbox"
                id="venceCheck"
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                checked={form.vence}
                onChange={(e) => setForm(f => ({ ...f, vence: e.target.checked }))}
              />
              <label htmlFor="venceCheck" className="text-sm font-medium text-slate-700 select-none cursor-pointer flex-1">Tiene vencimiento</label>

              {form.vence && (
                <input
                  type="date"
                  className="h-8 rounded-md border border-slate-300 text-xs px-2"
                  value={form.fechaVto}
                  onChange={(e) => setForm(f => ({ ...f, fechaVto: e.target.value }))}
                />
              )}
            </div>

            {canEdit && (
              <div className="grid gap-2 mt-2 pt-2 border-t">
                <label className="text-xs font-semibold uppercase text-slate-500">Estado de Asignación (RRHH)</label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={form.estado}
                  onChange={(e) => setForm(f => ({ ...f, estado: e.target.value }))}
                >
                  <option value="PENDIENTE">Esperando Aprobación (Pendiente)</option>
                  <option value="VERIFICADO">Capacitación Finalizada (Verificado)</option>
                  <option value="POR_REALIZAR">Asignación Futura (Por Realizar)</option>
                  <option value="RECHAZADO">No Terminada / Reprobada (Rechazado)</option>
                </select>
                <span className="text-[10px] text-slate-400 leading-tight">Si seleccionás "Por Realizar", el empleado tendrá un alerta para cargar el certificado cuando finalice el curso.</span>
              </div>
            )}

            <div className="grid gap-2 mt-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Certificado (PDF)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="flex w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-600 file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold file:mr-4 file:px-4 file:py-1 file:rounded-full hover:file:bg-slate-200 transition-all"
                onChange={(e) => setForm(f => ({ ...f, certificado: e.target.files?.[0] || null }))}
              />
            </div>

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
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
