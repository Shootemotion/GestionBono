import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBonoBot } from "@/hooks/useBonoBot";
import { useAuth } from "@/context/AuthContext";

export default function BonoBot() {
    const { user } = useAuth();
    const { isOpen, toggleChat, messages, sendMessage, isTyping } = useBonoBot();
    const [inputValue, setInputValue] = useState("");
    const endRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping, isOpen]);

    // Only show if user is logged in
    if (!user) return null;

    const handleSend = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            sendMessage(inputValue);
            setInputValue("");
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 font-sans antialiased">

            {/* CHAT WINDOW */}
            {isOpen && (
                <div className="w-[350px] md:w-[400px] h-[500px] bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-300 ring-1 ring-slate-900/5">

                    {/* HEADER */}
                    <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2.5 text-white">
                            <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm leading-tight">BonoBot AI</h3>
                                <div className="flex items-center gap-1.5 opacity-80">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
                                    <span className="text-[10px] font-medium tracking-wide">En línea</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={toggleChat}
                            className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* MESSAGES AREA */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border ${msg.role === "user"
                                        ? "bg-slate-200 border-slate-300 text-slate-600"
                                        : "bg-indigo-100 border-indigo-200 text-indigo-600"
                                    }`}>
                                    {msg.role === "user" ? <span className="text-xs font-bold">YO</span> : <Sparkles className="w-4 h-4" />}
                                </div>

                                {/* Bubble */}
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${msg.role === "user"
                                            ? "bg-indigo-600 text-white rounded-br-none"
                                            : "bg-white text-slate-700 border border-slate-100 rounded-bl-none"
                                        }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    {/* INPUT AREA */}
                    <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 shrink-0">
                        {/* QUICK QUESTIONS (Optional Scroll) */}
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar md:no-scrollbar mask-linear-fade">
                            {["¿Cómo se calcula?", "¿Cuándo cierra?", "Mis objetivos"].map((q, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => sendMessage(q)}
                                    className="whitespace-nowrap px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full border border-slate-200 transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>

                        <div className="relative flex items-center gap-2">
                            <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                                placeholder="Escribí tu consulta..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim() || isTyping}
                                className="absolute right-1 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-all disabled:opacity-50 disabled:hover:bg-indigo-600"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* FLOATING TRIGGER BUTTON */}
            {!isOpen && (
                <button
                    onClick={toggleChat}
                    className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-full shadow-lg hover:shadow-indigo-500/40 hover:-translate-y-1 transition-all duration-300"
                >
                    <div className="absolute inset-0 bg-white rounded-full opacity-0 group-hover:animate-ping duration-1000"></div>
                    <Sparkles className="w-6 h-6 relative z-10" />

                    {/* Unread Badge (Optional) */}
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-rose-500 border-2 border-white rounded-full"></span>
                </button>
            )}
        </div>
    );
}
