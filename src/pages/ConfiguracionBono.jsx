import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Save, Calculator, AlertCircle, Info, Plus, Trash2, Edit2, GitMerge, ChevronsRight, Wallet, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
// import { Label } from "@/components/ui/label"; // Removed missing component
import { Input } from "@/components/ui/input";
// Removed invalid Select imports because project uses simple select or native HTML tags

export default function ConfiguracionBono() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [config, setConfig] = useState({
        // pesos: { objetivos: 70, competencias: 30 }, // Removed
        escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
        bonoTarget: 1.0,
        overrides: []
    });

    // Override Modal State
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [currentOverride, setCurrentOverride] = useState(null); // { type, targetId, ... }
    const [catalogs, setCatalogs] = useState({ areas: [], empleados: [] });
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadCatalogs();
    }, []);

    const loadCatalogs = async () => {
        try {
            const [a, e] = await Promise.all([api("/areas"), api("/empleados?limit=1000")]);

            // Normalize responses
            const areas = Array.isArray(a) ? a : (a.data || []);
            const emps = Array.isArray(e) ? e : (e.items || e.data || []);

            setCatalogs({
                areas: areas.map(x => ({ id: x._id, name: x.nombre })),
                // Simple mapping for selector
                empleados: emps.map(x => ({ id: x._id || x.id, name: `${x.apellido}, ${x.nombre}` }))
            });
        } catch (err) {
            console.error("Error loading catalogs", err);
        }
    };

    useEffect(() => {
        loadConfig();
    }, [year]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await api(`/bono/config/${year}`);
            console.log("DEBUG: Fetched Config", data);
            if (data && !data.isNew) {
                setConfig({
                    // pesos: { objetivos: 70, competencias: 30 }, // Removed
                    escala: data.escala || { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
                    bonoTarget: data.bonoTarget ?? 1.0,
                    overrides: data.overrides || [],
                });
            } else {
                // Defaults
                setConfig({
                    // pesos: { objetivos: 70, competencias: 30 }, // Removed
                    escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
                    bonoTarget: 1.0,
                    overrides: []
                });
            }
        } catch (err) {
            console.error(err);
            toast.error("Error cargando configuración");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await api(`/bono/config/${year}`, {
                method: "POST",
                body: config,
            });
            toast.success("Configuración guardada");
        } catch (err) {
            console.error(err);
            toast.error("Error al guardar");
        }
    };

    const handleCalculate = async (deferredConfig = null) => {
        if (!confirm(`¿Estás seguro de recalcular los bonos para el año ${year}? Esto actualizará los borradores existentes.`)) return;

        setCalculating(true);
        try {
            // 1. Auto-save config first to ensure backend has it. 
            // If deferredConfig is passed (from handleSaveOverride), use it. Otherwise use current state.
            const configToSave = deferredConfig || config;

            await api(`/bono/config/${year}`, {
                method: "POST",
                body: configToSave,
            });

            // 2. Trigger calculation
            const res = await api(`/bono/calculate/${year}`, { method: "POST" });
            toast.success(res.message || "Cálculo finalizado");
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Error al calcular");
        } finally {
            setCalculating(false);
        }
    };

    // --- Override Handlers ---
    const handleAddOverride = () => {
        setCurrentOverride({
            isNew: true,
            type: "area",
            targetId: "",
            bonoTarget: config.bonoTarget, // Default to global
            escala: { ...config.escala }   // Default to global
        });
        setIsOverrideModalOpen(true);
    };

    const handleEditOverride = (index) => {
        const ov = config.overrides[index];
        setCurrentOverride({ ...ov, isNew: false, index });
        setIsOverrideModalOpen(true);
    };

    const handleRemoveOverride = (index) => {
        if (!confirm("¿Eliminar esta excepción?")) return;
        const newOverrides = [...config.overrides];
        newOverrides.splice(index, 1);
        setConfig({ ...config, overrides: newOverrides });
    };

    const handleSaveOverride = () => {
        if (!currentOverride.targetId) return toast.error("Debes seleccionar un Área o Empleado");

        // Helper name
        let targetName = "";
        if (currentOverride.type === "area") {
            const a = catalogs.areas.find(x => x.id === currentOverride.targetId);
            targetName = a ? a.name : "Desconocido";
        } else {
            const e = catalogs.empleados.find(x => x.id === currentOverride.targetId);
            targetName = e ? e.name : "Desconocido";
        }

        const newOv = {
            type: currentOverride.type,
            targetId: currentOverride.targetId,
            targetName,
            bonoTarget: Number(currentOverride.bonoTarget),
            escala: {
                ...currentOverride.escala,
                minPct: Number(currentOverride.escala.minPct),
                maxPct: Number(currentOverride.escala.maxPct),
                umbral: Number(currentOverride.escala.umbral),
            }
        };

        const newOverrides = [...(config.overrides || [])];
        if (currentOverride.isNew) {
            newOverrides.push(newOv);
        } else {
            newOverrides[currentOverride.index] = newOv;
        }

        const updatedConfig = { ...config, overrides: newOverrides };
        setConfig(updatedConfig);
        setIsOverrideModalOpen(false);

        // Auto-save logic
        api(`/bono/config/${year}`, {
            method: "POST",
            body: updatedConfig,
        }).then(() => {
            toast.success("Excepción guardada");

            // Prompt for recalculation
            if (confirm("¿Deseas recalcular los bonos ahora para aplicar esta excepción?")) {
                handleCalculate(updatedConfig);
            }
        }).catch(err => {
            console.error(err);
            toast.error("Error al guardar la excepción");
        });
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-600">
            <div className="max-w-5xl mx-auto space-y-10">

                {/* Header Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Reglas de Bonos</h1>
                        <p className="text-lg text-slate-500 mt-1">Configuración y Excepciones del Cálculo {year}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <Button onClick={handleCalculate} disabled={calculating} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl px-5 py-6">
                            <Calculator className="mr-2" size={20} />
                            {calculating ? "Calculando..." : "Recalcular Todo"}
                        </Button>

                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-6 shadow-lg shadow-blue-600/20">
                            <Save className="mr-2" size={20} /> Guardar Cambios
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left Column: Global Config */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* 1. Global Rule Card */}
                        <section className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden group transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Regla Global</h2>
                                    <p className="text-slate-500 font-medium">Aplica a todos los empleados por defecto.</p>
                                </div>
                                <div className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-inner">
                                    Default
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Target Input */}
                                <div className="space-y-4">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        <Wallet className="w-4 h-4" /> Target (Sueldos)
                                    </label>
                                    <div className="relative group/input">
                                        <input
                                            type="number" step="0.1"
                                            value={config.bonoTarget}
                                            onChange={(e) => setConfig({ ...config, bonoTarget: Number(e.target.value) })}
                                            className="w-full text-5xl font-black text-slate-800 bg-transparent border-b-2 border-slate-100 focus:border-blue-500 outline-none py-2 transition-colors placeholder-slate-200"
                                        />
                                        <span className="absolute right-0 bottom-4 text-slate-400 font-medium text-sm bg-slate-50 px-2 py-1 rounded-md">Sueldos Brutos</span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed max-w-[90%]">
                                        Multiplicador base. Si el sueldo es $1M y el target es 1.5, el bono base es $1.5M.
                                    </p>
                                </div>

                                {/* Escala Type Selector */}
                                <div className="space-y-4">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        <TrendingUp className="w-4 h-4" /> Modelo de Cálculo
                                    </label>
                                    <div className="flex p-1 bg-slate-100 rounded-xl">
                                        <button
                                            onClick={() => setConfig({ ...config, escala: { ...config.escala, tipo: "lineal" } })}
                                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${config.escala.tipo === "lineal" ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 shadow-none"}`}
                                        >
                                            Lineal
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, escala: { ...config.escala, tipo: "tramos" } })}
                                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${config.escala.tipo === "tramos" ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 shadow-none"}`}
                                        >
                                            Por Tramos
                                        </button>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-100">
                                        {config.escala.tipo === "lineal"
                                            ? "Proporcional: Paga % exacto según cumplimiento."
                                            : "Escalones: Paga % fijo al alcanzar hitos."}
                                    </div>
                                </div>
                            </div>

                            <hr className="my-8 border-slate-100" />

                            {/* Linear Config Details */}
                            {config.escala.tipo === "lineal" && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: "Umbral Mínimo", val: config.escala.umbral, set: (v) => setConfig({ ...config, escala: { ...config.escala, umbral: v } }), unit: "%" },
                                            { label: "Pago Mínimo", val: config.escala.minPct, set: (v) => setConfig({ ...config, escala: { ...config.escala, minPct: v } }), unit: "x" },
                                            { label: "Tope (Cap)", val: config.escala.maxPct, set: (v) => setConfig({ ...config, escala: { ...config.escala, maxPct: v } }), unit: "x" }
                                        ].map((item, i) => (
                                            <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group/item">
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">{item.label}</label>
                                                <div className="flex items-baseline gap-1">
                                                    <input
                                                        type="number" step={item.unit === 'x' ? 0.01 : 1}
                                                        value={item.val}
                                                        onChange={(e) => item.set(Number(e.target.value))}
                                                        className="bg-transparent w-full text-xl font-bold text-slate-700 outline-none placeholder-slate-300"
                                                    />
                                                    <span className="text-xs font-bold text-slate-400">{item.unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Info Card Linear */}
                                    <div className="flex gap-4 p-5 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100/50 shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-sm border border-blue-200">
                                            <TrendingUp size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-blue-900 text-sm mb-1">Modelo Proporcional</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-3">
                                                Incentiva cada punto de mejora. El pago crece linealmente.
                                            </p>
                                            <ul className="list-disc ml-4 space-y-1.5 text-xs text-blue-700 font-medium border-l-2 border-blue-200 pl-4">
                                                <li>
                                                    <span className="opacity-70">Menos del {config.escala.umbral}%:</span>
                                                    <span className="block font-bold text-slate-600">No cobra bono ($0)</span>
                                                </li>
                                                <li>
                                                    <span className="opacity-70">Al llegar al {config.escala.umbral}% (Umbral):</span>
                                                    <span className="block font-bold text-slate-600">Cobra base de {Math.round((config.escala.minPct || 0) * 100)}% del bono</span>
                                                </li>
                                                <li>
                                                    <span className="opacity-70">Al 100% de cumplimiento:</span>
                                                    <span className="block font-bold text-slate-600">Cobra el {Math.round((config.escala.maxPct || 0) * 100)}% (Tope)</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tramos Config Details */}
                            {config.escala.tipo === "tramos" && (
                                <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                            <GitMerge className="text-indigo-500" size={16} /> Configuración de Niveles
                                        </h4>
                                        <Button
                                            size="sm" variant="ghost"
                                            onClick={() => {
                                                const newTramos = [...(config.escala.tramos || []), { gte: 90, pct: 1.0 }];
                                                setConfig({ ...config, escala: { ...config.escala, tramos: newTramos.sort((a, b) => a.gte - b.gte) } });
                                            }}
                                            className="text-xs h-8 ml-auto text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> Agregar Nivel
                                        </Button>
                                    </div>

                                    {(config.escala.tramos || []).length === 0 ? (
                                        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                            <p className="text-slate-400 font-medium">No hay niveles definidos.</p>
                                            <p className="text-xs text-slate-400 mt-1">El bono será 0% si no se configuran tramos.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {config.escala.tramos.map((tramo, idx) => (
                                                <div key={idx} className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-100">{idx + 1}</div>

                                                    {/* From */}
                                                    <div className="flex-1">
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Score &ge;</label>
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                className="w-14 font-bold text-lg text-slate-700 outline-none placeholder-slate-300 border-b border-transparent focus:border-indigo-500 bg-transparent transition-colors"
                                                                value={tramo.gte}
                                                                onChange={(e) => {
                                                                    const newTramos = [...config.escala.tramos];
                                                                    newTramos[idx].gte = Number(e.target.value);
                                                                    setConfig({ ...config, escala: { ...config.escala, tramos: newTramos.sort((a, b) => a.gte - b.gte) } });
                                                                }}
                                                            />
                                                            <span className="text-sm font-bold text-slate-300">%</span>
                                                        </div>
                                                    </div>

                                                    <ChevronsRight className="text-slate-300" />

                                                    {/* To */}
                                                    <div className="flex-1">
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Bono Paga</label>
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number" step="0.05"
                                                                className="w-14 font-bold text-lg text-emerald-600 outline-none placeholder-slate-300 border-b border-transparent focus:border-emerald-500 bg-transparent transition-colors"
                                                                value={tramo.pct}
                                                                onChange={(e) => {
                                                                    const newTramos = [...config.escala.tramos];
                                                                    newTramos[idx].pct = Number(e.target.value);
                                                                    setConfig({ ...config, escala: { ...config.escala, tramos: newTramos } });
                                                                }}
                                                            />
                                                            <span className="text-xs font-bold text-slate-300">x</span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            const newTramos = config.escala.tramos.filter((_, i) => i !== idx);
                                                            setConfig({ ...config, escala: { ...config.escala, tramos: newTramos } });
                                                        }}
                                                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Info Card Tramos */}
                                    <div className="mt-6 flex gap-4 p-5 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100/50 shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm border border-indigo-200">
                                            <GitMerge size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-indigo-900 text-sm mb-1">Modelo Escalonado</h4>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                El pago es fijo por rangos. Incentiva a "saltar" al siguiente nivel para ver ganancia real. Ideal para ventas.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </section>

                        {/* 2. Overrides List */}
                        <section>
                            <div className="flex justify-between items-end mb-6 px-1">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Excepciones</h2>
                                    <p className="text-slate-500 text-sm font-medium">Reglas específicas para áreas o personas.</p>
                                </div>
                                <Button onClick={handleAddOverride} variant="outline" className="border-dashed border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-500 font-bold rounded-xl h-10">
                                    <Plus size={16} className="mr-2" /> Agregar Regla
                                </Button>
                            </div>

                            <div className="space-y-4">
                                {(!config.overrides || config.overrides.length === 0) && (
                                    <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                            <GitMerge size={24} />
                                        </div>
                                        <p className="text-slate-500 font-bold">No hay excepciones creadas</p>
                                        <p className="text-sm text-slate-400 mt-1">Todas las personas usan la Regla Global.</p>
                                    </div>
                                )}
                                {(config.overrides || []).map((ov, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-bold text-xs border-2 shadow-sm ${ov.type === 'area' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                                                <span className="text-[10px] opacity-60 uppercase">{ov.type === 'area' ? 'Area' : 'Emp'}</span>
                                                <span className="text-lg">{ov.type === 'area' ? 'A' : 'E'}</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-lg tracking-tight">{ov.targetName || "Sin Nombre"}</h4>
                                                <div className="flex items-center gap-3 text-sm text-slate-500 font-medium mt-1">
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600 border border-slate-200">
                                                        x{ov.bonoTarget}
                                                    </span>
                                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                                    <span className={`${ov.escala.tipo === 'lineal' ? 'text-blue-600' : 'text-indigo-600'} font-medium`}>
                                                        {ov.escala.tipo === 'lineal' ? `Lineal (${ov.escala.umbral}% - ${Math.round(ov.escala.maxPct * 100)}%)` : 'Escalonado'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                                            <button onClick={() => handleEditOverride(idx)} className="p-2.5 bg-slate-50 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-blue-600 transition-colors">
                                                <Edit2 size={18} />
                                            </button>
                                            <button onClick={() => handleRemoveOverride(idx)} className="p-2.5 bg-slate-50 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Simulator */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-900 text-white rounded-3xl p-8 sticky top-8 shadow-2xl shadow-slate-900/20">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                <Calculator className="text-blue-400" /> Simulador
                            </h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-2 block">Score Global</label>
                                    <input
                                        type="number" id="simScore" placeholder="85"
                                        className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white font-bold text-lg placeholder-slate-600 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-2 block">Sueldo Base</label>
                                    <input
                                        type="number" id="simSueldo" placeholder="1000000"
                                        className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white font-bold text-lg placeholder-slate-600 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-6 rounded-xl font-bold text-lg shadow-lg shadow-blue-600/30 transition-all active:scale-95"
                                    onClick={() => {
                                        const score = Number(document.getElementById('simScore').value);
                                        const sueldo = Number(document.getElementById('simSueldo').value);

                                        let pct = 0;
                                        if (config.escala.tipo === 'lineal') {
                                            const { minPct, maxPct, umbral } = config.escala;
                                            if (score >= umbral) {
                                                if (score >= 100) pct = maxPct;
                                                else {
                                                    const range = 100 - umbral;
                                                    const progress = (score - umbral) / range;
                                                    pct = minPct + progress * (maxPct - minPct);
                                                }
                                            }
                                        } else {
                                            // Tramos logic
                                            const tramos = config.escala.tramos || [];
                                            const sorted = [...tramos].sort((a, b) => b.gte - a.gte);
                                            const met = sorted.find(t => score >= t.gte);
                                            pct = met ? met.pct : 0;
                                        }

                                        const final = sueldo * config.bonoTarget * pct;
                                        document.getElementById('simDisplay').innerText = `$ ${final.toLocaleString()}`;
                                        document.getElementById('simTarget').innerText = `${(pct * 100).toFixed(1)}% del Target`;
                                    }}
                                >
                                    Calcular Bono
                                </Button>

                                <div className="pt-6 border-t border-slate-800 mt-6 text-center">
                                    <div className="text-sm text-slate-400 mb-1">Resultado Estimado</div>
                                    <div id="simDisplay" className="text-3xl font-black text-emerald-400 tracking-tight">$ 0</div>
                                    <div id="simTarget" className="text-xs text-slate-500 mt-2 font-mono">0% del Target</div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* --- Modals --- */}
                <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{currentOverride?.isNew ? 'Nueva Excepción' : 'Editar Excepción'}</DialogTitle>
                        </DialogHeader>

                        {currentOverride && (
                            <div className="grid gap-6 py-4">
                                {/* Target Select */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Excepción</label>
                                        <select
                                            className="w-full mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                                            value={currentOverride.type}
                                            onChange={(e) => setCurrentOverride({ ...currentOverride, type: e.target.value, targetId: "" })}
                                            disabled={!currentOverride.isNew}
                                        >
                                            <option value="area">Por Área</option>
                                            <option value="empleado">Por Empleado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{currentOverride.type === 'area' ? 'Seleccionar Área' : 'Seleccionar Empleado'}</label>

                                        {currentOverride.type === 'empleado' && (
                                            <div className="relative mb-2">
                                                <Input
                                                    type="text"
                                                    placeholder="Buscar empleado..."
                                                    className="h-9 text-xs mb-1"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                        )}

                                        <select
                                            className="w-full mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                                            value={currentOverride.targetId}
                                            onChange={(e) => setCurrentOverride({ ...currentOverride, targetId: e.target.value })}
                                            disabled={!currentOverride.isNew}
                                            size={currentOverride.type === 'empleado' && searchTerm ? 5 : 1}
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {currentOverride.type === 'area'
                                                ? catalogs.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)
                                                : catalogs.empleados
                                                    .filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                                    .map(e => <option key={e.id} value={e.id}>{e.name}</option>)
                                            }
                                        </select>
                                        {currentOverride.type === 'empleado' && searchTerm && (
                                            <p className="text-[10px] text-slate-400 mt-1 text-right">
                                                {catalogs.empleados.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).length} resultados
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <hr />

                                {/* Config Fields (Same as main but specific) */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-sm text-slate-900">Configuración Específica</h4>

                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Bono Target (Multiplicador)</label>
                                            <Input
                                                type="number" step="0.1"
                                                value={currentOverride.bonoTarget}
                                                onChange={(e) => setCurrentOverride({ ...currentOverride, bonoTarget: e.target.value })}
                                                className="w-32 bg-white"
                                            />
                                        </div>

                                        {/* Override Scale Type */}
                                        <div className="flex gap-2 mb-4">
                                            <button
                                                onClick={() => setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tipo: "lineal" } })}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${currentOverride.escala.tipo === "lineal" ? "bg-blue-100 border-blue-500 text-blue-700" : "bg-white border-slate-200 text-slate-500"}`}
                                            >
                                                Lineal
                                            </button>
                                            <button
                                                onClick={() => setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tipo: "tramos" } })}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${currentOverride.escala.tipo === "tramos" ? "bg-indigo-100 border-indigo-500 text-indigo-700" : "bg-white border-slate-200 text-slate-500"}`}
                                            >
                                                Tramos
                                            </button>
                                        </div>

                                        {currentOverride.escala.tipo === 'lineal' ? (
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Umbral (%)</label>
                                                    <Input
                                                        type="number"
                                                        value={currentOverride.escala.umbral}
                                                        onChange={(e) => setCurrentOverride({
                                                            ...currentOverride,
                                                            escala: { ...currentOverride.escala, umbral: e.target.value }
                                                        })}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">% Mínimo</label>
                                                    <Input
                                                        type="number" step="0.01"
                                                        value={currentOverride.escala.minPct}
                                                        onChange={(e) => setCurrentOverride({
                                                            ...currentOverride,
                                                            escala: { ...currentOverride.escala, minPct: e.target.value }
                                                        })}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">% Máximo (Cap)</label>
                                                    <Input
                                                        type="number" step="0.01"
                                                        value={currentOverride.escala.maxPct}
                                                        onChange={(e) => setCurrentOverride({
                                                            ...currentOverride,
                                                            escala: { ...currentOverride.escala, maxPct: e.target.value }
                                                        })}
                                                        className="bg-white"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            // Tramos Editor for Override
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold uppercase text-slate-500">Niveles Personalizados</span>
                                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                                                        const newTramos = [...(currentOverride.escala.tramos || []), { gte: 90, pct: 1.0 }];
                                                        setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tramos: newTramos.sort((a, b) => a.gte - b.gte) } });
                                                    }}>
                                                        <Plus size={14} className="mr-1" /> Agregar
                                                    </Button>
                                                </div>
                                                {(!currentOverride.escala.tramos || currentOverride.escala.tramos.length === 0) && (
                                                    <div className="text-center text-xs text-slate-400 py-4 border border-dashed rounded bg-slate-50">Sin niveles definidos.</div>
                                                )}
                                                {(currentOverride.escala.tramos || []).map((t, i) => (
                                                    <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-100">
                                                        <span className="text-xs font-bold text-slate-500">Score &ge;</span>
                                                        <Input
                                                            type="number" className="w-14 h-8 text-center text-xs bg-white"
                                                            value={t.gte}
                                                            onChange={(e) => {
                                                                const newTramos = [...currentOverride.escala.tramos];
                                                                newTramos[i].gte = Number(e.target.value);
                                                                setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tramos: newTramos.sort((a, b) => a.gte - b.gte) } });
                                                            }}
                                                        />
                                                        <span className="text-xs text-slate-400">%</span>
                                                        <ChevronsRight size={14} className="text-slate-300" />
                                                        <span className="text-xs font-bold text-slate-500">Paga</span>
                                                        <Input
                                                            type="number" step="0.1" className="w-14 h-8 text-center text-xs bg-white"
                                                            value={t.pct}
                                                            onChange={(e) => {
                                                                const newTramos = [...currentOverride.escala.tramos];
                                                                newTramos[i].pct = Number(e.target.value);
                                                                setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tramos: newTramos } });
                                                            }}
                                                        />
                                                        <span className="text-xs text-slate-400">x</span>
                                                        <button onClick={() => {
                                                            const newTramos = currentOverride.escala.tramos.filter((_, idx) => idx !== i);
                                                            setCurrentOverride({ ...currentOverride, escala: { ...currentOverride.escala, tramos: newTramos } });
                                                        }} className="ml-auto text-slate-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveOverride} className="bg-blue-600 hover:bg-blue-700">Guardar Excepción</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </div >
    );
}
