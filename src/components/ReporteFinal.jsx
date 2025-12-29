import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Download, Trophy, Target, Lightbulb, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell, LabelList
} from 'recharts';

// Colores para gráficos
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const RADAR_COLOR = '#6366f1';
const RADAR_FILL = '#818cf8';

export function ReporteFinal({ isOpen, onClose, data, empleado, anio, scoreGlobal: propScoreGlobal, evolutionData }) {
    if (!isOpen || !data) return null;

    // Extract arrays correctly (Backwards compatibility if it's array or object)
    const objetivosList = Array.isArray(data.objetivos) ? data.objetivos : (data.objetivos?.items || []);
    const aptitudesList = Array.isArray(data.aptitudes) ? data.aptitudes : (data.aptitudes?.items || []);


    // 1. Calcular Datos Globales
    const scoreGlobal = useMemo(() => {
        // Prioridad 1: Prop explicita calculada por el dashboard
        if (propScoreGlobal !== undefined && propScoreGlobal !== null) return propScoreGlobal;

        // Si viene pre-calculado en el objeto "FINAL" (dashboard)
        if (data.scoreGlobal !== undefined) return data.scoreGlobal;

        return data.globalScore || 0;
    }, [data, propScoreGlobal]);

    // 2. Datos para Radar (Objetivos vs Competencias)
    const radarDataObj = useMemo(() => {
        return objetivosList?.map(o => ({
            subject: o.nombre.length > 15 ? o.nombre.substring(0, 15) + '...' : o.nombre,
            A: Math.round(o.progreso ?? 0), // Normalizado al 100% (evita ponderación)
            fullMark: 100
        })) || [];
    }, [objetivosList]);

    const radarDataComp = useMemo(() => {
        return aptitudesList?.map(a => ({
            subject: a.nombre.length > 15 ? a.nombre.substring(0, 15) + '...' : a.nombre,
            // Si la puntuación es > 5, asumimos escala 0-100. Si es <= 5, escala 0-5.
            A: (a.puntuacion ?? 0) > 5 ? Math.round(a.puntuacion ?? 0) : Math.round(((a.puntuacion ?? 0) / 5) * 100),
            fullMark: 100
        })) || [];
    }, [aptitudesList]);

    // 3. Datos para Línea de Tiempo
    const lineData = useMemo(() => {
        // Prioridad: Usar datos de evolución pasados por props (Q1, Q2, Q3, FINAL)
        if (evolutionData && evolutionData.length > 0) {
            return evolutionData.map(d => ({
                name: d.name === 'Fin' ? 'FINAL' : d.name,
                score: Number(d.global).toFixed(1)
            }));
        }

        // Fallback: Calcular a partir de hitos (Legacy)
        const periodoMap = {};
        objetivosList?.forEach(obj => {
            obj.hitos?.forEach(h => {
                if (h.actual !== null) {
                    if (!periodoMap[h.periodo]) periodoMap[h.periodo] = { sum: 0, count: 0, weightedSum: 0, totalWeight: 0 };
                    periodoMap[h.periodo].weightedSum += Math.min(h.actual, obj.permiteOver ? 999 : 100) * (obj.peso || 0);
                    periodoMap[h.periodo].totalWeight += (obj.peso || 0);
                }
            });
        });

        const getPeriodValue = (p) => {
            if (p === 'FINAL') return 999999;
            // Formatos: 2025M1, 2025Q1
            const year = parseInt(p.substring(0, 4)) || 0;
            const type = p.charAt(4); // M or Q
            const num = parseInt(p.substring(5)) || 0;
            let month = 0;
            if (type === 'M') month = num;
            if (type === 'Q') month = num * 3;
            return year * 100 + month;
        }

        return Object.keys(periodoMap)
            .sort((a, b) => getPeriodValue(a) - getPeriodValue(b))
            .map(p => {
                const item = periodoMap[p];
                const val = item.totalWeight > 0 ? (item.weightedSum / item.totalWeight) : 0;
                return { name: p, score: Number(val.toFixed(1)) };
            });
    }, [objetivosList]);

    // 4. Datos Gauge
    const gaugeData = [
        { name: 'Logrado', value: scoreGlobal, fill: scoreGlobal >= 100 ? '#10b981' : (scoreGlobal >= 70 ? '#3b82f6' : '#ef4444') },
        { name: 'Restante', value: Math.max(0, 100 - scoreGlobal), fill: '#e2e8f0' },
    ];

    return createPortal(
        <div id="reporte-final-overlay" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:block print:relative print:inset-auto">
            <style>{`
                @media print {
                    @page { margin: 15mm; size: auto; }
                    /* Ocultar la aplicación principal */
                    #root { display: none !important; }

                    /* Asegurar que el portal sea visible */
                    body {
                        visibility: visible !important;
                        overflow: visible !important;
                        background: white;
                    }

                    #reporte-final-overlay {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        opacity: 1 !important;
                        background: white !important;
                        display: block !important;
                        padding: 0 !important;
                    }
                    
                    /* Reset inner container styles */
                    #reporte-print-content {
                        box-shadow: none !important;
                        border: none !important;
                        width: 100% !important;
                        max-width: none !important;
                    }

                    ::-webkit-scrollbar { display: none; }
                }
            `}</style>

            <div id="reporte-print-content" className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:h-auto print:w-full print:max-w-none">

                {/* HEADER */}
                <div className="bg-slate-900 text-white p-6 flex justify-between items-start print:bg-white print:text-black print:border-b-2 print:border-black">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-500/20 p-3 rounded-xl border border-blue-500/30 print:hidden">
                            <Trophy className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Reporte Final de Desempeño</h2>
                            <div className="flex items-center gap-2 text-slate-400 mt-1 print:text-slate-600">
                                <span className="font-semibold text-white print:text-black">{empleado?.nombre} {empleado?.apellido}</span>
                                <span>•</span>
                                <span>Ciclo {anio}</span>
                                <span>•</span>
                                <Badge variant="outline" className="border-slate-600 text-slate-300 print:border-slate-900 print:text-slate-900">
                                    Cierre Anual
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 print:hidden">
                        <Button variant="outline" size="sm" onClick={() => window.print()} className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white">
                            <Printer className="w-4 h-4 mr-2" /> Imprimir
                        </Button>
                        <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800">
                            <X className="w-6 h-6" />
                        </Button>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-slate-50/50 print:bg-white print:p-0 print:overflow-visible">

                    {/* TOP METRICS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
                        {/* 1. GLOBAL GAUGE */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden print:border print:border-slate-300 h-56">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 absolute top-4 left-4">Score Global</h3>
                            <div className="w-40 h-40 relative flex items-center justify-center">
                                {/* 50% Reference Line (Top Center) */}
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 opacity-50">
                                    <div className="w-0.5 h-2 bg-slate-400 mb-0.5"></div>
                                    <span className="text-[6px] font-bold text-slate-400 uppercase">Min 50%</span>
                                </div>

                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={gaugeData}
                                            cx="50%"
                                            cy="50%"
                                            startAngle={180}
                                            endAngle={0}
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={0}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {gaugeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
                                    <span className={`text-3xl font-black ${scoreGlobal >= 100 ? 'text-emerald-500' : 'text-slate-800'}`}>
                                        {Number(scoreGlobal).toFixed(1)}%
                                    </span>
                                    {scoreGlobal >= 50 ? (
                                        <div className="flex flex-col items-center">
                                            <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded mt-1">Objetivos Logrados</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-slate-400 font-medium uppercase mt-1">Resultado Actual</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. RADARS COMBINED SECTION */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:border print:border-slate-300 flex flex-col gap-2 h-56">
                            {/* Objetivos Radar */}
                            <div className="flex-1 w-full flex items-center">
                                <div className="w-20 text-[9px] uppercase font-bold text-slate-400 leading-tight">Mapa Objetivos</div>
                                <div className="flex-1 h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarDataObj}>
                                            <PolarGrid stroke="#e2e8f0" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 7 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                            <Radar name="Objetivos" dataKey="A" stroke="#3b82f6" fill="#60a5fa" fillOpacity={0.3} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* Competencias Radar */}
                            <div className="flex-1 w-full flex items-center border-t border-slate-100 pt-1">
                                <div className="w-20 text-[9px] uppercase font-bold text-slate-400 leading-tight">Mapa Competencias</div>
                                <div className="flex-1 h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarDataComp}>
                                            <PolarGrid stroke="#e2e8f0" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 7 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                            <Radar name="Competencias" dataKey="A" stroke="#f59e0b" fill="#fbbf24" fillOpacity={0.3} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>


                        {/* 3. LINE - EVOLUTION */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:border print:border-slate-300 h-56">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Evolución Anual
                            </h3>
                            <div className="h-40 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={lineData} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis domain={[0, 120]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 2 }} activeDot={{ r: 4 }}>
                                            <LabelList dataKey="score" position="top" style={{ fontSize: '8px', fill: '#64748b', fontWeight: 'bold' }} offset={8} formatter={(val) => `${val}%`} />
                                        </Line>
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* DETAIL TABLES */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2 mt-4 items-stretch">
                        {/* OBJETIVOS */}
                        <div className="flex flex-col h-full">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b-2 border-slate-100 pb-2 mb-2">
                                <Target className="w-4 h-4 text-blue-500" />
                                Desglose de Objetivos
                            </h3>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm print:border print:border-slate-300 flex-1 flex flex-col">
                                <table className="w-full text-xs text-left flex-1">
                                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[9px] tracking-wider border-b border-slate-100">
                                        <tr>
                                            <th className="px-3 py-2">Objetivo</th>
                                            <th className="px-2 py-2 text-center">Peso</th>
                                            <th className="px-3 py-2 text-right">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {objetivosList?.map(obj => (
                                            <tr key={obj._id} className="hover:bg-slate-50/50">
                                                <td className="px-3 py-1.5 font-medium text-slate-700">
                                                    <div className="line-clamp-2 leading-tight">{obj.nombre}</div>
                                                    {/* Removed description to save space in print compact mode, or show shorter */}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-slate-500 font-mono">{obj.peso}%</td>
                                                <td className={`px-3 py-1.5 text-right font-bold ${obj.progreso >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                    {Number((obj.progreso * (obj.peso || 0)) / 100).toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50/80 font-bold border-t border-slate-200">
                                            <td className="px-3 py-2 text-right" colSpan={2}>PROMEDIO PONDERADO</td>
                                            <td className="px-3 py-2 text-right text-slate-900">
                                                {Number(objetivosList?.reduce((acc, o) => acc + (o.progreso * o.peso) / 100, 0) || 0).toFixed(1)}%
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                {/* Resumen Ponderado Objetivos - Prominent Footer */}
                                <div className="bg-blue-50/50 border-t border-blue-100 p-4 flex justify-between items-center mt-auto relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100/50 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                                    <div className="flex flex-col relative z-10">
                                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Contribución Global</span>
                                        <span className="text-[9px] text-blue-400 font-medium">Peso Máximo: 70%</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1">
                                        <span className="text-3xl font-black text-blue-600 tracking-tight">
                                            {(() => {
                                                const avg = objetivosList?.reduce((acc, o) => acc + (o.progreso * o.peso) / 100, 0) || 0;
                                                const weighted = (avg * 0.7).toFixed(1);
                                                return `${weighted}%`;
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COMPETENCIAS */}
                        <div className="flex flex-col h-full">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b-2 border-slate-100 pb-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-emerald-500" />
                                Desglose de Competencias
                            </h3>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm print:border print:border-slate-300 flex-1 flex flex-col">
                                <table className="w-full text-xs text-left flex-1">
                                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[9px] tracking-wider border-b border-slate-100">
                                        <tr>
                                            <th className="px-3 py-2">Competencia</th>
                                            <th className="px-3 py-2 text-right">Nivel</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {aptitudesList?.map(apt => {
                                            const val = apt.puntuacion ?? 0;
                                            const valNorm = val > 5 ? (val / 20) : val;
                                            return (
                                                <tr key={apt._id} className="hover:bg-slate-50/50">
                                                    <td className="px-3 py-1.5 font-medium text-slate-700">{apt.nombre}</td>
                                                    <td className="px-3 py-1.5 text-right">
                                                        <Badge variant="outline" className={`scale-90 origin-right ${valNorm >= 3.5 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                            {Number(valNorm).toFixed(1)}/5
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {/* Spacer rows if needed to match height? No, standard Flex stretch works better */}
                                        <tr className="bg-slate-50/80 font-bold border-t border-slate-200">
                                            <td className="px-3 py-2 text-right">PROMEDIO</td>
                                            <td className="px-3 py-2 text-right text-slate-900">
                                                {(() => {
                                                    const avg = (aptitudesList?.reduce((acc, a) => acc + (a.puntuacion ?? 0), 0) / (aptitudesList?.length || 1)) || 0;
                                                    const avgNorm = avg > 5 ? (avg / 20) : avg;
                                                    return Number(avgNorm).toFixed(1);
                                                })()}/5
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                {/* Resumen Ponderado Competencias - Prominent Footer */}
                                <div className="bg-emerald-50/50 border-t border-emerald-100 p-4 flex justify-between items-center mt-auto relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-100/50 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                                    <div className="flex flex-col relative z-10">
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Contribución Global</span>
                                        <span className="text-[9px] text-emerald-400 font-medium">Peso Máximo: 30%</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1">
                                        <span className="text-3xl font-black text-emerald-600 tracking-tight">
                                            {(() => {
                                                const avg = (aptitudesList?.reduce((acc, a) => acc + (a.puntuacion ?? 0), 0) / (aptitudesList?.length || 1)) || 0;
                                                const avgNorm = avg > 5 ? (avg / 20) : avg;
                                                const weighted = (avgNorm * 6).toFixed(1);
                                                return `${weighted}%`;
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* FOOTER - ONLY PRINT */}
                    <div className="hidden print:block mt-8 pt-4 border-t border-slate-300 text-center">
                        <p className="text-[9px] text-slate-400">Generado automáticamente por Sistema de Gestión de Desempeño • {new Date().toLocaleDateString()}</p>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
}
