import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Save, User, Layers, Search, X, Trash2, Power, Megaphone, Calendar, Globe, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';

export default function GestionAvisos() {
    const [loading, setLoading] = useState(false);
    const [avisos, setAvisos] = useState([]);

    // New Aviso Form State
    const [formData, setFormData] = useState({
        titulo: "",
        mensaje: "",
        alcance: "GLOBAL", // GLOBAL, AREA, SECTOR
        targetId: "",
        targetName: "",
        fechaInicio: format(new Date(), "yyyy-MM-dd"),
        fechaFin: format(new Date(new Date().setMonth(new Date().getMonth() + 1)), "yyyy-MM-dd")
    });

    // Catalogs for Search
    const [catalogs, setCatalogs] = useState({ areas: [], sectores: [] }); // Assuming sectors endpoint exists? Or filtering areas?
    // Usually sectors are children of areas or flat list. Assuming common endpoint or structure.
    // If no dedicated sector endpoint, maybe use areas only for now as user asked for "Area or Dependencia". 
    // Usually Dependencia = Sector. Let's assume we have /sectores or similar logic. I will check.

    // Search State
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchRef = useRef(null);

    useEffect(() => {
        fetchHistory();
        loadCatalogs();

        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await api("/avisos/history");
            setAvisos(data);
        } catch (e) {
            console.error(e);
            toast.error("Error cargando historial");
        } finally {
            setLoading(false);
        }
    };

    const loadCatalogs = async () => {
        try {
            // Load areas and sectors (if available, otherwise mock or adapt)
            const areas = await api("/areas");
            // If we have sectors, fine. If not, maybe fetch all and flatten? 
            // Attempting to fetch sectors if endpoint exists, else just areas.
            let sectores = [];
            try {
                sectores = await api("/sectores");
            } catch (e) { /* ignore if not exists */ }

            setCatalogs({
                areas: Array.isArray(areas) ? areas : areas.data || [],
                sectores: Array.isArray(sectores) ? sectores : sectores.data || []
            });
        } catch (e) {
            console.error("Catalogs error", e);
        }
    };

    const handleCreate = async () => {
        if (!formData.titulo || !formData.mensaje) return toast.error("Título y mensaje requeridos");

        if (formData.alcance !== "GLOBAL" && !formData.targetId) {
            return toast.error("Seleccioná un destinatario (Área o Sector)");
        }

        try {
            await api("/avisos", { method: "POST", body: formData });
            toast.success("Aviso creado correctamente");
            // Reset
            setFormData({ ...formData, titulo: "", mensaje: "", targetId: "", targetName: "", searchTerm: "" });
            fetchHistory();
        } catch (e) {
            console.error(e);
            toast.error("Error al crear aviso");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Eliminar este aviso?")) return;
        try {
            await api(`/avisos/${id}`, { method: "DELETE" });
            toast.success("Eliminado");
            setAvisos(prev => prev.filter(a => a._id !== id));
        } catch (e) {
            toast.error("Error al eliminar");
        }
    };

    const handleToggle = async (id) => {
        try {
            const updated = await api(`/avisos/${id}/toggle`, { method: "PATCH" });
            setAvisos(prev => prev.map(a => a._id === id ? updated : a));
        } catch (e) {
            toast.error("Error al cambiar estado");
        }
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-600">
            <div className="max-w-5xl mx-auto space-y-8">

                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Avisos</h1>
                        <p className="text-slate-500 mt-1">Configuración de alertas globales y específicas.</p>
                    </div>
                </div>

                {/* CREATOR PANEL */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-indigo-50/50 px-8 py-4 border-b border-indigo-100 flex items-center gap-3">
                        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
                            <Megaphone size={20} />
                        </div>
                        <h2 className="font-bold text-lg text-slate-800">Nuevo Aviso</h2>
                    </div>

                    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Título</label>
                                <Input
                                    className="font-bold text-slate-700 bg-slate-50 border-slate-200"
                                    placeholder="Ej: Mantenimiento Programado"
                                    value={formData.titulo}
                                    onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Mensaje</label>
                                <textarea
                                    className="w-full rounded-xl border-slate-200 bg-slate-50 text-sm p-3 h-32 resize-none outline-none focus:ring-2 focus:ring-indigo-500/20 border"
                                    placeholder="Escribí el contenido del aviso..."
                                    value={formData.mensaje}
                                    onChange={e => setFormData({ ...formData, mensaje: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Desde</label>
                                    <Input type="date" value={formData.fechaInicio} onChange={e => setFormData({ ...formData, fechaInicio: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Hasta</label>
                                    <Input type="date" value={formData.fechaFin} onChange={e => setFormData({ ...formData, fechaFin: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 border-l border-slate-100 pl-8">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Alcance (Destinatarios)</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                                    {["GLOBAL", "AREA", "SECTOR"].map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => setFormData({ ...formData, alcance: opt, targetId: "", targetName: "" })}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${formData.alcance === opt ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>

                                {formData.alcance !== "GLOBAL" && (
                                    <div className="relative" ref={searchRef}>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                            <Input
                                                className="pl-9 bg-white"
                                                placeholder={`Buscar ${formData.alcance === "AREA" ? "Area" : "Sector"}...`}
                                                value={searchTerm}
                                                onChange={e => {
                                                    setSearchTerm(e.target.value);
                                                    setIsSearchOpen(true);
                                                    setFormData({ ...formData, targetId: "" });
                                                }}
                                                onFocus={() => setIsSearchOpen(true)}
                                            />
                                        </div>
                                        {isSearchOpen && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-100 shadow-xl rounded-xl max-h-48 overflow-y-auto">
                                                {(formData.alcance === "AREA" ? catalogs.areas : catalogs.sectores)
                                                    .filter(i => i.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
                                                    .map(item => (
                                                        <button
                                                            key={item._id}
                                                            onClick={() => {
                                                                setFormData({ ...formData, targetId: item._id, targetName: item.nombre });
                                                                setSearchTerm(item.nombre);
                                                                setIsSearchOpen(false);
                                                            }}
                                                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-slate-600"
                                                        >
                                                            {item.nombre}
                                                        </button>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100/50">
                                <h4 className="font-bold text-indigo-900 text-sm mb-2">Resumen</h4>
                                <div className="text-xs text-indigo-700 space-y-1">
                                    <p><strong>Destino:</strong> {formData.alcance === "GLOBAL" ? "Toda la Nómina" : (formData.targetName || "Sin seleccionar")}</p>
                                    <p><strong>Duración:</strong> {formData.fechaInicio} al {formData.fechaFin}</p>
                                </div>
                            </div>

                            <Button onClick={handleCreate} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-indigo-500/20">
                                Publicar Aviso
                            </Button>
                        </div>
                    </div>
                </div>

                {/* HISTORY LIST */}
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800 px-2 border-l-4 border-indigo-500 pl-4">Historial de Avisos</h3>

                    {avisos.length === 0 && <div className="text-center py-12 text-slate-400 italic">No hay avisos registrados.</div>}

                    {avisos.map(aviso => (
                        <div key={aviso._id} className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-start gap-4 ${!aviso.activo ? 'opacity-60 grayscale' : ''}`}>
                            <div className={`p-3 rounded-xl shrink-0 ${aviso.alcance === 'GLOBAL' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {aviso.alcance === 'GLOBAL' ? <Globe size={24} /> : <Building2 size={24} />}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">{aviso.titulo}</h4>
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                            <span>{aviso.alcance}</span>
                                            {aviso.targetName && <span>• {aviso.targetName}</span>}
                                            <span>• {new Date(aviso.fechaInicio).toLocaleDateString()} - {new Date(aviso.fechaFin).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggle(aviso._id)}
                                            title={aviso.activo ? "Desactivar" : "Activar"}
                                            className={`p-2 rounded-lg transition-colors ${aviso.activo ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                                        >
                                            <Power size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(aviso._id)}
                                            className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-3 text-slate-600 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100">
                                    {aviso.mensaje}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
