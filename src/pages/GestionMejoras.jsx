import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
    MessageSquarePlus,
    Search,
    Lightbulb,
    Bug,
    LayoutDashboard,
    CheckCircle,
    Clock,
    Reply,
    X,
    Send,
    Trash2,
    Ban,
    ArrowLeft
} from "lucide-react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

const TIPO_ICONS = {
    Sugerencia: <Lightbulb className="w-4 h-4 text-amber-500" />,
    Error: <Bug className="w-4 h-4 text-red-500" />,
    Otro: <MessageSquarePlus className="w-4 h-4 text-blue-500" />
};

const ESTADOS = {
    Pendiente: "bg-amber-100 text-amber-700 border-amber-200",
    Leído: "bg-blue-100 text-blue-700 border-blue-200",
    Contestado: "bg-purple-100 text-purple-700 border-purple-200",
    Resuelto: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Desestimado: "bg-slate-100 text-slate-700 border-slate-200"
};

export default function GestionMejoras() {
    const nav = useNavigate();
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterEstado, setFilterEstado] = useState("Todos");

    // Modal State
    const [selectedItem, setSelectedItem] = useState(null);
    const [replyText, setReplyText] = useState("");
    const [replyStatus, setReplyStatus] = useState("Contestado");
    const [isReplying, setIsReplying] = useState(false);

    useEffect(() => {
        fetchFeedbacks();
    }, []);

    const fetchFeedbacks = async () => {
        try {
            setLoading(true);
            const data = await api("/app-feedback");
            setFeedbacks(data || []);
        } catch (error) {
            toast.error("Error al cargar los comentarios");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await api(`/app-feedback/${id}/status`, {
                method: "PATCH",
                body: { estado: newStatus }
            });
            setFeedbacks(prev => prev.map(f => f._id === id ? { ...f, estado: newStatus } : f));
            toast.success(`Estado actualizado a ${newStatus}`);
        } catch (error) {
            toast.error("Error al actualizar estado");
        }
    };

    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return toast.error("La respuesta no puede estar vacía.");

        setIsReplying(true);
        try {
            const updated = await api(`/ app - feedback / ${selectedItem._id} / reply`, {
                method: "PATCH",
                body: { respuesta: replyText, estadoNuevo: replyStatus }
            });

            setFeedbacks(prev => prev.map(f => f._id === updated._id ? { ...f, estado: updated.estado, respuesta: updated.respuesta } : f));
            toast.success("Respuesta enviada correctamente al usuario.");

            setSelectedItem(null);
            setReplyText("");
        } catch (error) {
            toast.error("Error al enviar la respuesta.");
        } finally {
            setIsReplying(false);
        }
    };

    const startReply = (f) => {
        setSelectedItem(f);
        setReplyText(f.respuesta || "");
        setReplyStatus(f.estado === "Pendiente" ? "Contestado" : f.estado);
    };

    // derived state
    const filteredFeedbacks = feedbacks.filter(f => {
        const searchMatch =
            f.mensaje.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.empleado?.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.empleado?.apellido || "").toLowerCase().includes(searchTerm.toLowerCase());

        const statusMatch = filterEstado === "Todos" || f.estado === filterEstado;
        return searchMatch && statusMatch;
    });

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

                {/* HEADER */}
                <div className="mb-8">
                    <div className="flex justify-start mb-6">
                        <Button variant="ghost" onClick={() => nav('/sistemas')} className="text-slate-500 hover:text-slate-800 -ml-4">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Volver a Sistemas
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-600 mb-2">
                        <MessageSquarePlus className="w-5 h-5" />
                        <span className="text-sm font-semibold tracking-wider uppercase">Panel de Administración</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Gestión de Mejoras y Feedback</h1>
                        <p className="text-sm text-slate-500 mt-1">Revisá, categorizá y respondé a las sugerencias o reportes de errores enviados por los colaboradores.</p>
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por comentario o nombre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-sm font-medium text-slate-600">Estado:</span>
                        <select
                            className="border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full sm:w-auto"
                            value={filterEstado}
                            onChange={(e) => setFilterEstado(e.target.value)}
                        >
                            <option value="Todos">Todos los estados</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Leído">Leído</option>
                            <option value="Contestado">Contestado</option>
                            <option value="Resuelto">Resuelto</option>
                            <option value="Desestimado">Desestimado</option>
                        </select>
                    </div>
                </div>

                {/* LIST */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Cargando comentarios...</div>
                    ) : filteredFeedbacks.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center text-slate-500 text-center">
                            <MessageSquarePlus className="w-12 h-12 text-slate-300 mb-4" />
                            <h3 className="text-lg font-semibold text-slate-700">No se encontraron resultados</h3>
                            <p className="max-w-md mt-2">No hay comentarios de experiencia de usuario que coincidan con tu búsqueda actual.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredFeedbacks.map(f => (
                                <div key={f._id} className="p-5 hover:bg-slate-50 transition-colors flex flex-col md:flex-row gap-4 items-start">

                                    {/* Left: User & Meta */}
                                    <div className="flex-shrink-0 w-full md:w-56 flex flex-row md:flex-col items-center md:items-start gap-3">
                                        <div className="flex items-center gap-3 w-full md:w-auto">
                                            {f.empleado?.fotoUrl ? (
                                                <img src={f.empleado.fotoUrl} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                                                    {f.empleado?.nombre?.charAt(0)}{f.empleado?.apellido?.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 line-clamp-1">{f.empleado?.nombre} {f.empleado?.apellido}</p>
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {format(new Date(f.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Center: Content */}
                                    <div className="flex-1 w-full flex flex-col gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                                {TIPO_ICONS[f.tipo]}
                                                {f.tipo}
                                            </span>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ESTADOS[f.estado] || ESTADOS.Pendiente}`}>
                                                {f.estado}
                                            </span>
                                        </div>

                                        <p className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50/50 p-3 rounded-lg border border-slate-100 italic">
                                            "{f.mensaje}"
                                        </p>

                                        {f.respuesta && (
                                            <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg p-3 relative">
                                                <div className="absolute -top-2 left-4 px-2 bg-indigo-50 text-[10px] font-bold text-indigo-600 tracking-wider">RESPUESTA ENVIADA</div>
                                                <p className="text-sm text-indigo-900 mt-1">{f.respuesta}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex-shrink-0 flex flex-row md:flex-col gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-transparent border-slate-100">
                                        <Button
                                            onClick={() => startReply(f)}
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                        >
                                            <Reply className="w-4 h-4 mr-2" />
                                            {f.respuesta ? "Act. Respuesta" : "Responder"}
                                        </Button>

                                        {f.estado !== "Resuelto" && (
                                            <Button
                                                onClick={() => handleUpdateStatus(f._id, "Resuelto")}
                                                variant="ghost"
                                                size="sm"
                                                className="flex-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Marcar Resuelto
                                            </Button>
                                        )}

                                        {f.estado !== "Desestimado" && (
                                            <Button
                                                onClick={() => handleUpdateStatus(f._id, "Desestimado")}
                                                variant="ghost"
                                                size="sm"
                                                className="flex-1 text-slate-500 hover:text-slate-600 hover:bg-slate-100"
                                            >
                                                <Ban className="w-4 h-4 mr-2" />
                                                Desestimar
                                            </Button>
                                        )}
                                    </div>

                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* MODAL RESPUESTA */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                    <Reply className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">Responder al Usuario</h2>
                                    <p className="text-xs text-slate-500">
                                        Para: <span className="font-semibold text-slate-700">{selectedItem.empleado?.nombre} {selectedItem.empleado?.apellido}</span>
                                        {selectedItem.empleado?.email && ` (${selectedItem.empleado.email})`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSendReply} className="p-6 space-y-5">

                            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl relative">
                                <span className="absolute -top-2.5 left-3 px-2 bg-slate-50 text-xs font-bold text-slate-500">Mensaje Original</span>
                                <p className="text-sm text-slate-700 italic">"{selectedItem.mensaje}"</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 flex justify-between">
                                    Tu Respuesta
                                    <span className="text-xs font-normal text-slate-400">(Se enviará por correo si el usuario tiene un email registrado)</span>
                                </label>
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Escribí detalladamente tu respuesta..."
                                    className="w-full min-h-[120px] p-3 text-sm border-2 border-slate-200 rounded-xl bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Cambiar estado a:</label>
                                <select
                                    className="w-full border-2 border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:border-indigo-500 transition-all bg-white"
                                    value={replyStatus}
                                    onChange={(e) => setReplyStatus(e.target.value)}
                                >
                                    <option value="Contestado">Contestado (Esperando respuesta o cierre posterior)</option>
                                    <option value="Resuelto">Resuelto (El problema o ticket ya está finiquitado)</option>
                                    <option value="Desestimado">Desestimado (No aplicable / Rechazado)</option>
                                </select>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <Button type="button" variant="outline" onClick={() => setSelectedItem(null)} className="flex-1" disabled={isReplying}>
                                    Cancelar
                                </Button>
                                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={isReplying || !replyText.trim()}>
                                    {isReplying ? "Enviando..." : <><Send className="w-4 h-4 mr-2" /> Enviar y Actualizar</>}
                                </Button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
