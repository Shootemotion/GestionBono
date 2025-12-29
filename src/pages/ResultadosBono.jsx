import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { ChevronDown, ChevronRight, Search, Download, DollarSign, UserCircle2, MessageSquare, TrendingUp, Award, Wallet } from "lucide-react";
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
    const [year, setYear] = useState(new Date().getFullYear());
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
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Resultados de Bonos {year}</h1>
                        <p className="text-slate-500 mt-1 text-lg">Gestión de performance y compensaciones.</p>
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
                <div className="flex flex-wrap gap-4 text-xs items-center bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm w-fit mb-4">
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
                                    <div className="h-px bg-slate-200 flex-grow ml-4 group-hover:bg-slate-300 transition-colors" />
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
                                                            <div key={emp._id} className="group bg-white rounded-2xl p-0 border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:border-blue-100 transition-all duration-300 relative overflow-hidden">

                                                                {/* Status Stripe */}
                                                                <div className={`absolute top-0 left-0 w-1.5 h-full z-10 ${stripColor}`} />

                                                                {/* GRID LAYOUT: Strict alignment */}
                                                                <div className="grid grid-cols-1 md:grid-cols-[3fr_3fr_2fr_2fr] lg:grid-cols-[280px_1fr_200px_220px] items-stretch">

                                                                    {/* 1. Bio Section */}
                                                                    <div className="p-5 pl-7 flex items-center gap-4 relative">
                                                                        <div className="relative shrink-0">
                                                                            <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden shadow-inner ring-4 ring-white">
                                                                                {emp.empleado?.fotoUrl ? (
                                                                                    <img src={emp.empleado.fotoUrl} alt="" className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                                        <UserCircle2 size={28} />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${badgeColor}`}>
                                                                                {meetsThreshold ? <Award size={10} className="text-white" /> : <ChevronDown size={12} className="text-white" />}
                                                                            </div>
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <h3 className="font-bold text-slate-800 text-lg leading-tight group-hover:text-blue-600 transition-colors truncate">
                                                                                {emp.empleado?.nombre} {emp.empleado?.apellido}
                                                                            </h3>
                                                                            <p className="text-sm text-slate-500 font-medium truncate">{emp.snapshot?.puesto}</p>
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 border-slate-200 ${isPrelim ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                                                                    {isPrelim ? "Preliminar" : "Final"}
                                                                                </Badge>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 2. Performance Metrics */}
                                                                    <div className="p-5 flex items-center gap-5 border-t md:border-t-0 md:border-l border-slate-100 border-dashed bg-slate-50/30">
                                                                        <div className="shrink-0">
                                                                            <CircularScore score={globalScore} size={64} strokeWidth={6} color={scoreColor} />
                                                                        </div>
                                                                        <div className="space-y-2 flex-1 min-w-0">
                                                                            <div className="flex justify-between items-center text-xs">
                                                                                <span className="text-slate-500 font-medium flex items-center gap-1"><TargetIcon className="w-3 h-3" /> Obj.</span>
                                                                                <span className="font-bold text-slate-700">{Math.round(emp.resultado?.objetivos || 0)}%</span>
                                                                            </div>
                                                                            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${emp.resultado?.objetivos || 0}%` }} />
                                                                            </div>

                                                                            <div className="flex justify-between items-center text-xs pt-1">
                                                                                <span className="text-slate-500 font-medium flex items-center gap-1"><StarIcon className="w-3 h-3" /> Comp.</span>
                                                                                <span className="font-bold text-slate-700">{Math.round(emp.resultado?.competencias || 0)}%</span>
                                                                            </div>
                                                                            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${emp.resultado?.competencias || 0}%` }} />
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. Configuration */}
                                                                    <div className="p-5 flex flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-slate-100 border-dashed">
                                                                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Configuración</span>

                                                                        <div className="flex items-center gap-2 text-slate-700 font-medium text-xs truncate">
                                                                            <Wallet size={14} className="text-blue-500 shrink-0" />
                                                                            <span>Target: {emp.bonusConfig?.target || 0} Sueldos</span>
                                                                        </div>

                                                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500">
                                                                            <div className="flex items-center gap-1 truncate" title="Umbral Mínimo">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                                                <span>Umb: {emp.bonusConfig?.umbral}%</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 truncate" title="Pago Mínimo">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                                                <span>Min: {emp.bonusConfig?.min}%</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 col-span-2 truncate" title="Tope Máximo">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                                                <span>Max: {emp.bonusConfig?.max}%</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>



                                                                    {/* 4. Financial Receipt */}
                                                                    <div className="p-5 bg-slate-50/80 border-t md:border-t-0 md:border-l border-slate-200/60 backdrop-blur-sm flex flex-col justify-center">
                                                                        <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                                                                            <span>Sueldo Base</span>
                                                                            <span>{formatCurrency(emp.bonoBase)}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-2">
                                                                            <span>Multiplicador</span>
                                                                            <span className={scoreColor}>x {emp.bonoBase ? Math.round((emp.bonoFinal / emp.bonoBase) * 100) : 0}%</span>
                                                                        </div>
                                                                        <div className="h-px bg-slate-200 mb-2" />

                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] font-bold uppercase text-slate-400">Total a Pagar</span>
                                                                            <span className="text-2xl font-black text-slate-800 tracking-tight">
                                                                                {formatCurrency(emp.bonoFinal)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* Actions (Absolute Top Right of Card) */}
                                                                {/* Actions (Absolute Top Right of Card) - Removed Button */}
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
