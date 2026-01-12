import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Search, Download, DollarSign, UserCircle2, MessageSquare, TrendingUp, Award, Wallet, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// --- Components ---

// Circular Progress Component
const CircularScore = ({ score, size = 80, strokeWidth = 8, color = "text-emerald-500" }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - ((score || 0) / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90 w-full h-full">
                <circle
                    className="text-slate-200"
                    strokeWidth={strokeWidth}
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={`${color} transition-all duration-1000 ease-out`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className={`text-xl font-black ${color}`}>{score}%</span>
                <span className="text-[9px] uppercase font-bold text-slate-400">Global</span>
            </div>
        </div>
    );
};

export default function ResultadosBono() {
    const [year, setYear] = useState(2025);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedAreas, setExpandedAreas] = useState({});

    useEffect(() => {
        loadResults();
    }, [year]);

    const loadResults = async () => {
        setLoading(true);
        try {
            const data = await api(`/bono/results/${year}`);
            setResults(Array.isArray(data) ? data : []);
            // Auto expand all for better UX initially
            const areas = {};
            (Array.isArray(data) ? data : []).forEach(r => {
                if (r.snapshot?.areaNombre) areas[r.snapshot.areaNombre] = true;
            });
            setExpandedAreas(areas);
        } catch (err) {
            console.error(err);
            toast.error("Error cargando resultados");
        } finally {
            setLoading(false);
        }
    };

    const toggleArea = (areaName) => {
        setExpandedAreas(prev => ({ ...prev, [areaName]: !prev[areaName] }));
    };

    const groupedData = useMemo(() => {
        const groups = {};
        const filtered = results.filter(r => {
            const name = `${r.empleado?.nombre} ${r.empleado?.apellido}`.toLowerCase();
            return name.includes(searchTerm.toLowerCase());
        });

        filtered.forEach(r => {
            const area = r.snapshot?.areaNombre || "Sin Área";
            const sector = r.snapshot?.sectorNombre || "Sin Sector";
            if (!groups[area]) groups[area] = {};
            if (!groups[area][sector]) groups[area][sector] = [];
            groups[area][sector].push(r);
        });
        return groups;
    }, [results, searchTerm]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(val || 0);
    };

    const totalBonos = results.reduce((acc, curr) => acc + (curr.bonoFinal || 0), 0);

    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-8 font-sans text-slate-600">
            <div className="max-w-[1400px] mx-auto space-y-8">

                {/* --- Header Section --- */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Resultados de Bonos</h1>
                            <p className="text-slate-500 mt-1 text-lg">Gestión de performance y compensaciones.</p>
                        </div>
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none text-lg"
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar empleado..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-64 transition-all"
                            />
                        </div>

                        {/* Export */}
                        <button className="bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition-all">
                            <Download size={18} /> <span>Exportar</span>
                        </button>

                        {/* Total Card (Mini) */}
                        <div className="bg-slate-900 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-slate-900/20 flex flex-col items-end">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total a Pagar</div>
                            <div className="text-lg font-black">{formatCurrency(totalBonos)}</div>
                        </div>
                    </div>
                </div>

                {/* --- LEGEND --- */}
                <div className="flex flex-col gap-2 mb-4">
                    <div className="flex flex-wrap gap-4 text-xs items-center bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm w-fit">
                        <span className="font-bold text-slate-400 uppercase tracking-widest mr-2">Referencias:</span>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-slate-600 font-medium">Alcanza Objetivo (Score &ge; Umbral)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                            <span className="text-slate-600 font-medium">No Alcanza (Score &lt; Umbral)</span>
                        </div>
                        <div className="w-px h-4 bg-slate-200 mx-2"></div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-slate-200 text-amber-600 bg-amber-50">Preliminar</Badge>
                            <span className="text-slate-400">Calculado hoy</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-slate-200 text-emerald-600 bg-emerald-50">Final</Badge>
                            <span className="text-slate-400">Cerrado</span>
                        </div>
                    </div>

                    {/* Rules Legend */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl w-fit">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Requisitos Bono:</span>
                        <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                Score Global &ge; Umbral
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                Máx. 3 ausencias injust.
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                Sin sanciones graves
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                Antigüedad válida
                            </span>
                        </div>
                    </div>
                </div>

                {/* --- Content Grid --- */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 opacity-50 space-y-4">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <p className="font-medium animate-pulse">Calculando bonos...</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Object.keys(groupedData).length === 0 && (
                            <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                                <Award className="w-16 h-16 mx-auto text-slate-200 mb-4" />
                                <h3 className="text-lg font-bold text-slate-400">Sin Resultados</h3>
                                <p className="text-slate-400">No se encontraron empleados para el criterio seleccionado.</p>
                            </div>
                        )}

                        {Object.entries(groupedData).map(([areaName, sectors]) => (
                            <div key={areaName} className="space-y-4">
                                {/* Area Header */}
                                <div
                                    onClick={() => toggleArea(areaName)}
                                    className="flex items-center gap-3 cursor-pointer group select-none"
                                >
                                    <div className={`p-1.5 rounded-lg transition-colors ${expandedAreas[areaName] ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                                        {expandedAreas[areaName] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-700">{areaName}</h2>
                                    <Badge className="bg-slate-200 hover:bg-slate-300 text-slate-600 border-0">{Object.values(sectors).reduce((a, b) => a + b.length, 0)}</Badge>
                                    <div className="h-px bg-slate-200 flex-grow mx-4 group-hover:bg-slate-300 transition-colors" />

                                    {/* Area Total */}
                                    <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                                        <span>Total:</span>
                                        <span className="text-slate-900 font-bold">
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
                                                Object.values(sectors).reduce((acc, employees) =>
                                                    acc + employees.reduce((sum, emp) => sum + (emp.bonoFinal || 0), 0)
                                                    , 0)
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Employee Cards Grid */}
                                {expandedAreas[areaName] && (
                                    <div className="grid grid-cols-1 gap-6 pl-2 lg:pl-0">
                                        {Object.entries(sectors).map(([sectorName, employees]) => (
                                            <div key={sectorName} className="space-y-4">
                                                {/* Sector Label */}
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2 border-l-2 border-slate-200 ml-1">
                                                    {sectorName}
                                                </div>

                                                <div className="grid grid-cols-1 gap-4">
                                                    {employees.map(emp => {
                                                        const globalScore = Math.round(emp.resultado?.total || 0);
                                                        // Dynamic Color Logic based on Threshold (Umbral)
                                                        const umbral = emp.bonusConfig?.umbral || 0;
                                                        const meetsThreshold = globalScore >= umbral;
                                                        const scoreColor = meetsThreshold ? "text-emerald-500" : "text-rose-500";
                                                        const stripColor = meetsThreshold ? 'bg-emerald-400' : 'bg-rose-400';
                                                        const badgeColor = meetsThreshold ? 'bg-emerald-500' : 'bg-rose-500';

                                                        const isPrelim = emp.estado === "calculado";

                                                        return (
                                                            <div key={emp._id} className="group bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-blue-100 transition-all duration-300 relative overflow-hidden">

                                                                {/* Status Stripe */}
                                                                <div className={`absolute top-0 left-0 w-1 h-full z-10 ${stripColor}`} />

                                                                <div className="flex flex-col lg:flex-row items-stretch min-h-[100px]">

                                                                    {/* 1. BIO SECTION (Fixed Width) */}
                                                                    <div className="w-full lg:w-[260px] p-4 pl-6 flex items-center gap-3 border-b lg:border-b-0 lg:border-r border-slate-50 shrink-0">
                                                                        <div className="relative shrink-0">
                                                                            <div className="w-12 h-12 rounded-xl bg-slate-50 overflow-hidden shadow-inner ring-2 ring-white">
                                                                                {emp.empleado?.fotoUrl ? (
                                                                                    <img src={(() => {
                                                                                        const url = emp.empleado.fotoUrl;
                                                                                        if (/^https?:\/\//i.test(url)) return url;
                                                                                        const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
                                                                                        return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
                                                                                    })()} alt="" className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                                        <UserCircle2 size={24} />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <h3 className="font-bold text-slate-800 text-sm leading-tight truncate group-hover:text-blue-600 transition-colors">
                                                                                {emp.empleado?.nombre} {emp.empleado?.apellido}
                                                                            </h3>
                                                                            <p className="text-[11px] text-slate-500 font-medium truncate mb-1">{emp.snapshot?.puesto}</p>
                                                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-slate-100 ${isPrelim ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                                                                {isPrelim ? "Preliminar" : "Final"}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    {/* 2. METRICS (Expanded) */}
                                                                    <div className="flex-1 p-3 flex items-center gap-6 border-b lg:border-b-0 lg:border-r border-slate-50/80">
                                                                        <div className="shrink-0 flex flex-col items-center justify-center pl-2">
                                                                            <CircularScore score={globalScore} size={68} strokeWidth={6} color={scoreColor} />
                                                                            {meetsThreshold && <div className="mt-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wide">Aprobado</div>}
                                                                        </div>
                                                                        <div className="flex-1 space-y-3 min-w-0 pr-2">
                                                                            <div>
                                                                                <div className="flex justify-between items-center text-[11px] mb-1">
                                                                                    <span className="text-slate-500 font-medium flex items-center gap-1.5"><TargetIcon className="w-3 h-3 text-blue-400" /> Objetivos</span>
                                                                                    <span className="font-bold text-slate-700">{Math.round(emp.resultado?.objetivos || 0)}%</span>
                                                                                </div>
                                                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${emp.resultado?.objetivos || 0}%` }} />
                                                                                </div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="flex justify-between items-center text-[11px] mb-1">
                                                                                    <span className="text-slate-500 font-medium flex items-center gap-1.5"><StarIcon className="w-3 h-3 text-indigo-400" /> Competencias</span>
                                                                                    <span className="font-bold text-slate-700">{Math.round(emp.resultado?.competencias || 0)}%</span>
                                                                                </div>
                                                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${emp.resultado?.competencias || 0}%` }} />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. CONFIGURATION */}
                                                                    <div className="w-full lg:w-[140px] p-3 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-50/80 bg-slate-50/30">
                                                                        <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-2">Config</span>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                <span className="text-slate-500">Target</span>
                                                                                <span className="font-medium text-slate-700">{emp.bonusConfig?.target || 0}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                <span className="text-slate-500">Umbral</span>
                                                                                <span className="font-medium text-slate-700">{emp.bonusConfig?.umbral}%</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                <span className="text-slate-500">Max</span>
                                                                                <span className="font-medium text-slate-700">{emp.bonusConfig?.max}%</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 4. CONDICIONES / INCIDENCIAS (Narrower) */}
                                                                    <div className="w-full lg:w-[240px] p-3 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-50/80">
                                                                        <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-2 truncate">Condiciones</span>
                                                                        <div className="space-y-1">
                                                                            {emp.condiciones && emp.condiciones.length > 0 ? (
                                                                                <div className="max-h-[80px] overflow-y-auto custom-scrollbar pr-1 space-y-1">
                                                                                    {emp.condiciones.map((c, i) => (
                                                                                        <div key={i} className={`text-[9px] px-1.5 py-1 rounded border flex items-start gap-1 p-1 ${c.impacto === 'ANULA' ? 'bg-rose-50 border-rose-100/60 text-rose-700' : 'bg-amber-50 border-amber-100/60 text-amber-700'}`}>
                                                                                            {c.impacto === 'ANULA' ? <OctagonAlertIcon className="w-2.5 h-2.5 shrink-0 mt-0.5" /> : <TrendingDownIcon className="w-2.5 h-2.5 shrink-0 mt-0.5" />}
                                                                                            <span className="leading-tight" title={c.descripcion}>{c.descripcion}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 italic">
                                                                                    <CheckCircle2 size={12} className="text-emerald-400" />
                                                                                    <span>OK</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* 5. FINANCIERO (Fixed Right) */}
                                                                    <div className="w-full lg:w-[200px] bg-slate-50/50 p-3 flex flex-col justify-center shrink-0">
                                                                        <div className="flex justify-between items-center mb-1">
                                                                            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Base</span>
                                                                            <span className="text-xs font-semibold text-slate-600">{formatCurrency(emp.bonoBase)}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">% Cobro</span>
                                                                            <span className={`text-sm font-black ${scoreColor}`}>{emp.bonoBase ? Math.round((emp.bonoFinal / emp.bonoBase) * 100) : 0}%</span>
                                                                        </div>
                                                                        <div className="h-px bg-slate-200 mb-2" />
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[9px] font-bold uppercase text-slate-400">A Pagar</span>
                                                                            <span className="text-lg font-black text-slate-800 tracking-tight leading-none">
                                                                                {formatCurrency(emp.bonoFinal)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

    );
}

// Simple Icons to avoid more imports if not available
const TargetIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
)
const StarIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
)
const TrendingDownIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
)
const OctagonAlertIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
)
