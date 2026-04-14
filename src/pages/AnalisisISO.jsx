// src/pages/AnalisisISO.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { 
    ChevronLeft, 
    TrendingUp, 
    Calendar, 
    FileText, 
    Layers, 
    MessageSquare, 
    User, 
    ArrowRight,
    Info,
    LayoutDashboard,
    ExternalLink,
    ChevronDown,
    Paperclip,
    Download
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from "recharts";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_NAMES_SHORT = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const FISCAL_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

export default function AnalisisISO() {
    const navigate = useNavigate();
    const [year, setYear] = useState(getCurrentFiscalYear());
    const [loading, setLoading] = useState(true);
    
    // Data state
    const [objetivos, setObjetivos] = useState([]);
    const [procesos, setProcesos] = useState([]);
    const [plantillas, setPlantillas] = useState([]);
    
    // Selection state
    const [selectedObjId, setSelectedObjId] = useState(null);
    const [activeMonthFilter, setActiveMonthFilter] = useState(null);
    
    // Accordion state
    const [expandedProc, setExpandedProc] = useState(null);
    const [expandedPl, setExpandedPl] = useState(null);

    // ─── Fetch Data ───────────────────────────────────────────────────────────
    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            try {
                const [obs, procs, templates] = await Promise.all([
                    api(`/objetivos-iso?year=${year}`),
                    api(`/procesos-iso?year=${year}`),
                    api(`/templates?year=${year}&all=true`)
                ]);
                
                setObjetivos(Array.isArray(obs) ? obs : []);
                setProcesos(Array.isArray(procs) ? procs : []);
                
                // Filter templates to only include 'objetivo' type
                const plArr = Array.isArray(templates) ? templates
                    : Array.isArray(templates?.items) ? templates.items
                    : Array.isArray(templates?.data) ? templates.data : [];
                setPlantillas(plArr.filter(pl => pl.tipo === "objetivo"));

                if (obs.length > 0 && !selectedObjId) {
                    setSelectedObjId(obs[0]._id);
                }
            } catch (err) {
                toast.error("Error cargando datos de análisis.");
            } finally {
                setLoading(false);
            }
        };
        loadAll();
    }, [year]);

    // ─── Computed ─────────────────────────────────────────────────────────────
    const selectedObj = useMemo(() => {
        return objetivos.find(o => o._id === selectedObjId);
    }, [objetivos, selectedObjId]);

    const procesosDelObj = useMemo(() => {
        if (!selectedObjId) return [];
        return procesos.filter(p => {
            const list = p.objetivosISO || [];
            return list.some(o => String(typeof o === "object" ? o._id : o) === selectedObjId);
        });
    }, [procesos, selectedObjId]);

    const plantillasDelObj = useMemo(() => {
        if (procesosDelObj.length === 0) return [];
        const procNames = procesosDelObj.map(p => p.fullName?.trim()).filter(Boolean);
        return plantillas.filter(pl => procNames.includes(pl.proceso?.trim()));
    }, [plantillas, procesosDelObj]);

    // Prepara datos para el gráfico
    const chartData = useMemo(() => {
        if (!selectedObj) return [];
        
        // Encontrar el último mes que tiene carga real
        const mesesConCarga = (selectedObj.seguimientoMensual || []).map(s => s.mes);
        const lastMonthIndex = FISCAL_MONTH_ORDER.reduce((last, m, idx) => {
            return mesesConCarga.includes(m) ? idx : last;
        }, -1);

        let accumulated = 0;
        return FISCAL_MONTH_ORDER.map((m, idx) => {
            const entry = selectedObj.seguimientoMensual?.find(s => s.mes === m);
            const increment = entry?.progreso || 0;
            accumulated += increment;
            
            return {
                mesNum: m,
                name: MONTH_NAMES_SHORT[m],
                incremento: increment,
                // Si el índice es <= al último con carga, es "Real"
                totalReal: idx <= lastMonthIndex ? accumulated : null,
                // Proyectado es siempre el acumulado
                totalProyectado: accumulated,
                isReal: idx <= lastMonthIndex,
                comentario: entry?.comentario || "",
                adjunto: entry?.adjunto || null
            };
        });
    }, [selectedObj]);

    const filteredComments = useMemo(() => {
        if (!selectedObj) return [];
        if (activeMonthFilter) {
            return selectedObj.seguimientoMensual?.filter(s => s.mes === activeMonthFilter) || [];
        }
        return [...(selectedObj.seguimientoMensual || [])].sort((a,b) => {
            return FISCAL_MONTH_ORDER.indexOf(a.mes) - FISCAL_MONTH_ORDER.indexOf(b.mes);
        });
    }, [selectedObj, activeMonthFilter]);

    // ─── Render ───────────────────────────────────────────────────────────────
    if (loading && objetivos.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="text-slate-500 font-medium">Cargando Inteligencia ISO...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            {/* SIDEBAR DE OBJETIVOS */}
            <aside className="w-80 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shadow-sm z-10">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <LayoutDashboard size={20} />
                        </div>
                        <h2 className="font-bold text-slate-800 tracking-tight">Análisis ISO</h2>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-xs text-slate-500 hover:text-blue-600 mb-2"
                        onClick={() => navigate("/gestion-iso")}
                    >
                        <ChevronLeft size={14} className="mr-1" /> Volver a Gestión
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Objetivos del Período</p>
                    {objetivos.map(obj => (
                        <button
                            key={obj._id}
                            onClick={() => { setSelectedObjId(obj._id); setActiveMonthFilter(null); }}
                            className={`w-full text-left p-3 rounded-xl transition-all border flex flex-col gap-1.5
                                ${selectedObjId === obj._id 
                                    ? "bg-blue-50 border-blue-200 shadow-sm" 
                                    : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-100"}`}
                        >
                            <div className="flex items-start justify-between">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${selectedObjId === obj._id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {obj.codigo || "ISO"}
                                </span>
                                <span className="text-[10px] font-bold text-blue-600">{obj.progreso}%</span>
                            </div>
                            <span className={`text-xs font-bold leading-tight ${selectedObjId === obj._id ? "text-blue-900" : "text-slate-700"}`}>
                                {obj.nombre}
                            </span>
                        </button>
                    ))}
                </div>
            </aside>

            {/* CONTENIDO PRINCIPAL */}
            <main className="flex-1 flex flex-col">
                {/* Header Superior */}
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 p-6 sticky top-0 z-20 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                            {selectedObj?.nombre || "Cargando..."}
                        </h1>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                                <Calendar size={13} className="text-blue-500" /> Período Fiscal: {year}-{year+1}
                            </span>
                            {selectedObj?.representante && (
                                <span className="flex items-center gap-1">
                                    <User size={13} className="text-emerald-500" /> 
                                    Responsable: {selectedObj.representante.nombre} {selectedObj.representante.apellido}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                         <div className="text-right">
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Avance Alcanzado</p>
                             <p className="text-2xl font-black text-blue-600 leading-none">{selectedObj?.progreso || 0}%</p>
                         </div>
                    </div>
                </header>

                <div className="p-8 space-y-8 animate-in fade-in duration-500">
                    
                    {/* Grid de Información y Métricas */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Descripción */}
                        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Info size={14} className="text-blue-500" /> Descripción del Objetivo
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                {selectedObj?.descripcion || "Sin descripción proporcionada para este objetivo."}
                            </p>
                        </div>
                        
                        {/* Proceso Link */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-emerald-200 transition-all">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <Layers size={24} />
                            </div>
                            <p className="text-2xl font-black text-slate-900">{procesosDelObj.length}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procesos Asociados</p>
                        </div>

                        {/* Plantillas Link */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-violet-200 transition-all">
                            <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <FileText size={24} />
                            </div>
                            <p className="text-2xl font-black text-slate-900">{plantillasDelObj.length}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plantillas/KPIs</p>
                        </div>
                    </div>

                    {/* GRÁFICO DE INTELIGENCIA */}
                    <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <TrendingUp className="text-blue-500" /> Evolución del Avance
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Progreso acumulado a lo largo del año fiscal.</p>
                            </div>
                            {activeMonthFilter && (
                                <Button 
                                    variant="outline" 
                                    size="xs" 
                                    className="text-[10px] h-7 px-3 rounded-full"
                                    onClick={() => setActiveMonthFilter(null)}
                                >
                                    Limpiar filtro de mes
                                </Button>
                            )}
                        </div>

                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                                    onClick={(data) => {
                                        if (data && data.activePayload) {
                                            setActiveMonthFilter(data.activePayload[0].payload.mesNum);
                                        }
                                    }}
                                >
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorProyectado" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}}
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 12, fill: '#64748b'}}
                                        unit="%"
                                        domain={[0, 100]}
                                        ticks={[0, 25, 50, 75, 100]}
                                    />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value, name) => {
                                            const label = name === "totalReal" ? "Avance Real" : "Proyección";
                                            return [`${value}%`, label];
                                        }}
                                        labelFormatter={(label) => `Mes: ${label}`}
                                    />
                                    {/* Serie Proyectada (Dashed) */}
                                    <Area 
                                        type="monotone" 
                                        dataKey="totalProyectado" 
                                        stroke="#cbd5e1" 
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        fillOpacity={1} 
                                        fill="url(#colorProyectado)"
                                        activeDot={false}
                                    />
                                    {/* Serie Real (Solid) */}
                                    <Area 
                                        type="monotone" 
                                        dataKey="totalReal" 
                                        stroke="#3b82f6" 
                                        strokeWidth={4}
                                        fillOpacity={1} 
                                        fill="url(#colorTotal)"
                                        activeDot={{ r: 8, strokeWidth: 0, fill: '#3b82f6' }}
                                    />
                                    <ReferenceLine 
                                        y={selectedObj?.meta ?? 80} 
                                        stroke="#ef4444" 
                                        strokeDasharray="5 5" 
                                        strokeWidth={2}
                                    >
                                        <label position="right" fill="#ef4444" fontSize={11} fontWeight="800" dy={-10}>
                                            Meta Mínima Esperada: {selectedObj?.meta ?? 80}%
                                        </label>
                                    </ReferenceLine>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* COMENTARIOS Y JUSTIFICACIÓN */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <MessageSquare className="text-blue-500" size={18} /> 
                                Justificación del Avance {activeMonthFilter ? `(${MONTH_NAMES[activeMonthFilter]})` : "(Resumen)"}
                            </h3>
                        </div>
                        
                        <div className="p-8 space-y-6 max-h-[500px] overflow-y-auto bg-slate-50/30">
                            {filteredComments.length > 0 ? (
                                filteredComments.map((s, idx) => (
                                    <div key={idx} className="flex gap-6 animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                        <div className="flex flex-col items-center">
                                            <div className="w-10 h-10 rounded-full bg-white border-2 border-primary flex items-center justify-center z-10 shadow-sm shrink-0">
                                                <span className="text-xs font-black text-primary">{MONTH_NAMES_SHORT[s.mes]}</span>
                                            </div>
                                            {idx !== filteredComments.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-1"></div>}
                                        </div>
                                        <div className="flex-1 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-2">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                    Incremento: <span className="text-blue-600 font-black">+{s.progreso}%</span>
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">{s.year}</span>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed italic">
                                                "{s.comentario || "Sin comentario registrado para este mes."}"
                                            </p>

                                            {s.adjunto && (
                                                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                                                    <a 
                                                        href={`/uploads/iso-evidencias/${s.adjunto}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-full transition-colors border border-blue-100"
                                                    >
                                                        <Download size={12} /> Ver Evidencia Adjunta
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 flex flex-col items-center gap-3">
                                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                                        <MessageSquare size={32} />
                                    </div>
                                    <p className="text-sm text-slate-400 font-medium italic">No hay comentarios registrados para este período.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* DETALLE DE PROCESOS Y PLANTILLAS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Procesos */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                            <h3 className="text-md font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Layers size={18} className="text-emerald-500" /> Detalle de Procesos
                            </h3>
                            <div className="space-y-3">
                                {procesosDelObj.map(p => (
                                    <div key={p._id} className="flex flex-col rounded-xl border border-slate-50 bg-slate-50/30 hover:bg-white hover:border-emerald-100 transition-all overflow-hidden">
                                        <button 
                                            onClick={() => setExpandedProc(expandedProc === p._id ? null : p._id)}
                                            className="w-full flex items-center justify-between p-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">{p.codigo}</span>
                                                <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{p.nombre}</span>
                                            </div>
                                            <ChevronDown size={14} className={`text-slate-300 transition-transform ${expandedProc === p._id ? 'rotate-180 text-emerald-500' : ''}`} />
                                        </button>
                                        
                                        {expandedProc === p._id && (
                                            <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 duration-300">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-tight">Descripción del Proceso</p>
                                                <p className="text-xs text-slate-600 leading-relaxed bg-white border border-emerald-50 rounded-lg p-3 italic">
                                                    {p.descripcion || "Sin descripción registrada."}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {procesosDelObj.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Sin procesos asociados.</p>}
                            </div>
                        </div>

                        {/* Plantillas */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                            <h3 className="text-md font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <FileText size={18} className="text-violet-500" /> Plantillas / KPIs
                            </h3>
                            <div className="space-y-3">
                                {plantillasDelObj.map(pl => (
                                    <div key={pl._id} className="flex flex-col rounded-xl border border-slate-50 bg-slate-50/30 hover:bg-white hover:border-violet-100 transition-all overflow-hidden">
                                        <button 
                                            onClick={() => setExpandedPl(expandedPl === pl._id ? null : pl._id)}
                                            className="w-full flex items-center justify-between p-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${pl.activo ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {pl.activo ? 'ACTIVA' : 'INACT.'}
                                                </span>
                                                <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{pl.nombre}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-400">{pl.pesoBase}%</span>
                                                <ChevronDown size={14} className={`text-slate-300 transition-transform ${expandedPl === pl._id ? 'rotate-180 text-violet-500' : ''}`} />
                                            </div>
                                        </button>

                                        {expandedPl === pl._id && (
                                            <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 duration-300">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-tight">Descripción del KPI / Plantilla</p>
                                                <div className="text-xs text-slate-600 leading-relaxed bg-white border border-violet-50 rounded-lg p-3">
                                                    <p className="italic mb-2 text-slate-500">"{pl.descripcion || "Sin descripción registrada."}"</p>
                                                    <div className="flex items-center gap-4 border-t border-slate-50 pt-2 mt-2">
                                                        <div>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase block">Frecuencia</span>
                                                            <span className="font-bold text-slate-600">{pl.frecuencia}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase block">Proceso</span>
                                                            <span className="font-bold text-slate-600 truncate">{pl.proceso || "-"}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {plantillasDelObj.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Sin plantillas vinculadas.</p>}
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
