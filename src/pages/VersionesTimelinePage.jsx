import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import { Target, Lightbulb, Clock, History, AlertCircle, ArrowLeft, Building2, Users, UserCircle2, Filter, ChevronDown, ChevronUp, Network } from "lucide-react";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";

export default function VersionesTimelinePage() {
    const [searchParams] = useSearchParams();
    const nav = useNavigate();
    const initialYear = searchParams.get("year") || getCurrentFiscalYear();
    const [selectedYear, setSelectedYear] = useState(Number(initialYear));

    const [plantillas, setPlantillas] = useState([]);
    const [loading, setLoading] = useState(true);

    // Catálogos para mapeos de ID -> Nombre
    const [areas, setAreas] = useState([]);
    const [sectores, setSectores] = useState([]);
    const [empleados, setEmpleados] = useState([]);

    // Filtros
    const [selectedScope, setSelectedScope] = useState("all");
    const [isExpanded, setIsExpanded] = useState(false); // Control global de expandir detalles

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [pRes, aRes, sRes, eRes] = await Promise.all([
                    api(`/templates?year=${selectedYear}&tipoFiltro=todos`),
                    api("/areas"),
                    api("/sectores"),
                    api("/empleados?pageSize=500&visibility=all")
                ]);

                setPlantillas(Array.isArray(pRes) ? pRes : (pRes?.items || pRes?.data || []));
                setAreas(Array.isArray(aRes) ? aRes : (aRes?.items || []));
                setSectores(Array.isArray(sRes) ? sRes : (sRes?.items || []));
                setEmpleados(Array.isArray(eRes) ? eRes : (eRes?.items || []));
            } catch (e) {
                console.error("Error cargando dependencias de la timeline", e);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [selectedYear]);

    // Agrupa en linajes (History Lines) igual que en el Modal
    const lineages = useMemo(() => {
        if (!plantillas || plantillas.length === 0) return [];

        const pMap = new Map(plantillas.map(p => [String(p._id), p]));

        // Raíces
        const roots = plantillas.filter(p => !p.parentPlantillaId || !pMap.has(String(p.parentPlantillaId)));

        const childrenByParent = new Map();
        plantillas.forEach(p => {
            if (p.parentPlantillaId) {
                const parentId = String(p.parentPlantillaId);
                if (!childrenByParent.has(parentId)) {
                    childrenByParent.set(parentId, []);
                }
                childrenByParent.get(parentId).push(p);
            }
        });

        const result = [];

        roots.forEach(root => {
            const chain = [root];
            let queue = [String(root._id)];
            while (queue.length > 0) {
                const currId = queue.shift();
                const children = childrenByParent.get(currId) || [];
                children.forEach(c => {
                    chain.push(c);
                    queue.push(String(c._id));
                });
            }

            chain.sort((a, b) => (a.version || 1) - (b.version || 1));

            if (chain.length > 1) {
                result.push({ root, chain, scopeType: root.scopeType, scopeId: root.scopeId });
            }
        });

        result.sort((a, b) => {
            const lastA = new Date(a.chain[a.chain.length - 1].updatedAt || 0);
            const lastB = new Date(b.chain[b.chain.length - 1].updatedAt || 0);
            return lastB - lastA;
        });

        return result;

    }, [plantillas]);

    // Aplicar Filtro Visual del Sidebar
    const filteredLineages = useMemo(() => {
        if (selectedScope === "all") return lineages;
        return lineages.filter(l => (l.scopeType || "general") === selectedScope);
    }, [lineages, selectedScope]);

    const getScopeDetails = (type, id) => {
        if (!type || type === "general") return { icon: <Target className="w-4 h-4" />, name: "Plantilla General", color: "text-slate-600 bg-slate-100" };
        if (type === "area") {
            const doc = areas.find(a => String(a._id) === String(id));
            return { icon: <Building2 className="w-4 h-4" />, name: `Área: ${doc?.nombre || 'Desconocida'}`, color: "text-indigo-700 bg-indigo-100/50 border-indigo-200" };
        }
        if (type === "sector") {
            const doc = sectores.find(a => String(a._id) === String(id));
            return { icon: <Users className="w-4 h-4" />, name: `Sector: ${doc?.nombre || 'Desconocido'}`, color: "text-blue-700 bg-blue-100/50 border-blue-200" };
        }
        if (type === "empleado") {
            const doc = empleados.find(a => String(a._id) === String(id));
            return { icon: <UserCircle2 className="w-4 h-4" />, name: `Emp: ${doc?.apellido || ''}, ${doc?.nombre || ''}`, color: "text-emerald-700 bg-emerald-100/50 border-emerald-200" };
        }
        return { icon: <Target className="w-4 h-4" />, name: "Específico", color: "text-slate-600 bg-slate-100" };
    };

    const getStatusBadge = (p) => {
        if (p.activo && p.estadoAprobacion !== "pendiente") return <Badge className="bg-emerald-100/80 text-emerald-800 border-emerald-200 uppercase text-[9px] px-1.5 py-0 whitespace-nowrap hidden sm:inline-flex">Activa</Badge>;
        if (p.estadoAprobacion === "pendiente") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase text-[9px] px-1.5 py-0 animate-pulse whitespace-nowrap hidden sm:inline-flex">Pendiente</Badge>;
        if (p.estadoAprobacion === "rechazada") return <Badge className="bg-rose-100 text-rose-800 border-rose-200 uppercase text-[9px] px-1.5 py-0 whitespace-nowrap hidden sm:inline-flex">Rechazada</Badge>;
        return <Badge className="bg-slate-100 text-slate-500 border-slate-200 uppercase text-[9px] px-1.5 py-0 whitespace-nowrap hidden sm:inline-flex">Histórica</Badge>;
    };

    const counts = {
        all: lineages.length,
        general: lineages.filter(l => !l.scopeType || l.scopeType === "general").length,
        area: lineages.filter(l => l.scopeType === "area").length,
        sector: lineages.filter(l => l.scopeType === "sector").length,
        empleado: lineages.filter(l => l.scopeType === "empleado").length,
    };

    return (
        <div className="min-h-screen bg-[#f5f9fc] flex flex-col font-sans">
            {/* Superior Toolbar */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => nav("/plantillas")} className="hover:bg-slate-100 shrink-0">
                        <ArrowLeft className="w-5 h-5 text-slate-500" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800 tracking-tight leading-tight">
                            <History className="w-5 h-5 text-indigo-500" /> Historial de Reversiones
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">Seguimiento de modificaciones estructurales en objetivos</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`gap-2 ${isExpanded ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-slate-600'}`}
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {isExpanded ? "Colapsar" : "Expandir"}
                    </Button>
                    <select
                        className="bg-white border border-slate-200 text-slate-700 text-sm rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block pl-3 pr-8 py-1.5 focus:outline-none cursor-pointer hover:border-blue-300 transition-colors"
                        value={selectedYear}
                        onChange={(e) => {
                            const y = Number(e.target.value);
                            setSelectedYear(y);
                            setSearchParams({ year: y });
                        }}
                    >
                        {[2023, 2024, 2025, 2026, 2027, 2028, 2029].map((y) => (
                            <option key={y} value={y}>{y}–{y + 1}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Layout Split */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar (Alcance) */}
                <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto z-20 shadow-sm relative">
                    <div className="p-5">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> Filtros de Alcance</h4>

                        <div className="space-y-1.5">
                            <button onClick={() => setSelectedScope("all")} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${selectedScope === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <span>Todos</span>
                                <Badge variant="secondary" className="bg-white/50">{counts.all}</Badge>
                            </button>
                            <button onClick={() => setSelectedScope("general")} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${selectedScope === 'general' ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2"><Target className="w-4 h-4 opacity-70" /> Generales</div>
                                <Badge variant="secondary" className="bg-white/50">{counts.general}</Badge>
                            </button>
                            <button onClick={() => setSelectedScope("area")} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${selectedScope === 'area' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2"><Building2 className="w-4 h-4 opacity-70" /> Por Área</div>
                                <Badge variant="secondary" className="bg-white/50">{counts.area}</Badge>
                            </button>
                            <button onClick={() => setSelectedScope("sector")} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${selectedScope === 'sector' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2"><Users className="w-4 h-4 opacity-70" /> Por Sector</div>
                                <Badge variant="secondary" className="bg-white/50">{counts.sector}</Badge>
                            </button>
                            <button onClick={() => setSelectedScope("empleado")} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${selectedScope === 'empleado' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2"><UserCircle2 className="w-4 h-4 opacity-70" /> Por Empleado</div>
                                <Badge variant="secondary" className="bg-white/50">{counts.empleado}</Badge>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Timelines Area (Scroll 2D: Vertical y Horizontal) */}
                <div className="flex-1 overflow-auto bg-[#f5f9fc] relative">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center py-20 text-slate-400 gap-3 h-full">
                            <Clock className="w-10 h-10 animate-spin opacity-50" />
                            <p className="text-sm font-medium">Cargando historiales...</p>
                        </div>
                    ) : filteredLineages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 h-full text-center text-slate-500 max-w-lg mx-auto">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-6">
                                <Target className="w-10 h-10 opacity-30 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 tracking-tight">Sin historial en esta vista</h3>
                            <p className="mt-2 text-[15px] text-slate-500 leading-relaxed">No se encontraron versiones sobreescritas para el alcance seleccionado en este año fiscal.</p>
                        </div>
                    ) : (
                        <div className="min-w-max flex flex-col gap-5 p-8 pb-16">
                            {/* Cabecera de la tabla (falsa) - Sticky Top & Left */}
                            <div className="flex gap-6 items-center text-xs font-bold text-slate-400 tracking-wider uppercase sticky top-0 z-30 bg-[#f5f9fc] py-2">
                                <div className="w-[320px] shrink-0 pl-2 sticky left-8 bg-[#f5f9fc] z-40">Identificador de Objetivo</div>
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <Network className="w-3.5 h-3.5" /> Línea de Tiempo de Versiones
                                </div>
                            </div>

                            {filteredLineages.map((lineage, idx) => {
                                const scopeInfo = getScopeDetails(lineage.scopeType, lineage.scopeId);

                                return (
                                    <div key={idx} className="flex gap-6 items-stretch relative animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-colors" style={{ animationDelay: `${idx * 50}ms` }}>

                                        {/* Left Column: Project/Table Style (Sticky Horizontal) */}
                                        <div className="w-[320px] shrink-0 sticky left-8 z-20 flex flex-col justify-start border-r border-slate-200 bg-white rounded-l-xl p-4 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.05)]">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Badge variant="outline" className={`flex w-fit items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${scopeInfo.color}`}>
                                                    {scopeInfo.icon} <span className="truncate max-w-[140px]">{scopeInfo.name}</span>
                                                </Badge>
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-200 text-[9px] px-1.5 py-0.5 cursor-help" title={`Proceso: ${lineage.root.proceso} | Frecuencia: ${lineage.root.frecuencia}`}>
                                                    Info
                                                </Badge>
                                            </div>

                                            <h3 className="font-bold text-slate-800 text-sm leading-snug flex items-start gap-1.5">
                                                {lineage.root.tipo === 'objetivo' ? <Target className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" /> : <Lightbulb className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />}
                                                <span className="line-clamp-3">{lineage.root.nombre}</span>
                                            </h3>

                                            <div className="mt-auto pt-4 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                                {lineage.chain.length} VERSIONES EN TOTAL
                                            </div>
                                        </div>

                                        {/* Right: Timeline Cards (Continuo) */}
                                        <div className="flex flex-nowrap gap-4 items-start py-4 pr-6">
                                            {lineage.chain.map((p, i) => {
                                                const isPending = p.estadoAprobacion === 'pendiente';
                                                const isRoot = i === 0;
                                                const isActive = p.activo && !isPending;

                                                return (
                                                    <div key={p._id} className={`snap-start flex-none relative transition-all duration-300 ${isExpanded ? 'w-[320px]' : 'w-[240px]'}`}>
                                                        {/* Line Connector Background (Centered behind the row of cards) */}
                                                        {i < lineage.chain.length - 1 && (
                                                            <div className={`absolute left-[calc(100%-10px)] h-[2px] bg-slate-200 z-0 hidden lg:block rounded-full
                                                                    ${isExpanded ? 'w-5 top-[34px]' : 'w-5 top-1/2 -translate-y-1/2'}
                                                                `}></div>
                                                        )}

                                                        {/* Card Wrapper */}
                                                        <div className={`relative z-10 h-full flex flex-col rounded-2xl border transition-all duration-300 shadow-sm
                                                            ${isPending ? 'border-amber-200 bg-[#fffdf5] hover:shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'}
                                                            ${isActive ? 'ring-2 ring-emerald-500 border-transparent shadow-md bg-white' : ''}
                                                            ${!isActive && !isPending ? 'opacity-80 hover:opacity-100' : ''}
                                                        `}>

                                                            {/* Card Header (Siempre Visible) */}
                                                            <div className={`px-4 py-3 shrink-0 flex justify-between items-center transition-all duration-300
                                                                ${isActive ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : isPending ? 'bg-amber-100/40 border-amber-100' : 'bg-slate-50 border-slate-100'}
                                                                ${!isExpanded ? 'rounded-2xl border-b-0' : 'rounded-t-2xl border-b'}
                                                            `}>
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-7 h-7 rounded-sm flex justify-center items-center text-xs font-black text-white shadow-inner shrink-0
                                                                         ${isActive ? 'bg-emerald-500' : isPending ? 'bg-amber-400' : 'bg-slate-400'}
                                                                     `}>
                                                                        v{p.version || 1}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">
                                                                            {isRoot ? 'Versión Base' : 'Reversión'}
                                                                        </span>
                                                                        {getStatusBadge(p)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Autorizado el</span>
                                                                    <span className="block text-[10px] font-medium text-slate-600">
                                                                        {p.updatedAt ? format(new Date(p.updatedAt), "dd/MMM/yy", { locale: es }) : 'N/A'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Body Content */}
                                                            {isExpanded && (
                                                                <div className="p-4 flex-1 flex flex-col animate-in slide-in-from-top-2 fade-in duration-200">
                                                                    {(p.motivoVersion || p.comentarioVersion) && (
                                                                        <div className={`mb-3 p-2.5 rounded-lg border flex flex-col gap-1 shrink-0
                                                                            ${isPending ? 'bg-amber-100/30 border-amber-200/50' : 'bg-slate-50 border-slate-100'}
                                                                        `}>
                                                                            {p.motivoVersion && (
                                                                                <div className={`flex items-start gap-2 font-bold text-[11px] uppercase tracking-wide
                                                                                ${isPending ? 'text-amber-800' : 'text-slate-600'}
                                                                            `}>
                                                                                    <AlertCircle className="w-4 h-4 shrink-0 mt-[-1px]" />
                                                                                    <span>{p.motivoVersion}</span>
                                                                                </div>
                                                                            )}
                                                                            {p.comentarioVersion && (
                                                                                <div className="text-[13px] font-medium text-slate-500 italic leading-relaxed pl-6">
                                                                                    "{p.comentarioVersion}"
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* Metas/Targets List */}
                                                                    <div className="flex-1">
                                                                        <h5 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 mt-1">Configuración de Metas</h5>
                                                                        <div className="space-y-1.5">
                                                                            {p.metas?.map(m => (
                                                                                <div key={m._id || m.nombre} className="bg-slate-50 border border-slate-100 rounded-lg py-1.5 px-2.5 flex justify-between items-center group hover:bg-white hover:border-slate-200 transition-colors">
                                                                                    <span className="text-[11px] font-bold text-slate-700 leading-tight line-clamp-2 pr-2">
                                                                                        {m.nombre}
                                                                                    </span>
                                                                                    <div className="shrink-0 flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                                                                                        {m.operador && <span className="text-slate-400 font-mono text-[9px] uppercase font-bold">{m.operador}</span>}
                                                                                        <span className="font-black text-indigo-600 font-mono text-xs">{m.target || m.esperado}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Global style for hiding scrollbar specifically in this component class */}
            <style dangerouslySetInnerHTML={{
                __html: `
            .hide-scrollbar-force::-webkit-scrollbar {
                display: none;
            }
            .hide-scrollbar-force {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
        `}} />
        </div>
    );
}
