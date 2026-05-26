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
    User,
    ArrowRight,
    Info,
    LayoutDashboard,
    ExternalLink,
    ChevronDown,
    Paperclip
} from "lucide-react";
import {
    ComposedChart,
    Area,
    Bar,
    Line,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from "recharts";
import { Button } from "@/components/ui/button";

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

    // Si hay un proceso expandido, filtra las actividades a ese proceso
    const procesoFiltro = useMemo(
        () => procesosDelObj.find(p => p._id === expandedProc) || null,
        [procesosDelObj, expandedProc]
    );

    const plantillasFiltradas = useMemo(() => {
        if (!procesoFiltro) return plantillasDelObj;
        const procName = procesoFiltro.fullName?.trim();
        return plantillasDelObj.filter(pl => pl.proceso?.trim() === procName);
    }, [plantillasDelObj, procesoFiltro]);

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
                resultado: entry?.resultadoMes ?? null,
                // Si el índice es <= al último con carga, es "Real"
                totalReal: idx <= lastMonthIndex ? accumulated : null,
                isReal: idx <= lastMonthIndex,
                comentario: entry?.comentario || "",
                adjunto: entry?.adjunto || null
            };
        });
    }, [selectedObj]);

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
        <div className="min-h-screen bg-[#f8fafc] flex" style={{ zoom: 0.9 }}>
            {/* SIDEBAR DE OBJETIVOS */}
            <aside className="w-80 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shadow-sm z-10">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <LayoutDashboard size={20} />
                        </div>
                        <h2 className="font-bold text-slate-800 tracking-tight">Análisis</h2>
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
                            onClick={() => setSelectedObjId(obj._id)}
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
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actividades/KPIs</p>
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
                        </div>

                        {/* Leyenda personalizada (incluye la referencia de Meta) */}
                        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 mb-4 px-1">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                <span className="w-3 h-3 rounded-[3px] bg-blue-600"></span>
                                Resultado
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                <span className="relative w-5 h-[3px] rounded-full bg-emerald-600">
                                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white"></span>
                                </span>
                                Avance acumulado
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-orange-200"></span>
                                Comentario
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                <svg width="22" height="6" viewBox="0 0 22 6" className="overflow-visible">
                                    <line x1="0" y1="3" x2="22" y2="3" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
                                </svg>
                                Meta {selectedObj?.meta ?? 80}{selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : '%'}
                            </span>
                        </div>

                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={chartData}
                                    margin={{ top: 16, right: 36, left: 0, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                                            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.85}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{fontSize: 12, fill: '#64748b', fontWeight: 600}}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{fontSize: 11, fill: '#94a3b8'}}
                                        unit={selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : '%'}
                                        domain={[0, 'dataMax']}
                                        width={56}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value, name, props) => {
                                            return [value, name];
                                        }}
                                        labelFormatter={(label) => `Mes: ${label}`}
                                        content={(props) => {
                                            if (!props || !props.payload || props.payload.length === 0) return null;
                                            const p = props.payload[0].payload;
                                            return (
                                                <div className="p-3 bg-white rounded-lg shadow-md" style={{ minWidth: 220 }}>
                                                    <div className="text-xs text-slate-500">Mes: <strong>{p.name}</strong></div>
                                                    <div className="mt-1 text-sm font-bold">Resultado: {p.resultado ?? '-'}{selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : ''}</div>
                                                    <div className="mt-1 text-[11px] text-slate-600">Incremento (mes): {p.incremento}%</div>
                                                    <div className="mt-1 text-[11px] text-slate-600">Avance acumulado: <span className="font-bold">{p.totalReal ?? '-'}{selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : '%'}</span></div>
                                                    <div className="mt-1 text-[11px] text-slate-600">Meta objetivo: <span className="font-bold">{selectedObj?.meta ?? '-'}{selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : '%'}</span></div>
                                                    {selectedObj?.comentarioMeta && (
                                                        <div className="mt-1 text-[11px] text-slate-600 italic">Comentario meta: "{selectedObj.comentarioMeta}"</div>
                                                    )}
                                                    {p.comentario && (
                                                        <div className="mt-2 text-[12px] italic text-slate-700">"{p.comentario}"</div>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                    {/* Área degradada bajo el avance acumulado */}
                                    <Area
                                        type="monotone"
                                        dataKey="totalReal"
                                        stroke="none"
                                        fill="url(#colorTotal)"
                                        isAnimationActive={false}
                                        legendType="none"
                                        activeDot={false}
                                    />
                                    {/* Bars: Resultado del mes */}
                                    <Bar dataKey="resultado" barSize={26} fill="url(#colorBar)" name="Resultado" radius={[6, 6, 0, 0]} />

                                    {/* Serie Real (Line - Avance acumulado) */}
                                    <Line
                                        type="monotone"
                                        dataKey="totalReal"
                                        stroke="#059669"
                                        strokeWidth={3}
                                        dot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#059669' }}
                                        activeDot={{ r: 7, strokeWidth: 3, stroke: '#fff', fill: '#059669' }}
                                        name="Avance"
                                    />
                                    {/* Scatter: puntos para comentarios (si existe comentario) */}
                                    <Scatter dataKey="resultado" fill="#f97316" name="Comentario" shape="circle" />
                                    <ReferenceLine
                                        y={selectedObj?.meta ?? 80}
                                        stroke="#ef4444"
                                        strokeDasharray="6 5"
                                        strokeWidth={2}
                                        ifOverflow="extendDomain"
                                        label={{
                                            position: 'right',
                                            value: `Meta ${selectedObj?.meta ?? 80}${selectedObj?.unidadMeta ? ` ${selectedObj.unidadMeta}` : '%'}`,
                                            fill: '#ef4444',
                                            fontSize: 11,
                                            fontWeight: 800,
                                            dy: -8,
                                        }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
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

                        {/* Actividad */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                                <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                                    <FileText size={18} className="text-violet-500" /> Actividad / KPIs
                                </h3>
                                {procesoFiltro && (
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-full pl-3 pr-1 py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Filtrado por:</span>
                                        <span className="text-[11px] font-semibold text-emerald-800 truncate max-w-[180px]" title={procesoFiltro.nombre}>
                                            {procesoFiltro.codigo} · {procesoFiltro.nombre}
                                        </span>
                                        <button
                                            onClick={() => setExpandedProc(null)}
                                            className="text-emerald-700 hover:text-white hover:bg-emerald-600 w-5 h-5 rounded-full flex items-center justify-center transition-colors text-xs font-bold"
                                            title="Quitar filtro"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                {plantillasFiltradas.map(pl => {
                                    const sufijoUnidad = (u) => u === "Porcentual" ? "%" : "";
                                    const metasResumen = (pl.metas || [])
                                        .map((m) => {
                                            const valor = m?.esperado ?? m?.target;
                                            if (valor === null || valor === undefined || valor === "") return null;
                                            return {
                                                nombre: m.nombre,
                                                texto: `${m.operador || ">="} ${valor}${sufijoUnidad(m.unidad)}`.trim(),
                                            };
                                        })
                                        .filter(Boolean);
                                    const metaPreview = metasResumen[0];

                                    return (
                                        <div key={pl._id} className="flex flex-col rounded-xl border border-slate-50 bg-slate-50/30 hover:bg-white hover:border-violet-100 transition-all overflow-hidden">
                                            <button
                                                onClick={() => setExpandedPl(expandedPl === pl._id ? null : pl._id)}
                                                className="w-full flex items-center justify-between p-3 gap-3 text-left"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md ${pl.activo ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {pl.activo ? 'ACTIVA' : 'INACT.'}
                                                    </span>
                                                    <span className="text-sm font-semibold text-slate-700 break-words leading-snug flex-1 min-w-0" title={pl.nombre}>
                                                        {pl.nombre}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {metaPreview ? (
                                                        <span
                                                            className="text-[11px] bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full font-semibold"
                                                            title={metasResumen.length > 1 ? `+${metasResumen.length - 1} meta(s) más` : metaPreview.nombre}
                                                        >
                                                            {metaPreview.texto}
                                                            {metasResumen.length > 1 && (
                                                                <span className="ml-1 text-violet-500/80 font-bold">+{metasResumen.length - 1}</span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400 italic">sin meta</span>
                                                    )}
                                                    <ChevronDown size={14} className={`text-slate-300 transition-transform ${expandedPl === pl._id ? 'rotate-180 text-violet-500' : ''}`} />
                                                </div>
                                            </button>

                                            {expandedPl === pl._id && (
                                                <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 duration-300">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-tight">Descripción de la Actividad / KPI</p>
                                                    <div className="text-xs text-slate-600 leading-relaxed bg-white border border-violet-50 rounded-lg p-3 space-y-3">
                                                        <p className="italic text-slate-500">"{pl.descripcion || "Sin descripción registrada."}"</p>

                                                        {metasResumen.length > 0 && (
                                                            <div>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Metas — qué se espera alcanzar</span>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {metasResumen.map((m, i) => (
                                                                        <span key={i} className="text-[11px] bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full">
                                                                            <span className="font-semibold">{m.nombre}:</span> {m.texto}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-4 border-t border-slate-50 pt-2">
                                                            <div>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase block">Frecuencia</span>
                                                                <span className="font-bold text-slate-600">{pl.frecuencia}</span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase block">Proceso</span>
                                                                <span className="font-bold text-slate-600 truncate block">{pl.proceso || "-"}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {plantillasFiltradas.length === 0 && (
                                    <p className="text-xs text-slate-400 italic text-center py-4">
                                        {procesoFiltro ? "Este proceso no tiene actividades vinculadas." : "Sin actividades vinculadas."}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
