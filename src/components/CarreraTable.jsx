import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Building, Briefcase, Calendar } from "lucide-react";

export default function CarreraTable({ empleadoId, canEdit, areas = [], sectores = [], initialData = null, autoOpen = false, onAutoOpenComplete }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ puesto: "", area: "", sector: "", desde: "", hasta: "", motivo: "" });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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
      };
      const created = await api(`/empleados/${empleadoId}/carrera`, { method: "POST", body: payload });
      setItems((prev) => [created, ...prev]);
      setForm({ puesto: "", area: "", sector: "", desde: "", hasta: "", motivo: "" });
      setOpen(false);
      toast.success("Registro agregado.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo agregar.");
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
      toast.error("No se pudo eliminar.");
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
                {canEdit && <th className="px-4 py-3 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={5}>Cargando historial...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={5}>Sin registros de carrera.</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 flex items-center gap-2">
                        <Briefcase size={14} className="text-slate-400" />
                        {it.puesto}
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
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onDelete(it._id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Eliminar registro"
                        >
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
