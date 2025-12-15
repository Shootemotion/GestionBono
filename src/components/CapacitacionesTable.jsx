import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Calendar, FileText, Clock, AlertTriangle, ExternalLink } from "lucide-react";

export default function CapacitacionesTable({ empleadoId, canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: "", proveedor: "", horas: "", fecha: "",
    vence: false, fechaVto: "", estado: "COMPLETO", certificado: null
  });

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
      fd.append("estado", form.estado || "COMPLETO");
      if (form.certificado) fd.append("certificado", form.certificado);

      const created = await api(`/empleados/${empleadoId}/capacitaciones`, { method: "POST", body: fd });
      setItems((prev) => [created, ...prev]);
      setForm({ nombre: "", proveedor: "", horas: "", fecha: "", vence: false, fechaVto: "", estado: "COMPLETO", certificado: null });
      setOpen(false);
      toast.success("Capacitación registrada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo registrar.");
    }
  };

  const onDelete = async (itemId) => {
    if (!window.confirm("¿Eliminar esta capacitación?")) return;
    try {
      await api(`/empleados/${empleadoId}/capacitaciones/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter(x => x._id !== itemId));
      toast.success("Capacitación eliminada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo eliminar.");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {/* <h3 className="text-sm font-semibold">Capacitaciones</h3> */}
        <div className="flex-1"></div>
        {canEdit && (
          <button
            onClick={() => setOpen(true)}
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
                <th className="text-left px-4 py-3">Horas</th>
                <th className="text-left px-4 py-3">Vencimiento</th>
                <th className="text-left px-4 py-3">Certificado</th>
                {canEdit && <th className="px-4 py-3 w-10"></th>}
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
                    </td>
                    <td className="px-4 py-3 text-slate-600">{it.proveedor || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Clock size={12} className="text-slate-400" />
                        {it.horas ?? 0} hs
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
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => onDelete(it._id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={14} />
                        </button>
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
            <DialogTitle>Nueva Capacitación</DialogTitle>
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

            <div className="grid gap-2">
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
