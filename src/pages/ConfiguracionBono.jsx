import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Save, Calculator, Plus, Trash2, Edit2, ChevronsRight, LayoutGrid, User, Layers, ArrowRight, Search, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

export default function ConfiguracionBono() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);

    // Main config state (container for overrides)
    const [config, setConfig] = useState({
        // Default dummy values (not used logic-wise if user asks for no global)
        escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
        bonoTarget: 0,
        overrides: []
    });

    // Builder State
    const [catalogs, setCatalogs] = useState({ areas: [], empleados: [] });
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchRef = useRef(null);

    const [builderState, setBuilderState] = useState({
        // isEditing removed, strictly for creation now
        type: "area", // area | empleado
        targetId: "",
        targetName: "",
        bonoTarget: 0,
        escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] }
    });

    // Edit Modal State
    const [editModal, setEditModal] = useState({
        isOpen: false,
        index: -1,
        data: null // { targetName, bonoTarget, escala: ... }
    });

    // Simulator State
    const [simData, setSimData] = useState({ score: 85, sueldo: 1000000 });

    useEffect(() => {
        loadCatalogs();
        // Click outside handler for search
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        loadConfig();
    }, [year]);

    const loadCatalogs = async () => {
        try {
            const [a, e] = await Promise.all([api("/areas"), api("/empleados?limit=1000")]);
            const areas = Array.isArray(a) ? a : (a.data || []);
            const emps = Array.isArray(e) ? e : (e.items || e.data || []);
            setCatalogs({
                areas: areas.map(x => ({ id: x._id, name: x.nombre })),
                empleados: emps.map(x => ({ id: x._id || x.id, name: `${x.apellido}, ${x.nombre}` }))
            });
        } catch (err) {
            console.error("Error catalogs", err);
        }
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await api(`/bono/config/${year}`);
            if (data && !data.isNew) {
                setConfig({
                    escala: data.escala || { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
                    bonoTarget: data.bonoTarget ?? 0,
                    overrides: data.overrides || [],
                });
            } else {
                setConfig({
                    escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] },
                    bonoTarget: 0,
                    overrides: []
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- Actions ---

    const handleSaveGlobal = async (newConfig = config) => {
        try {
            await api(`/bono/config/${year}`, { method: "POST", body: newConfig });
            return true;
        } catch (err) {
            console.error(err);
            toast.error("Error al guardar en servidor");
            return false;
        }
    };

    const handleCalculate = async () => {
        if (!confirm(`¿Recalcular bonos ${year}?`)) return;
        setCalculating(true);
        try {
            await handleSaveGlobal(); // Ensure latest is saved
            const res = await api(`/bono/calculate/${year}`, { method: "POST" });
            toast.success(res.message || "Cálculo finalizado");
        } catch (err) {
            toast.error(err.message || "Error al calcular");
        } finally {
            setCalculating(false);
        }
    };

    // --- Builder Handlers ---

    const resetBuilder = () => {
        setBuilderState({
            type: "area",
            targetId: "",
            targetName: "",
            bonoTarget: 0,
            escala: { tipo: "lineal", minPct: 0, maxPct: 1.0, umbral: 60, tramos: [] }
        });
        setSearchTerm("");
    };

    const handleDeleteRule = async (idx) => {
        if (!confirm("¿Eliminar esta regla?")) return;
        const newOverrides = [...config.overrides];
        newOverrides.splice(idx, 1);
        const newConfig = { ...config, overrides: newOverrides };
        setConfig(newConfig);
        await handleSaveGlobal(newConfig);
        toast.success("Regla eliminada");
    };

    const handleSaveBuilder = async () => {
        if (!builderState.targetId) return toast.error("Seleccioná un Área o Empleado");

        // Resolve Name
        let name = "Desconocido";
        if (builderState.type === "area") {
            const f = catalogs.areas.find(x => x.id === builderState.targetId);
            if (f) name = f.name;
        } else {
            // Check if user manually typed name that exists or we rely on selection
            // We rely on targetId being set. if targetId is set, search catalogs
            const f = catalogs.empleados.find(x => x.id === builderState.targetId);
            if (f) name = f.name;
        }

        const newRule = {
            type: builderState.type,
            targetId: builderState.targetId,
            targetName: name,
            bonoTarget: Number(builderState.bonoTarget),
            escala: { ...builderState.escala }
        };

        const newOverrides = [...config.overrides, newRule];

        const newConfig = { ...config, overrides: newOverrides };
        setConfig(newConfig);

        const ok = await handleSaveGlobal(newConfig);
        if (ok) {
            toast.success("Regla creada");
            resetBuilder();
        }
    };

    const handleRecalculateRule = async (rule) => {
        const toastId = toast.loading("Recalculando...");
        try {
            // Force save global first to ensure rule is up to date
            await handleSaveGlobal();

            const q = `?targetId=${rule.targetId}&type=${rule.type}`;
            const res = await api(`/bono/calculate/${year}${q}`, { method: "POST" });

            toast.dismiss(toastId);

            // Show detailed result if available
            if (res.debugs && res.debugs.length > 0) {
                toast.success(
                    <div className="text-xs">
                        <div className="font-bold mb-1">Cálculo Exitoso</div>
                        <ul className="list-disc pl-3 text-[10px] space-y-0.5 opacity-90">
                            {res.debugs.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                    </div>,
                    { duration: 5000 }
                );
            } else {
                toast.success("Bono recalculado correctamente");
            }
        } catch (err) {
            console.error(err);
            toast.dismiss(toastId);
            toast.error("Error al recalcular");
        }
    };

    // --- Edit Modal Handlers ---

    const handleEditRule = (idx) => {
        const rule = config.overrides[idx];
        setEditModal({
            isOpen: true,
            index: idx,
            data: JSON.parse(JSON.stringify(rule)) // Deep copy
        });
    };

    const handleSaveEdit = async () => {
        if (!editModal.data) return;

        const newOverrides = [...config.overrides];
        newOverrides[editModal.index] = editModal.data;

        const newConfig = { ...config, overrides: newOverrides };
        setConfig(newConfig);

        const ok = await handleSaveGlobal(newConfig);
        if (ok) {
            toast.success("Regla actualizada");
            setEditModal({ isOpen: false, index: -1, data: null });
        }
    };

    // --- Helper for Robust parsing (Handles "0,6" and "0.6") ---
    const safeParse = (val) => {
        if (!val && val !== 0) return 0;
        // Convert to string, replace comma with dot, then parse
        const s = String(val).replace(',', '.');
        const n = Number(s);
        return isNaN(n) ? 0 : n;
    };

    // --- Dynamic Text Generation (Reusable) ---
    const renderDynamicExplanation = (escala, bonoTarget) => {
        const bTarget = safeParse(bonoTarget);
        const targetDesc = `Bono Target: ${(bTarget * 100).toFixed(0)}% del sueldo de referencia`;

        if (escala.tipo === 'lineal') {
            const umbral = safeParse(escala.umbral);
            const minPct = safeParse(escala.minPct);
            const maxPct = safeParse(escala.maxPct);

            return (
                <div className="text-sm text-slate-700 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/50">
                        <span className="font-bold text-blue-700">{targetDesc}</span>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-600">
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"></span>
                            <span>Si el cumplimiento es menor al <strong>{umbral}%</strong>, <span className="text-slate-500 font-medium">no corresponde pago de bono.</span></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5 shrink-0"></span>
                            <span>Al alcanzar el umbral del <strong>{umbral}%</strong>, se paga el <strong>{(minPct * 100).toFixed(0)}%</strong> del bono base.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                            <span>Si se logra el objetivo al <strong>100%</strong>, se paga el <strong>{(maxPct * 100).toFixed(0)}%</strong> del bono base.</span>
                        </li>
                    </ul>
                    <div className="text-[10px] text-slate-400 font-medium pt-1 italic border-t border-slate-100 mt-2">
                        * El cálculo se realiza de forma proporcional (lineal) entre los puntos definidos.
                    </div>
                </div>
            );
        } else {
            const steps = escala.tramos || [];
            if (!steps.length) return <p className="text-xs text-slate-400 italic">No hay tramos definidos para esta regla.</p>;

            return (
                <div className="text-sm text-slate-700 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/50">
                        <span className="font-bold text-indigo-700">{targetDesc}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">El bono se paga en escalones fijos según el cumplimiento:</p>
                    <div className="space-y-1.5">
                        {[...steps].sort((a, b) => a.gte - b.gte).map((t, i) => (
                            <div key={i} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-slate-100 text-xs shadow-sm">
                                <span className="font-medium text-slate-600">Cumplimiento &ge; <strong>{t.gte}%</strong></span>
                                <ArrowRight size={10} className="text-slate-300" />
                                <span className="font-bold text-indigo-600">Paga x{t.pct} bonos</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
    };

    // --- Simulator Logic ---
    const getSimResult = () => {
        const score = safeParse(simData.score);
        const sueldo = safeParse(simData.sueldo);
        const bTarget = safeParse(builderState.bonoTarget);
        const { escala } = builderState;
        let factor = 0;

        if (escala.tipo === 'lineal') {
            const umbral = safeParse(escala.umbral);
            const minPct = safeParse(escala.minPct);
            const maxPct = safeParse(escala.maxPct);

            if (score >= umbral) {
                if (score >= 100) factor = maxPct;
                else {
                    const range = 100 - umbral;
                    if (range > 0) {
                        const progress = (score - umbral) / range;
                        factor = minPct + progress * (maxPct - minPct);
                    }
                }
            }
        } else {
            const steps = escala.tramos || [];
            // find highest match
            const match = [...steps].sort((a, b) => b.gte - a.gte).find(s => score >= s.gte);
            if (match) factor = safeParse(match.pct);
        }

        const monto = sueldo * bTarget * factor;
        return { monto, percentageOfTarget: factor };
    };
    const simRes = getSimResult();


    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-600">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Reglas de Bonos</h1>
                        <p className="text-slate-500 mt-1">Definición de reglas por Área o Empleado.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <Button onClick={handleCalculate} disabled={calculating} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl px-4 py-6 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                            <RefreshCw className={`mr-2 ${calculating ? 'animate-spin' : ''}`} size={18} />
                            {calculating ? "Calculando..." : "Recalcular Todo"}
                        </Button>
                    </div>
                </div>

                {/* --- GLOBAL CONFIG REMOVED --- */}


                {/* --- BUILDER (Top) --- */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                                <Plus size={20} />
                            </div>
                            <h2 className="font-bold text-lg text-slate-800">
                                Nueva Regla
                            </h2>
                        </div>
                    </div>

                    <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                        {/* LEFT: Config Form (Cols 8) */}
                        <div className="lg:col-span-8 space-y-8">

                            {/* 1. Scope Selection */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Alcance</label>
                                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                        <button
                                            onClick={() => {
                                                setBuilderState({ ...builderState, type: 'area', targetId: '', targetName: '' });
                                                setSearchTerm('');
                                            }}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${builderState.type === 'area' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                            Por Área
                                        </button>
                                        <button
                                            onClick={() => {
                                                setBuilderState({ ...builderState, type: 'empleado', targetId: '', targetName: '' });
                                                setSearchTerm('');
                                            }}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${builderState.type === 'empleado' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                            Por Empleado
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                                        {builderState.type === 'area' ? 'Seleccionar Área' : 'Seleccionar Empleado'}
                                    </label>

                                    {builderState.type === 'area' ? (
                                        <select
                                            className="w-full h-10 rounded-xl border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none px-2 border"
                                            value={builderState.targetId}
                                            onChange={e => setBuilderState({ ...builderState, targetId: e.target.value })}
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {catalogs.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    ) : (
                                        <div className="relative" ref={searchRef}>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                                <Input
                                                    placeholder="Escribí para buscar..."
                                                    className="pl-9 pr-8 h-10 rounded-xl bg-white border-slate-200"
                                                    value={searchTerm}
                                                    onChange={e => {
                                                        setSearchTerm(e.target.value);
                                                        setBuilderState({ ...builderState, targetId: '' }); // Clear selection on type
                                                        setIsSearchOpen(true);
                                                    }}
                                                    onFocus={() => setIsSearchOpen(true)}
                                                />
                                                {searchTerm && (
                                                    <button
                                                        onClick={() => { setSearchTerm(''); setBuilderState({ ...builderState, targetId: '' }); }}
                                                        className="absolute right-3 top-3 text-slate-300 hover:text-slate-500"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Results Dropdown */}
                                            {isSearchOpen && (
                                                <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
                                                    {catalogs.empleados
                                                        .filter(e => !searchTerm || e.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                                        .slice(0, 100) // limit results
                                                        .map(emp => (
                                                            <button
                                                                key={emp.id}
                                                                onClick={() => {
                                                                    setBuilderState({ ...builderState, targetId: emp.id, targetName: emp.name });
                                                                    setSearchTerm(emp.name);
                                                                    setIsSearchOpen(false);
                                                                }}
                                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between group ${builderState.targetId === emp.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}
                                                            >
                                                                <span className="font-medium truncate">{emp.name}</span>
                                                                {builderState.targetId === emp.id && <span className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded text-blue-600 font-bold">LIGADO</span>}
                                                            </button>
                                                        ))
                                                    }
                                                    {catalogs.empleados.filter(e => !searchTerm || e.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                                        <div className="px-4 py-3 text-sm text-slate-400 text-center italic">
                                                            No se encontraron empleados.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* 2. Params */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Multiplicador Target</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number" step="0.1"
                                            className="text-2xl font-black w-24 h-12"
                                            value={builderState.bonoTarget}
                                            onChange={e => setBuilderState({ ...builderState, bonoTarget: e.target.value })}
                                        />
                                        <span className="text-sm font-medium text-slate-500">Sueldos Brutos</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Bono base al 100% de cumplimiento.</p>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Modelo de Cálculo</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setBuilderState({ ...builderState, escala: { ...builderState.escala, tipo: 'lineal' } })}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold border ${builderState.escala.tipo === 'lineal' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                                            Lineal (Proporcional)
                                        </button>
                                        <button
                                            onClick={() => setBuilderState({ ...builderState, escala: { ...builderState.escala, tipo: 'tramos' } })}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold border ${builderState.escala.tipo === 'tramos' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                                            Por Tramos
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Scale Config */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                {builderState.escala.tipo === 'lineal' ? (
                                    <div className="grid grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Umbral Mínimo (%)</label>
                                            <Input
                                                type="number" className="bg-white font-bold"
                                                value={builderState.escala.umbral}
                                                onChange={e => setBuilderState({ ...builderState, escala: { ...builderState.escala, umbral: e.target.value } })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Pago Mínimo</label>
                                            <Input
                                                type="number" step="0.01" className="bg-white font-bold"
                                                value={builderState.escala.minPct}
                                                onChange={e => setBuilderState({ ...builderState, escala: { ...builderState.escala, minPct: e.target.value } })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Pago Máximo</label>
                                            <Input
                                                type="number" step="0.01" className="bg-white font-bold"
                                                value={builderState.escala.maxPct}
                                                onChange={e => setBuilderState({ ...builderState, escala: { ...builderState.escala, maxPct: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-slate-700 text-sm">Escalones de Pago</span>
                                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                                const newT = [...(builderState.escala.tramos || []), { gte: 90, pct: 1.0 }];
                                                setBuilderState({ ...builderState, escala: { ...builderState.escala, tramos: newT.sort((a, b) => a.gte - b.gte) } })
                                            }}>+ Agregar Nivel</Button>
                                        </div>
                                        {(builderState.escala.tramos || []).map((t, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-slate-400">Score &ge;</span>
                                                <Input type="number" className="w-16 h-8 text-center bg-white" value={t.gte} onChange={e => {
                                                    const newT = [...builderState.escala.tramos]; newT[i].gte = Number(e.target.value);
                                                    setBuilderState({ ...builderState, escala: { ...builderState.escala, tramos: newT.sort((a, b) => a.gte - b.gte) } })
                                                }} />
                                                <span className="text-xs font-bold text-slate-400">%</span>
                                                <ArrowRight size={14} className="text-slate-300" />
                                                <span className="text-xs font-bold text-slate-400">Paga</span>
                                                <Input type="number" step="0.1" className="w-16 h-8 text-center bg-white" value={t.pct} onChange={e => {
                                                    const newT = [...builderState.escala.tramos]; newT[i].pct = Number(e.target.value);
                                                    setBuilderState({ ...builderState, escala: { ...builderState.escala, tramos: newT } })
                                                }} />
                                                <span className="text-xs font-bold text-slate-400">x</span>
                                                <button onClick={() => {
                                                    const newT = builderState.escala.tramos.filter((_, idx) => idx !== i);
                                                    setBuilderState({ ...builderState, escala: { ...builderState.escala, tramos: newT } })
                                                }} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Dynamic Explanation Box */}
                                <div className="mt-8 pt-6 border-t border-slate-200/60 transition-all duration-300">
                                    <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase mb-3">
                                        <Layers size={12} /> Resumen de Regla
                                    </h4>
                                    <div className="bg-slate-50/80 p-4 rounded-lg border-l-4 border-blue-500 shadow-sm">
                                        {renderDynamicExplanation(builderState.escala, builderState.bonoTarget)}
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* RIGHT: Simulator (Cols 4) */}
                        <div className="lg:col-span-4 border-l border-slate-100 pl-8 flex flex-col h-full">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                                <Calculator className="text-indigo-500" size={18} /> Simulador
                            </h3>

                            <div className="bg-indigo-950 text-white rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
                                <p className="text-xs text-indigo-300 mb-4 font-medium uppercase tracking-wide">Probar esta regla en vivo</p>

                                <div className="space-y-5 mb-auto">
                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-300 uppercase block mb-1">Score Logrado</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={simData.score}
                                                onChange={e => setSimData({ ...simData, score: Number(e.target.value) })}
                                                className="bg-indigo-900/50 w-full rounded-lg px-3 py-2 font-bold text-white outline-none focus:ring-1 focus:ring-indigo-400"
                                            />
                                            <span className="text-sm font-bold">%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-300 uppercase block mb-1">Sueldo Base</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-indigo-400">$</span>
                                            <input
                                                type="number"
                                                value={simData.sueldo}
                                                onChange={e => setSimData({ ...simData, sueldo: Number(e.target.value) })}
                                                className="bg-indigo-900/50 w-full rounded-lg px-3 py-2 font-bold text-white outline-none focus:ring-1 focus:ring-indigo-400"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-indigo-800/50">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-xs font-bold text-indigo-300 uppercase">Bono Estimado</span>
                                        <span className="text-xs text-indigo-300 font-mono">{(simRes.percentageOfTarget * 100).toFixed(0)}% del Base</span>
                                    </div>
                                    <div className="text-3xl font-black text-emerald-400 tracking-tight text-right">
                                        $ {simRes.monto.toLocaleString('es-AR')}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
                                <Button onClick={handleSaveBuilder} className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 rounded-2xl">
                                    <Save className="mr-2" /> Guardar Regla
                                </Button>
                            </div>
                        </div>

                    </div>
                </div>

                {/* --- LIST (Bottom) --- */}
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-800 px-2 border-l-4 border-blue-500 pl-4">
                        Reglas Guardadas ({config.overrides?.length || 0})
                    </h3>

                    {(!config.overrides || !config.overrides.length) && (
                        <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center bg-white/50">
                            <p className="text-slate-400 font-medium">No hay reglas definidas.</p>
                            <p className="text-sm text-slate-400 mt-1">Utilizá el panel superior para crear la primera regla.</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        {(config.overrides || []).map((rule, idx) => (
                            <div key={idx} className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-all relative group flex flex-col md:flex-row gap-6`}>

                                {/* 1. Icon & Main Info */}
                                <div className="flex items-start gap-4 min-w-[200px]">
                                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-bold text-xs border shadow-sm ${rule.type === 'area' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                                        <span className="text-[9px] opacity-60 uppercase tracking-wider">{rule.type === 'area' ? 'Area' : 'Emp'}</span>
                                        <LayoutGrid size={20} className="mt-1" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg leading-tight">{rule.targetName}</h4>
                                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Target</span>
                                            <span className="text-sm font-black text-slate-800">x{rule.bonoTarget}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Detailed Config */}
                                <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {rule.escala.tipo === 'lineal' ? (
                                        <>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Modelo Lineal</label>
                                                <div className="text-sm font-medium text-blue-600">Proporcional</div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Umbral Mín.</label>
                                                <div className="text-sm font-bold text-slate-700">{rule.escala.umbral}%</div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Rango Pago</label>
                                                <div className="text-sm font-bold text-slate-700">
                                                    Min: <span className="text-slate-900">{rule.escala.minPct}x</span>
                                                    <span className="mx-2 text-slate-300">|</span>
                                                    Max: <span className="text-slate-900">{rule.escala.maxPct}x</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="col-span-3">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Escala por Tramos</label>
                                            <div className="flex flex-wrap gap-2">
                                                {(rule.escala.tramos || []).map((t, i) => (
                                                    <div key={i} className="flex items-center text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded">
                                                        <span className="font-bold">Score &ge; {t.gte}%</span>
                                                        <ArrowRight size={12} className="mx-1 opacity-50" />
                                                        <span className="font-bold">x{t.pct}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 3. Actions */}
                                <div className="flex md:flex-col gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4 justify-end">
                                    <Button onClick={() => handleRecalculateRule(rule)} variant="ghost" size="sm" className="bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 justify-start">
                                        <RefreshCw size={16} className="mr-2" /> Recalcular
                                    </Button>
                                    <Button onClick={() => handleEditRule(idx)} variant="ghost" size="sm" className="bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 justify-start">
                                        <Edit2 size={16} className="mr-2" /> Editar
                                    </Button>
                                    <Button onClick={() => handleDeleteRule(idx)} variant="ghost" size="sm" className="bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 justify-start">
                                        <Trash2 size={16} className="mr-2" /> Borrar
                                    </Button>
                                </div>

                            </div>
                        ))}
                    </div>
                </div>

                {/* --- EDIT MODAL --- */}
                {editModal.isOpen && editModal.data && (
                    <Dialog open={true} onOpenChange={() => setEditModal({ ...editModal, isOpen: false })}>
                        <DialogContent className="max-w-2xl overflow-hidden p-0 gap-0 rounded-2xl">
                            <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                                <DialogTitle className="text-base font-bold text-slate-700 flex items-center gap-2">
                                    <Edit2 size={16} className="text-blue-600" />
                                    Editar Regla
                                </DialogTitle>
                            </div>

                            <div className="flex flex-col">
                                {/* Top Section: Inputs */}
                                <div className="p-5 space-y-4">
                                    {/* 1. Target (Read Only) */}
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                                            {editModal.data.type === 'area' ? 'Área / Puesto' : 'Empleado'}
                                        </label>
                                        <div className="relative">
                                            <Input
                                                disabled
                                                value={editModal.data.targetName}
                                                className="bg-slate-50 border-slate-200 font-bold text-slate-600 h-9 text-xs pl-3"
                                            />
                                            <div className="absolute right-2 top-2">
                                                <span className="text-[9px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase">
                                                    Fijo
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Target Multiplier */}
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Multiplicador Target</label>
                                        <div className="flex items-center gap-2">
                                            <div className="relative w-24">
                                                <Input
                                                    type="number" step="0.1"
                                                    className="text-lg font-black h-9 bg-white border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-center pr-6"
                                                    value={editModal.data.bonoTarget}
                                                    onChange={e => setEditModal({
                                                        ...editModal,
                                                        data: { ...editModal.data, bonoTarget: e.target.value }
                                                    })}
                                                />
                                                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-300">x</span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500">Sueldos Brutos</span>
                                        </div>
                                    </div>

                                    <hr className="border-slate-100" />

                                    {/* 3. Scale Configuration & Model Type */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Modelo de Cálculo</label>
                                            <div className="flex gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200 w-fit">
                                                <button
                                                    onClick={() => setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tipo: 'lineal' } } })}
                                                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${editModal.data.escala.tipo === 'lineal' ? 'bg-white shadow-sm text-blue-700 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}>
                                                    Lineal
                                                </button>
                                                <button
                                                    onClick={() => setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tipo: 'tramos' } } })}
                                                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${editModal.data.escala.tipo === 'tramos' ? 'bg-white shadow-sm text-indigo-700 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}>
                                                    Por Tramos
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                                            {editModal.data.escala.tipo === 'lineal' ? (
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5">Umbral (%)</label>
                                                        <Input
                                                            type="number" className="bg-white font-bold h-9 text-xs text-center border-slate-200 focus:border-blue-500"
                                                            value={editModal.data.escala.umbral}
                                                            onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, umbral: e.target.value } } })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5">Mínimo (x)</label>
                                                        <Input
                                                            type="number" step="0.01" className="bg-white font-bold h-9 text-xs text-center border-slate-200 focus:border-blue-500"
                                                            value={editModal.data.escala.minPct}
                                                            onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, minPct: e.target.value } } })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5">Máximo (x)</label>
                                                        <Input
                                                            type="number" step="0.01" className="bg-white font-bold h-9 text-xs text-center border-slate-200 focus:border-blue-500"
                                                            value={editModal.data.escala.maxPct}
                                                            onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, maxPct: e.target.value } } })}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-bold text-slate-600 text-xs">Escalones</span>
                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-600 hover:bg-blue-50" onClick={() => {
                                                            const newT = [...(editModal.data.escala.tramos || []), { gte: 90, pct: 1.0 }];
                                                            setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tramos: newT.sort((a, b) => a.gte - b.gte) } } })
                                                        }}>
                                                            <Plus size={14} />
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-1.5 h-32 overflow-y-auto pr-1">
                                                        {(editModal.data.escala.tramos || []).map((t, i) => (
                                                            <div key={i} className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-slate-200">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-8 text-right">Score &gt;</span>
                                                                    <Input type="number" className="w-12 h-7 text-center bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 text-xs font-bold p-0" value={t.gte} onChange={e => {
                                                                        const newT = [...editModal.data.escala.tramos]; newT[i].gte = Number(e.target.value);
                                                                        setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tramos: newT.sort((a, b) => a.gte - b.gte) } } })
                                                                    }} />
                                                                    <span className="text-xs text-slate-300 font-bold">%</span>
                                                                </div>
                                                                <ArrowRight size={10} className="text-slate-300" />
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Paga</span>
                                                                    <Input type="number" step="0.1" className="w-12 h-7 text-center bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 text-xs font-bold p-0" value={t.pct} onChange={e => {
                                                                        const newT = [...editModal.data.escala.tramos]; newT[i].pct = Number(e.target.value);
                                                                        setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tramos: newT } } })
                                                                    }} />
                                                                    <span className="text-xs text-slate-300 font-bold">x</span>
                                                                </div>
                                                                <button onClick={() => {
                                                                    const newT = editModal.data.escala.tramos.filter((_, idx) => idx !== i);
                                                                    setEditModal({ ...editModal, data: { ...editModal.data, escala: { ...editModal.data.escala, tramos: newT } } })
                                                                }} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={12} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Section: Preview & Actions */}
                                <div className="bg-slate-50/30 border-t border-slate-100 p-5">
                                    <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase mb-3">
                                        <Layers size={12} /> Vista Previa
                                    </h4>
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
                                        {renderDynamicExplanation(editModal.data.escala, editModal.data.bonoTarget)}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setEditModal({ ...editModal, isOpen: false })} className="flex-1 h-10 text-xs text-slate-500 font-bold hover:bg-slate-200/50">
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSaveEdit} className="flex-1 h-10 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/10 rounded-lg">
                                            Guardar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

            </div>
        </div>
    );
}
