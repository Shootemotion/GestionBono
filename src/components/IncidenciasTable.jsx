
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Calendar, MessageSquare, AlertTriangle } from "lucide-react";

export default function IncidenciasTable({ empleadoId, canEdit }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ tipo: "COMENTARIO", fecha: "", descripcion: "", justificada: false });

    const load = async () => {
        try {
            setLoading(true);
            const data = await api(`/empleados/${empleadoId}/incidencias`);
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            toast.error("No se pudieron cargar las incidencias.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [empleadoId]);

    const onAdd = async () => {
        try {
            if (!form.fecha || !form.descripcion) return toast.error("Fecha y descripción son obligatorias.");

            const fd = new FormData();
            fd.append("tipo", form.tipo);
            fd.append("fecha", form.fecha);
            fd.append("descripcion", form.descripcion);
            if (form.tipo === "LICENCIA" && form.fechaHasta) {
                fd.append("fechaHasta", form.fechaHasta);
            }
            if (form.tipo === "INASISTENCIA") {
                fd.append("justificada", form.justificada);
            }
            if (form.archivo) {
                fd.append("archivo", form.archivo);
            }

            const created = await api(`/empleados/${empleadoId}/incidencias`, { method: "POST", body: fd });
            setItems((prev) => [created, ...prev]);
            setForm({ tipo: "COMENTARIO", fecha: "", fechaHasta: "", descripcion: "", archivo: null, justificada: false });
            setOpen(false);
            toast.success("Incidencia registrada.");
        } catch (e) {
            console.error(e);
            toast.error(e.message || "No se pudo registrar.");
        }
    };

    const onDelete = async (itemId) => {
        if (!confirm("¿Eliminar este registro?")) return;
        try {
            await api(`/empleados/${empleadoId}/incidencias/${itemId}`, { method: "DELETE" });
            setItems((prev) => prev.filter((x) => x._id !== itemId));
            toast.success("Eliminado.");
        } catch (e) {
            console.error(e);
            toast.error("No se pudo eliminar.");
        }
    };

    const TipoBadge = ({ item }) => {
        const map = {
            INASISTENCIA: "bg-rose-100 text-rose-700 border-rose-200",
            SANCION: "bg-red-100 text-red-800 border-red-200 font-bold",
            APERCIBIMIENTO: "bg-amber-100 text-amber-700 border-amber-200",
            LICENCIA: "bg-purple-100 text-purple-700 border-purple-200",
            COMENTARIO: "bg-blue-50 text-blue-600 border-blue-100",
        };

        return (
            <div className="flex flex-col items-start gap-1">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${map[item.tipo] || "bg-gray-100"}`}>
                    {item.tipo}
                </span>
                {item.tipo === "INASISTENCIA" && (
                    <span className={`text-[9px] font-bold px-1.5 py-px rounded border ${item.justificada ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {item.justificada ? "JUSTIFICADA" : "INJUSTIFICADA"}
                    </span>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Historial de Incidencias</h3>
                {canEdit && (
                    <button
                        onClick={() => setOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm"
                    >
                        <Plus size={14} />
                        Nueva Incidencia
                    </button>
                )}
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 w-32">Fecha Inicio</th>
                            <th className="px-4 py-3 w-32">Fecha Fin</th>
                            <th className="px-4 py-3 w-24">Duración</th>
                            <th className="px-4 py-3 w-32">Año Fiscal</th>
                            <th className="px-4 py-3 w-32">Tipo</th>
                            <th className="px-4 py-3">Descripción</th>
                            {canEdit && <th className="px-4 py-3 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">Cargando...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">No hay incidencias registradas.</td></tr>
                        ) : (
                            items.map((it) => {
                                // Calculate days
                                let dias = "-";
                                let d = new Date(it.fecha);
                                let y = d.getFullYear();
                                let m = d.getMonth(); // 0 = Jan, 8 = Sept
                                // Fiscal Year: Sept (8) to Aug (next year)
                                // If >= Sept, start year is current. Else start year is prev.
                                let startYear = m >= 8 ? y : y - 1;
                                let periodo = `${startYear}-${startYear + 1}`;
                                if (it.fecha && it.fechaHasta) {
                                    const start = new Date(it.fecha);
                                    const end = new Date(it.fechaHasta);
                                    const diffTime = Math.abs(end.getTime() - start.getTime());
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                    dias = `${diffDays} días`;
                                }

                                return (
                                    <tr key={it._id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-4 py-3 font-medium text-slate-700">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={13} className="text-slate-400" />
                                                {new Date(it.fecha).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {it.fechaHasta ? new Date(it.fechaHasta).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {dias}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full font-bold text-slate-500">
                                                AF {periodo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <TipoBadge item={it} />
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{it.descripcion}</span>
                                                {it.archivoUrl && (
                                                    <a
                                                        href={(() => {
                                                            const url = it.archivoUrl || "";
                                                            if (/^https?:\/\//i.test(url)) return url;
                                                            const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
                                                            return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
                                                        })()}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-blue-500 hover:text-blue-700 p-1"
                                                        title="Ver adjunto"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        {canEdit && (
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => onDelete(it._id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div >

            {/* Modal */}
            < Dialog open={open} onOpenChange={setOpen} >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Registrar Incidencia</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase text-slate-500">Tipo</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                value={form.tipo}
                                onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
                            >
                                <option value="COMENTARIO">COMENTARIO</option>
                                <option value="INASISTENCIA">INASISTENCIA</option>
                                <option value="APERCIBIMIENTO">APERCIBIMIENTO</option>
                                <option value="SANCION">SANCION</option>
                                <option value="LICENCIA">LICENCIA</option>
                            </select>
                        </div>

                        {/* Checkbox Justificada for INASISTENCIA */}
                        {form.tipo === "INASISTENCIA" && (
                            <div className="flex items-center gap-2 border border-slate-200 p-2 rounded-md bg-slate-50">
                                <input
                                    type="checkbox"
                                    id="chkJustificada"
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    checked={form.justificada}
                                    onChange={(e) => setForm(f => ({ ...f, justificada: e.target.checked }))}
                                />
                                <label htmlFor="chkJustificada" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                                    ¿Está justificada?
                                </label>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-2">
                                <label className="text-xs font-semibold uppercase text-slate-500">Fecha {form.tipo === "LICENCIA" ? "Inicio" : ""}</label>
                                <input
                                    type="date"
                                    className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    value={form.fecha}
                                    onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))}
                                />
                            </div>
                            {form.tipo === "LICENCIA" && (
                                <div className="grid gap-2">
                                    <label className="text-xs font-semibold uppercase text-slate-500">Fecha Fin</label>
                                    <input
                                        type="date"
                                        className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        value={form.fechaHasta || ""}
                                        onChange={(e) => setForm(f => ({ ...f, fechaHasta: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase text-slate-500">Descripción / Motivo</label>
                            <textarea
                                className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                                placeholder="Detalla lo sucedido..."
                                value={form.descripcion}
                                onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase text-slate-500">Documento (Opcional)</label>
                            <input
                                type="file"
                                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                onChange={(e) => setForm(f => ({ ...f, archivo: e.target.files?.[0] || null }))}
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
                            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
                        >
                            Guardar
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >
        </>
    );
}
