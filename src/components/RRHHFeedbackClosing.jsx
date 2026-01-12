import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { dashEmpleado } from "@/lib/dashboard";
import { calculatePeriodScores } from "@/lib/scoreHelpers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Search, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
    UserCheck, Building2, User, Filter, X, MessageSquare, Star, BarChart3, MoreVertical, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function RRHHFeedbackClosing() {
    const [feedbacks, setFeedbacks] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [areas, setAreas] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [evaluations, setEvaluations] = useState([]); // To show scores
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Dialog State
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogConfig, setDialogConfig] = useState({ type: null, data: null }); // type: 'BULK' | 'SINGLE'
    const [dialogComment, setDialogComment] = useState(""); // For Bulk only, or if we want to edit single
    const [closing, setClosing] = useState(false);

    const [showStats, setShowStats] = useState(false);

    // Expanded states
    const [expandedManagers, setExpandedManagers] = useState(new Set());
    const [expandedRows, setExpandedRows] = useState(new Set()); // For employee rows
    const [openMenuAreaId, setOpenMenuAreaId] = useState(null); // For area bulk actions menu

    const loadData = async () => {
        setLoading(true);
        try {
            const [resFeedbacks, resEmployees, resAreas, resSectors, resEvaluations] = await Promise.all([
                api("/feedbacks/hr/pending"),
                api("/empleados?limit=1000"),
                api("/areas"),
                api("/sectores"),
                api("/evaluaciones/hr/pending") // Fetch evaluations to get scores
            ]);

            // Filter Quarterly Feedbacks
            const quarterly = (Array.isArray(resFeedbacks) ? resFeedbacks : []).filter(f =>
                ["Q1", "Q2", "Q3", "FINAL"].includes(f.periodo)
            );
            setFeedbacks(quarterly);

            // Set Employees
            const empList = Array.isArray(resEmployees) ? resEmployees : (resEmployees.items || []);
            setEmployees(empList);

            // Set Areas & Sectors
            setAreas(Array.isArray(resAreas) ? resAreas : []);
            setSectors(Array.isArray(resSectors) ? resSectors : []);

            // Set Evaluations (normalize)
            const evList = Array.isArray(resEvaluations) ? resEvaluations : (resEvaluations.items || []);
            setEvaluations(evList);

        } catch (e) {
            console.error(e);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // --- GROUPING LOGIC (Hybrid: Structural + Feedback Creator) ---
    const groupedData = useMemo(() => {
        const structure = {}; // { AreaName: { stats, managers: { ManagerName: { stats, employees: [] } } } }

        // Helper to init structure
        const initPath = (areaName, managerName, empId, empData) => {
            if (!structure[areaName]) {
                structure[areaName] = {
                    id: areaName,
                    stats: { total: 0, ack: 0, contest: 0, pending: 0, closed: 0 },
                    managers: {}
                };
            }
            // Unique Manager ID within Area
            const managerKey = `${areaName}-${managerName}`;

            if (!structure[areaName].managers[managerKey]) {
                structure[areaName].managers[managerKey] = {
                    id: managerKey,
                    name: managerName,
                    stats: { total: 0, ack: 0, contest: 0, pending: 0, closed: 0 },
                    employees: {}
                };
            }
            if (!structure[areaName].managers[managerKey].employees[empId]) {
                structure[areaName].managers[managerKey].employees[empId] = {
                    id: empId,
                    data: empData,
                    items: {}, // Map by period for easy access
                    stats: { total: 0, ack: 0, contest: 0, pending: 0, closed: 0 }
                };
            }
            return structure[areaName].managers[managerKey].employees[empId];
        };

        // 1. Map Feedbacks to Employees
        const feedbackMap = {}; // empId -> [feedbacks]
        feedbacks.forEach(f => {
            const empId = f.empleado?._id;
            if (!empId) return;
            if (!feedbackMap[empId]) feedbackMap[empId] = [];
            feedbackMap[empId].push(f);
        });

        // 2. Map Areas and Sectors for quick lookup
        const areaMap = {};
        areas.forEach(a => areaMap[a._id] = a);
        const sectorMap = {};
        sectors.forEach(s => sectorMap[s._id] = s);

        // 3. Iterate ALL Employees
        employees.forEach(emp => {
            // Filter by search
            if (search) {
                const s = search.toLowerCase();
                const fullName = `${emp.nombre} ${emp.apellido}`.toLowerCase();
                if (!fullName.includes(s)) return;
            }

            // Determine Area Name
            let areaName = "Sin Área";
            let areaObj = null;
            if (emp.area) {
                const areaId = typeof emp.area === 'object' ? emp.area._id : emp.area;
                areaObj = areaMap[areaId];
                if (areaObj) areaName = areaObj.nombre;
                else if (typeof emp.area === 'object' && emp.area.nombre) areaName = emp.area.nombre;
            }

            // --- HYBRID MANAGER LOGIC ---
            let managerName = "Sin Referente Asignado";

            // A. Determine Structural Referente (Sector > Area)
            let structuralReferentes = [];

            // Check Sector
            if (emp.sector) {
                const sectorId = typeof emp.sector === 'object' ? emp.sector._id : emp.sector;
                const sectorObj = sectorMap[sectorId];
                if (sectorObj) {
                    if (sectorObj.heredaReferentes === false && sectorObj.referentes?.length > 0) {
                        structuralReferentes = sectorObj.referentes;
                    }
                }
            }
            // If no sector referentes found (or inheriting), check Area
            if (structuralReferentes.length === 0 && areaObj && areaObj.referentes?.length > 0) {
                structuralReferentes = areaObj.referentes;
            }

            // B. Determine Feedback Evaluator (Override)
            const empFeedbacks = feedbackMap[emp._id] || [];
            let feedbackEvaluator = null;
            if (empFeedbacks.length > 0) {
                const fWithManager = empFeedbacks.find(f => f.creadoPor?.nombre);
                if (fWithManager) {
                    feedbackEvaluator = `${fWithManager.creadoPor.nombre} ${fWithManager.creadoPor.apellido || ""}`.trim();
                }
            }

            // C. Final Decision
            if (feedbackEvaluator) {
                managerName = feedbackEvaluator;
            } else if (structuralReferentes.length > 0) {
                managerName = structuralReferentes.map(ref => {
                    if (typeof ref === 'object' && ref.nombre) return `${ref.nombre} ${ref.apellido}`;
                    const r = employees.find(e => e._id === ref || e._id === ref._id);
                    if (r) return `${r.nombre} ${r.apellido}`;
                    return "Referente Desconocido";
                }).join(", ");
            }

            const empNode = initPath(areaName, managerName, emp._id, emp);

            // Add Feedbacks (or placeholders)
            const periods = ["Q1", "Q2", "Q3", "FINAL"];
            periods.forEach(p => {
                const fb = empFeedbacks.find(f => f.periodo === p);
                if (fb) {
                    empNode.items[p] = fb;
                    // Update Stats
                    empNode.stats.total++;
                    if (fb.estado === "CLOSED") empNode.stats.closed++;

                    // Independent check for Agreement/Disagreement
                    if (fb.empleadoAck?.estado === "ACK") empNode.stats.ack++;
                    else if (fb.empleadoAck?.estado === "CONTEST") empNode.stats.contest++;

                    if (fb.estado !== "CLOSED") empNode.stats.pending++;
                } else {
                    // Placeholder
                    empNode.items[p] = {
                        _id: `virtual-${emp._id}-${p}`,
                        periodo: p,
                        isVirtual: true,
                        empleadoAck: null
                    };
                }
            });
        });

        // 4. Aggregate Stats up
        Object.values(structure).forEach(area => {
            Object.values(area.managers).forEach(manager => {
                Object.values(manager.employees).forEach(emp => {
                    manager.stats.total += emp.stats.total;
                    manager.stats.ack += emp.stats.ack;
                    manager.stats.contest += emp.stats.contest;
                    manager.stats.pending += emp.stats.pending;
                    manager.stats.closed += emp.stats.closed;
                });
                area.stats.total += manager.stats.total;
                area.stats.ack += manager.stats.ack;
                area.stats.contest += manager.stats.contest;
                area.stats.pending += manager.stats.pending;
                area.stats.closed += manager.stats.closed;
            });
        });

        return structure;
    }, [employees, feedbacks, areas, sectors, search, evaluations]);

    // --- CHART DATA PREPARATION ---
    const chartData = useMemo(() => {
        const areaData = [];
        const managerData = [];

        Object.values(groupedData).forEach(area => {
            areaData.push({
                name: area.id,
                Acuerdo: area.stats.ack,
                Desacuerdo: area.stats.contest,
                Pendiente: area.stats.pending,
                Cerrado: area.stats.closed
            });

            Object.values(area.managers).forEach(manager => {
                managerData.push({
                    name: manager.name,
                    Acuerdo: manager.stats.ack,
                    Desacuerdo: manager.stats.contest,
                    Pendiente: manager.stats.pending,
                    Cerrado: manager.stats.closed,
                    area: area.id
                });
            });
        });

        // Sort by Disagreement count descending for better visibility of issues
        areaData.sort((a, b) => b.Desacuerdo - a.Desacuerdo);
        managerData.sort((a, b) => b.Desacuerdo - a.Desacuerdo);

        return { areaData, managerData };
    }, [groupedData]);


    // --- DIALOG ACTIONS ---
    const openBulkCloseDialog = (areaId, type) => {
        // Find Area Data
        const area = groupedData[areaId];
        if (!area) return;

        // Collect IDs
        const idsToClose = [];
        Object.values(area.managers).forEach(manager => {
            Object.values(manager.employees).forEach(emp => {
                Object.values(emp.items).forEach(fb => {
                    if (!fb.isVirtual && fb.estado !== "CLOSED") {
                        const ack = fb.empleadoAck?.estado;
                        if (type === "ALL") idsToClose.push(fb._id);
                        else if (type === "ACK" && ack === "ACK") idsToClose.push(fb._id);
                        else if (type === "CONTEST" && ack === "CONTEST") idsToClose.push(fb._id);
                    }
                });
            });
        });

        if (idsToClose.length === 0) {
            toast.info("No hay feedbacks pendientes para cerrar con este criterio.");
            setOpenMenuAreaId(null);
            return;
        }

        setDialogConfig({
            type: 'BULK',
            data: {
                areaId,
                closeType: type,
                ids: idsToClose,
                count: idsToClose.length
            }
        });
        setDialogComment("");
        setDialogOpen(true);
        setOpenMenuAreaId(null);
    };

    const openSingleCloseDialog = (id, comment, empName, period) => {
        setDialogConfig({
            type: 'SINGLE',
            data: { id, comment, empName, period }
        });
        // We don't setDialogComment here because the comment comes from the card
        setDialogOpen(true);
    };

    const handleConfirmClose = async () => {
        setClosing(true);
        try {
            let ids = [];
            let comment = "";

            if (dialogConfig.type === 'BULK') {
                ids = dialogConfig.data.ids;
                comment = dialogComment;
            } else {
                ids = [dialogConfig.data.id];
                comment = dialogConfig.data.comment; // Comment from the card
            }

            await api("/feedbacks/hr/close-bulk", {
                method: "POST",
                body: { ids, comentarioRRHH: comment }
            });

            toast.success(`Operación exitosa. Se cerraron ${ids.length} feedbacks.`);
            loadData();
            setDialogOpen(false);
        } catch (e) {
            console.error(e);
            toast.error("Error al cerrar feedbacks.");
        } finally {
            setClosing(false);
        }
    };


    // --- RENDER HELPERS ---
    const StatusPill = ({ count, type, icon: Icon, color }) => (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-sm ${color}`}>
            <Icon className="w-3.5 h-3.5" />
            <span>{count}</span>
            <span className="hidden sm:inline uppercase ml-1 opacity-80">{type}</span>
        </div>
    );

    const FeedbackCell = ({ feedback, empId }) => {
        if (!feedback) return <div className="w-full h-8 bg-slate-50 rounded border border-slate-100"></div>;

        const isVirtual = feedback.isVirtual;
        const status = isVirtual ? "FUTURE" : feedback.estado; // DRAFT, SENT, PENDING_HR, CLOSED
        const ack = feedback.empleadoAck?.estado;

        // Determine Overdue Status
        const ev = evaluations.find(e => e.empleado?._id === empId && e.periodo === feedback.periodo);
        const deadline = ev?.fechaLimite ? new Date(ev.fechaLimite) : null;
        const isOverdue = deadline && new Date() > deadline && status !== "CLOSED";

        let bg = "bg-slate-50";
        let text = "text-slate-400";
        let border = "border-slate-100";
        let label = "-"; // Default for virtual/future

        if (!isVirtual) {
            if (status === "DRAFT") { bg = "bg-amber-50"; text = "text-amber-600"; border = "border-amber-200"; label = "Borrador"; }
            else if (status === "SENT") { bg = "bg-blue-50"; text = "text-blue-600"; border = "border-blue-200"; label = "Enviado"; }
            else if (status === "PENDING_HR") { bg = "bg-purple-50"; text = "text-purple-600"; border = "border-purple-200"; label = "Pendiente RRHH"; }
            else if (status === "CLOSED") { bg = "bg-slate-100"; text = "text-slate-500"; border = "border-slate-300"; label = "Finalizado"; }

            // Override with ACK status if available AND NOT CLOSED
            if (status !== "CLOSED") {
                if (ack === "ACK") { bg = "bg-emerald-100"; text = "text-emerald-700"; border = "border-emerald-300"; label = "Acuerdo"; }
                else if (ack === "CONTEST") { bg = "bg-rose-100"; text = "text-rose-700"; border = "border-rose-300"; label = "Desacuerdo"; }
            }
        }

        return (
            <div className={`w-full h-9 flex items-center justify-center rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all relative ${bg} ${text} ${border}`}>
                {label}
                {isOverdue && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm" title="Vencido">
                        <Clock className="w-2.5 h-2.5" />
                    </div>
                )}
            </div>
        );
    };

    const ExpandedRow = ({ emp, managerName }) => {
        const periods = ["Q1", "Q2", "Q3", "FINAL"];
        const [dashData, setDashData] = useState(null);

        // Fetch dashboard data for accurate score calculation
        useEffect(() => {
            const loadDash = async () => {
                try {
                    const year = new Date().getFullYear();
                    const res = await dashEmpleado(emp.id, year);
                    setDashData(res);
                } catch (e) {
                    console.error("Error loading dash data for scores", e);
                }
            };
            loadDash();
        }, [emp.id]);

        return (
            <div className="p-4 bg-slate-50/50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                {periods.map(p => {
                    const fb = emp.items[p];
                    if (!fb || fb.isVirtual) return null;

                    // Find associated evaluation for context
                    const ev = evaluations.find(e => e.empleado?._id === emp.id && e.periodo?.includes(p));

                    // Calcular puntajes usando la lógica exacta de MiDesempeno (scoreHelpers)
                    const { obj, comp, global } = calculatePeriodScores(dashData, p);

                    // Nombre del Evaluador (Preferir nombre del empleado)
                    let evaluatorName = "Desconocido";
                    if (fb.creadoPor) {
                        if (fb.creadoPor.empleado && fb.creadoPor.empleado.nombre) {
                            evaluatorName = `${fb.creadoPor.empleado.nombre} ${fb.creadoPor.empleado.apellido || ""}`;
                        } else if (fb.creadoPor.nombre) {
                            evaluatorName = `${fb.creadoPor.nombre} ${fb.creadoPor.apellido || ""}`;
                        }
                    }

                    return (
                        <FeedbackCard
                            key={p}
                            fb={fb}
                            ev={ev}
                            globalScore={global}
                            objScore={obj}
                            compScore={comp}
                            evaluatorName={evaluatorName}
                            empName={`${emp.data.nombre} ${emp.data.apellido}`}
                            period={p}
                            onClose={openSingleCloseDialog}
                        />
                    );
                })}
                {Object.values(emp.items).every(i => i.isVirtual) && (
                    <div className="col-span-4 text-center py-4 text-slate-400 italic text-sm">
                        No hay feedbacks iniciados para este empleado.
                    </div>
                )}
            </div>
        );
    };

    // Sub-component for individual card to manage local comment state
    const FeedbackCard = ({ fb, ev, globalScore, objScore, compScore, evaluatorName, empName, period, onClose }) => {
        const [comment, setComment] = useState("");

        // Determine border color based on ACK status
        let borderColor = "border-slate-200";
        let statusBadge = null;

        if (fb.empleadoAck?.estado === "ACK") {
            borderColor = "border-emerald-200";
            statusBadge = <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 text-[10px] px-1.5 py-0">Acuerdo</Badge>;
        } else if (fb.empleadoAck?.estado === "CONTEST") {
            borderColor = "border-rose-200";
            statusBadge = <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 text-[10px] px-1.5 py-0">Desacuerdo</Badge>;
        }

        return (
            <div className={`bg-white p-4 rounded-xl border shadow-sm space-y-3 flex flex-col h-full ${borderColor}`}>
                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-bold">{period}</Badge>
                        {statusBadge}
                    </div>
                    <span className="text-[10px] text-slate-400">{fb.fechaRealizacion ? new Date(fb.fechaRealizacion).toLocaleDateString() : "Sin fecha"}</span>
                </div>

                {/* SCORES */}
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Global</div>
                        <div className="text-lg font-bold text-indigo-600">{globalScore}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Obj</div>
                        <div className="text-lg font-bold text-slate-700">{objScore}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Comp</div>
                        <div className="text-lg font-bold text-slate-700">{compScore}</div>
                    </div>
                </div>

                {/* COMMENTS */}
                <div className="space-y-3 text-xs flex-1">
                    <div>
                        <span className="font-bold text-slate-700 block mb-1">Evaluador ({evaluatorName}):</span>
                        <p className="p-2 bg-slate-50 rounded text-slate-600 italic border border-slate-100">
                            {fb.comentario || "Sin comentario"}
                        </p>
                    </div>
                    <div>
                        <span className="font-bold text-slate-700 block mb-1">Empleado:</span>
                        <p className="p-2 bg-slate-50 rounded text-slate-600 italic border border-slate-100">
                            {fb.comentarioEmpleado || "Sin comentario"}
                        </p>
                    </div>

                    {/* HR COMMENT INPUT */}
                    {fb.estado !== "CLOSED" && (
                        <div>
                            <span className="font-bold text-indigo-700 block mb-1">Comentario RRHH:</span>
                            <Textarea
                                placeholder="Escribe un comentario de cierre..."
                                className="text-xs min-h-[60px] resize-none bg-indigo-50/30 border-indigo-100 focus:border-indigo-300"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            />
                        </div>
                    )}
                    {fb.estado === "CLOSED" && fb.comentarioRRHH && (
                        <div>
                            <span className="font-bold text-indigo-700 block mb-1">Comentario RRHH:</span>
                            <p className="p-2 bg-indigo-50 rounded text-indigo-700 italic border border-indigo-100">
                                {fb.comentarioRRHH}
                            </p>
                        </div>
                    )}
                </div>

                {/* ACTION */}
                {fb.estado !== "CLOSED" && (
                    <div className="pt-2 mt-auto">
                        <Button
                            size="sm"
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs shadow-md shadow-indigo-200"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(fb._id, comment, empName, period);
                            }}
                        >
                            Cerrar Feedback
                        </Button>
                    </div>
                )}
            </div>
        );
    };

    // Calculate Global Overdue Count
    const overdueCount = useMemo(() => {
        let count = 0;
        feedbacks.forEach(fb => {
            if (fb.estado !== "CLOSED" && !fb.isVirtual) {
                const ev = evaluations.find(e => e.empleado?._id === fb.empleado?._id && e.periodo === fb.periodo);
                const deadline = ev?.fechaLimite ? new Date(ev.fechaLimite) : null;
                if (deadline && new Date() > deadline) {
                    count++;
                }
            }
        });
        return count;
    }, [feedbacks, evaluations]);

    return (
        <div className="space-y-8 pb-32 font-sans text-slate-600">
            {/* ALERT BANNER FOR OVERDUE */}
            {overdueCount > 0 && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 shadow-sm"
                >
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <span className="font-bold">¡Atención!</span> Hay <span className="font-bold">{overdueCount}</span> feedbacks vencidos que requieren cierre inmediato por parte de RRHH.
                    </div>
                </motion.div>
            )}

            {/* Header Controls */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-white/20 sticky top-4 z-40 space-y-4"
            >
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:w-96 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        <Input
                            placeholder="Buscar empleado..."
                            className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all rounded-xl"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            onClick={() => setShowStats(!showStats)}
                            className={`gap-2 ${showStats ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : ''}`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Estadísticas
                        </Button>
                    </div>
                </div>

                {/* STATS CHARTS */}
                <AnimatePresence>
                    {showStats && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                                {/* CHART 1: BY AREA */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-indigo-500" />
                                        Acuerdos por Área
                                    </h3>
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData.areaData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                                <XAxis type="number" />
                                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                    cursor={{ fill: 'transparent' }}
                                                />
                                                <Legend />
                                                <Bar dataKey="Acuerdo" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                                                <Bar dataKey="Desacuerdo" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* CHART 2: BY MANAGER */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <User className="w-4 h-4 text-indigo-500" />
                                        Acuerdos por Evaluador (Top Desacuerdos)
                                    </h3>
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData.managerData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                                <XAxis type="number" />
                                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                    cursor={{ fill: 'transparent' }}
                                                />
                                                <Legend />
                                                <Bar dataKey="Acuerdo" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                                                <Bar dataKey="Desacuerdo" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* DATA LIST */}
            <div className="space-y-10 px-1">
                {Object.values(groupedData).map(area => (
                    <motion.div
                        key={area.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        {/* AREA HEADER */}
                        <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60 relative">
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{area.id}</h2>
                            <div className="flex gap-2 ml-auto items-center">
                                <StatusPill count={area.stats.ack} type="Acuerdo" icon={CheckCircle} color="bg-emerald-50 text-emerald-700 border-emerald-200" />
                                <StatusPill count={area.stats.contest} type="Desacuerdo" icon={AlertCircle} color="bg-rose-50 text-rose-700 border-rose-200" />
                                <Badge variant="secondary" className="ml-2 bg-slate-100 text-slate-600 hover:bg-slate-200">{area.stats.total} Total</Badge>

                                {/* BULK ACTIONS MENU */}
                                <div className="relative ml-4">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 rounded-full hover:bg-slate-100"
                                        onClick={() => setOpenMenuAreaId(openMenuAreaId === area.id ? null : area.id)}
                                    >
                                        <MoreVertical className="w-4 h-4 text-slate-500" />
                                    </Button>

                                    {openMenuAreaId === area.id && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                            <div className="p-2 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-50">
                                                Acciones Masivas
                                            </div>
                                            <div className="p-1">
                                                <button
                                                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors flex items-center gap-2"
                                                    onClick={() => openBulkCloseDialog(area.id, "ALL")}
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Cerrar Todos
                                                </button>
                                                <button
                                                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-colors flex items-center gap-2"
                                                    onClick={() => openBulkCloseDialog(area.id, "ACK")}
                                                >
                                                    <UserCheck className="w-4 h-4" />
                                                    Cerrar Acuerdos
                                                </button>
                                                <button
                                                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors flex items-center gap-2"
                                                    onClick={() => openBulkCloseDialog(area.id, "CONTEST")}
                                                >
                                                    <AlertCircle className="w-4 h-4" />
                                                    Cerrar Desacuerdos
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* MANAGERS */}
                        <div className="pl-0 md:pl-6 space-y-6">
                            {Object.values(area.managers).map(manager => (
                                <div key={manager.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                    {/* MANAGER HEADER */}
                                    <div
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none bg-slate-50/30"
                                        onClick={() => {
                                            const next = new Set(expandedManagers);
                                            if (next.has(manager.id)) next.delete(manager.id);
                                            else next.add(manager.id);
                                            setExpandedManagers(next);
                                        }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                {manager.name[0]}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800">{manager.name}</div>
                                                <div className="text-xs text-slate-400 font-medium">Jefe / Evaluador</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-full bg-slate-100 text-slate-500 transition-transform duration-300 ${expandedManagers.has(manager.id) ? 'rotate-180' : ''}`}>
                                                <ChevronDown className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* EMPLOYEES TABLE-LIKE GRID */}
                                    <AnimatePresence>
                                        {expandedManagers.has(manager.id) && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-slate-100"
                                            >
                                                {/* HEADER ROW */}
                                                <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100">
                                                    <div className="col-span-4 pl-2">Empleado</div>
                                                    <div className="col-span-2 text-center">Q1</div>
                                                    <div className="col-span-2 text-center">Q2</div>
                                                    <div className="col-span-2 text-center">Q3</div>
                                                    <div className="col-span-2 text-center">Final</div>
                                                </div>

                                                {/* ROWS */}
                                                <div className="divide-y divide-slate-100">
                                                    {Object.values(manager.employees).map(emp => (
                                                        <div key={emp.id} className="group">
                                                            <div
                                                                className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-slate-50 transition-colors cursor-pointer"
                                                                onClick={() => {
                                                                    const next = new Set(expandedRows);
                                                                    if (next.has(emp.id)) next.delete(emp.id);
                                                                    else next.add(emp.id);
                                                                    setExpandedRows(next);
                                                                }}
                                                            >
                                                                {/* Employee Info */}
                                                                <div className="col-span-4 flex items-center gap-3 pl-2">
                                                                    <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                                                                        {emp.data.fotoUrl ? (
                                                                            <img src={emp.data.fotoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                                                                                {emp.data.nombre?.[0]}{emp.data.apellido?.[0]}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="font-bold text-slate-700 text-sm truncate group-hover:text-indigo-600 transition-colors">
                                                                            {emp.data.apellido}, {emp.data.nombre}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Quarters */}
                                                                <div className="col-span-2 px-1"><FeedbackCell feedback={emp.items["Q1"]} empId={emp.id} /></div>
                                                                <div className="col-span-2 px-1"><FeedbackCell feedback={emp.items["Q2"]} empId={emp.id} /></div>
                                                                <div className="col-span-2 px-1"><FeedbackCell feedback={emp.items["Q3"]} empId={emp.id} /></div>
                                                                <div className="col-span-2 px-1"><FeedbackCell feedback={emp.items["FINAL"]} empId={emp.id} /></div>
                                                            </div>

                                                            {/* EXPANDED DETAILS */}
                                                            <AnimatePresence>
                                                                {expandedRows.has(emp.id) && (
                                                                    <motion.div
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <ExpandedRow emp={emp} managerName={manager.name} />
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                ))}

                {Object.keys(groupedData).length === 0 && !loading && (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">No se encontraron empleados</h3>
                    </div>
                )}
            </div>

            {/* CONFIRMATION DIALOG */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {dialogConfig.type === 'BULK' ? 'Cierre Masivo de Feedbacks' : 'Cerrar Feedback'}
                        </DialogTitle>
                        <DialogDescription>
                            {dialogConfig.type === 'BULK'
                                ? `Se cerrarán ${dialogConfig.data?.count} feedbacks en ${dialogConfig.data?.areaId}. Esta acción no se puede deshacer.`
                                : `¿Estás seguro de cerrar el feedback de ${dialogConfig.data?.empName} para el periodo ${dialogConfig.data?.period}?`
                            }
                        </DialogDescription>
                    </DialogHeader>

                    {/* Input for Bulk Close */}
                    {dialogConfig.type === 'BULK' && (
                        <div className="space-y-2 py-2">
                            <label className="text-sm font-bold text-slate-700">Comentario de RRHH (Opcional)</label>
                            <Textarea
                                placeholder="Escribe un comentario para todos los feedbacks cerrados..."
                                value={dialogComment}
                                onChange={(e) => setDialogComment(e.target.value)}
                                className="resize-none"
                            />
                        </div>
                    )}

                    {/* Confirmation for Single Close (Comment is already in data) */}
                    {dialogConfig.type === 'SINGLE' && dialogConfig.data?.comment && (
                        <div className="py-2">
                            <p className="text-xs text-slate-500 italic">
                                Comentario a guardar: "{dialogConfig.data.comment}"
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={handleConfirmClose}
                            disabled={closing}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {closing ? "Cerrando..." : "Confirmar Cierre"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
