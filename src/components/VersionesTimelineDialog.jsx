import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/lib/api";
import { Target, Lightbulb, Clock, History, AlertCircle } from "lucide-react";

export default function VersionesTimelineDialog({ open, onOpenChange, year, lineageRootId = null }) {
    const [plantillas, setPlantillas] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && year) {
            setLoading(true);
            // Traer TODAS las plantillas del año, sin importar estado (activas/inactivas/pendientes)
            api(`/templates?year=${year}&tipoFiltro=todos`)
                .then(res => {
                    const arr = Array.isArray(res) ? res : (res?.items || res?.data || []);
                    setPlantillas(arr);
                })
                .catch(e => console.error("Error loading templates timeline", e))
                .finally(() => setLoading(false));
        } else {
            setPlantillas([]);
        }
    }, [open, year]);

    const lineages = useMemo(() => {
        if (!plantillas || plantillas.length === 0) return [];

        const pMap = new Map(plantillas.map(p => [String(p._id), p]));

        // Raíces: plantillas que no tienen parent, o cuyo parent no está en el listado
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

            // Si pediste un linaje puntual, mostrarlo aunque tenga sólo 1 versión
            if (lineageRootId) {
                if (String(root._id) === String(lineageRootId)) {
                    result.push({ root, chain });
                }
            } else if (chain.length > 1) {
                // Vista global: sólo linajes con >1 versión
                result.push({ root, chain });
            }
        });

        result.sort((a, b) => {
            const lastA = new Date(a.chain[a.chain.length - 1].updatedAt || 0);
            const lastB = new Date(b.chain[b.chain.length - 1].updatedAt || 0);
            return lastB - lastA;
        });

        return result;

    }, [plantillas, lineageRootId]);

    const getStatusBadge = (p) => {
        if (p.activo && p.estadoAprobacion !== "pendiente") return <Badge className="bg-emerald-100/80 text-emerald-800 border-emerald-200 uppercase text-[9px] px-1.5 py-0">Activa</Badge>;
        if (p.estadoAprobacion === "pendiente") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase text-[9px] px-1.5 py-0 animate-pulse">Pendiente</Badge>;
        if (p.estadoAprobacion === "rechazada") return <Badge className="bg-rose-100 text-rose-800 border-rose-200 uppercase text-[9px] px-1.5 py-0">Rechazada</Badge>;
        return <Badge className="bg-slate-100 text-slate-500 border-slate-200 uppercase text-[9px] px-1.5 py-0">Histórica</Badge>;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-slate-50/50 p-0 border-0 shadow-2xl overflow-hidden flex flex-col">
                <DialogHeader className="px-6 py-5 bg-white border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                            <History className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-slate-800 tracking-tight">
                                {lineageRootId ? "Historial de versiones" : `Línea de Versiones ${year}`}
                            </DialogTitle>
                            <DialogDescription className="text-sm mt-0.5 text-slate-500">
                                {lineageRootId
                                    ? "Recorrido completo de cambios para esta plantilla."
                                    : "Cronograma histórico de objetivos que han sufrido modificaciones profundas durante el año."}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-[#f5f9fc]">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center py-20 text-slate-400 gap-3">
                            <Clock className="w-8 h-8 animate-spin opacity-50" />
                            <p className="text-sm font-medium">Reconstruyendo línea de tiempo...</p>
                        </div>
                    ) : lineages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white bg-opacity-60">
                            <Target className="w-10 h-10 mb-4 opacity-30 text-slate-400" />
                            <h3 className="text-lg font-bold text-slate-700">Sin historial de reversiones</h3>
                            <p className="max-w-md mt-2 text-sm text-slate-500">
                                {lineageRootId
                                    ? "Esta plantilla aún no tiene versiones anteriores."
                                    : "Aún no se han creado o modificado versiones para los objetivos de este año."}
                            </p>
                        </div>
                    ) : (
                        lineages.map((lineage, idx) => (
                            <div key={idx} className="bg-white border text-left border-slate-200 shadow-sm rounded-xl overflow-hidden group">
                                {/* Header de la Familia */}
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="font-bold text-slate-800 text-[15px] leading-tight flex items-center gap-2">
                                        {lineage.root.tipo === 'objetivo' ? <Target className="w-4 h-4 text-blue-500" /> : <Lightbulb className="w-4 h-4 text-indigo-500" />}
                                        {lineage.root.nombre}
                                    </h3>
                                    <div className="text-[11px] text-slate-400 mt-1 flex gap-3 font-semibold tracking-wide uppercase">
                                        <span>{lineage.root.proceso || 'Sin Proceso'}</span>
                                        <span className="opacity-50">•</span>
                                        <span>{lineage.root.frecuencia || 'Sin Frecuencia'}</span>
                                        <span className="opacity-50">•</span>
                                        <span className="text-slate-500">{lineage.chain.length} VERSIONES</span>
                                    </div>
                                </div>

                                {/* Línea Vertical Interna */}
                                <div className="p-6 relative">
                                    {/* Connector bar */}
                                    <div className="absolute top-8 bottom-8 left-[39px] w-[3px] bg-slate-100 rounded-full z-0"></div>

                                    <div className="space-y-8">
                                        {lineage.chain.map((p, i) => {
                                            const isPending = p.estadoAprobacion === 'pendiente';
                                            const isRoot = i === 0;

                                            return (
                                                <div key={p._id} className="relative z-10 flex gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                                                    {/* Date / Point Layout */}
                                                    <div className="flex flex-col items-center shrink-0 w-[40px] pt-1.5">
                                                        <div className={`w-3.5 h-3.5 rounded-full ring-4 shadow-sm z-10 transition-colors
                                                    ${p.activo ? 'bg-emerald-500 ring-emerald-100' :
                                                                isPending ? 'bg-amber-400 ring-amber-100' :
                                                                    'bg-slate-300 ring-white'}
                                                `}></div>
                                                    </div>

                                                    {/* Card Content */}
                                                    <div className={`flex-1 rounded-xl border p-4 transition-all duration-300 
                                                ${isPending ? 'border-amber-200 bg-amber-50/30 hover:shadow-md' : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'}
                                                ${p.activo && !isPending ? 'ring-1 ring-emerald-50 border-emerald-100' : ''}
                                            `}>
                                                        <div className="flex justify-between items-start mb-3 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`text-lg font-black ${isPending ? 'text-amber-700' : 'text-slate-800'}`}>v{p.version || 1}</span>
                                                                    {getStatusBadge(p)}
                                                                    {isRoot && <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase border-slate-200 text-slate-500">Origen</Badge>}
                                                                </div>
                                                                <span className="text-xs font-medium text-slate-400">
                                                                    Modificado: {p.updatedAt ? format(new Date(p.updatedAt), "dd MMM yyyy, HH:mm", { locale: es }) : 'N/A'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Motivo Block */}
                                                        {(p.motivoVersion || p.comentarioVersion) && (
                                                            <div className={`mt-3 mb-4 text-sm p-3 rounded-lg border 
                                                        ${isPending ? 'bg-amber-100/50 border-amber-200 text-amber-900' : 'bg-slate-50/80 border-slate-200/60 text-slate-700'}
                                                    `}>
                                                                {p.motivoVersion && (
                                                                    <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase mb-1 opacity-80">
                                                                        <AlertCircle className="w-3.5 h-3.5" /> Motivo: {p.motivoVersion}
                                                                    </div>
                                                                )}
                                                                {p.comentarioVersion && (
                                                                    <div className="text-xs font-medium pl-[20px] italic">
                                                                        "{p.comentarioVersion}"
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Mini Metas */}
                                                        <div className="mt-3">
                                                            <div className="flex flex-wrap gap-2">
                                                                {p.metas?.map(m => (
                                                                    <div key={m._id || m.nombre} className="text-[10px] font-bold tracking-wide uppercase bg-slate-100/80 border border-slate-200 text-slate-600 px-2 py-1 rounded-md flex items-center gap-1.5">
                                                                        <span>{m.nombre}</span>
                                                                        <span className="text-slate-400 font-mono font-medium lowercase">
                                                                            {m.operador} {m.target || m.esperado}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
