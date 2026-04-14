import React, { useState } from "react";
import { X, Send, MessageSquarePlus, Bug, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function AppFeedbackModal({ isOpen, onClose }) {
    const [tipo, setTipo] = useState("Sugerencia");
    const [mensaje, setMensaje] = useState("");
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!mensaje.trim()) {
            return toast.error("El mensaje no puede estar vacío.");
        }

        setLoading(true);
        try {
            await api("/app-feedback", {
                method: "POST",
                body: { tipo, mensaje },
            });
            toast.success("¡Gracias por tu comentario! Lo revisaremos pronto.");
            setMensaje("");
            setTipo("Sugerencia");
            onClose();
        } catch (error) {
            console.error("Error al enviar feedback:", error);
            toast.error(error?.data?.message || "Ocurrió un error al enviar tu feedback.");
        } finally {
            setLoading(false);
        }
    };

    const options = [
        { label: "Sugerencia de Diseño / Mejora", value: "Sugerencia", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-100" },
        { label: "Error en el Sistema (Bug)", value: "Error", icon: Bug, color: "text-red-500", bg: "bg-red-100" },
        { label: "Otro comentario", value: "Otro", icon: MessageSquarePlus, color: "text-blue-500", bg: "bg-blue-100" },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div
                className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <MessageSquarePlus className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Experiencia de Usuario</h2>
                            <p className="text-xs text-slate-500">Ayudanos a mejorar la plataforma</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Tipo */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">¿De qué se trata?</label>
                            <div className="grid grid-cols-1 gap-2">
                                {options.map(opt => {
                                    const isSelected = tipo === opt.value;
                                    const Icon = opt.icon;
                                    return (
                                        <label
                                            key={opt.value}
                                            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                                        >
                                            <input
                                                type="radio"
                                                name="tipo"
                                                value={opt.value}
                                                checked={isSelected}
                                                onChange={(e) => setTipo(e.target.value)}
                                                className="hidden"
                                            />
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${opt.bg} ${opt.color}`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-600'}`}>
                                                {opt.label}
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Mensaje */}
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-semibold text-slate-700">Comentario</label>
                            <textarea
                                value={mensaje}
                                onChange={(e) => setMensaje(e.target.value)}
                                placeholder={`Escribí tu ${tipo.toLowerCase()} acá...`}
                                className="w-full min-h-[120px] p-3 text-sm border-2 border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none"
                                required
                            />
                        </div>

                        {/* Footer / Actions */}
                        <div className="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !mensaje.trim()}
                                className="flex-1 px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Enviar Feedback
                                    </>
                                )}
                            </button>
                        </div>

                    </form>
                </div >
            </div >
        </div >
    );
}
