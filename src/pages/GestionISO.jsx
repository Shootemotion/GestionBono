// src/pages/GestionISO.jsx
// Página de gestión de Objetivos ISO 9000, Procesos y Plantillas.
// 3 columnas: Objetivos → Procesos → Plantillas (filtrado encadenado).
// Los procesos son documentos en BD (ProcesoISO). Al crear uno acá,
// aparece en el select de Proceso de las Plantillas automáticamente.
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal.jsx";
import FormularioObjetivoISO from "@/components/FormularioObjetivoISO.jsx";
import FormularioProceso from "@/components/FormularioProceso.jsx";
import { Button } from "@/components/ui/button";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Info, UserCheck } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────
function fiscalLabel(y) {
    return `${y}–${y + 1}`;
}

export default function GestionISO() {
    const { user } = useAuth();

    // ─── estado núcleo ────────────────────────────────────────────────────────
    const [objetivos, setObjetivos] = useState([]);
    const [procesos, setProcesos] = useState([]);
    const [plantillas, setPlantillas] = useState([]);
    const [loading, setLoading] = useState(true);

    // ─── año fiscal ───────────────────────────────────────────────────────────
    const [year, setYear] = useState(getCurrentFiscalYear());

    // ─── selección / filtros ──────────────────────────────────────────────────
    const [selectedObjId, setSelectedObjId] = useState(null);
    const [selectedProcId, setSelectedProcId] = useState(null);

    // ─── modales ──────────────────────────────────────────────────────────────
    const [modalObj, setModalObj] = useState({ open: false, data: null });
    const [modalProc, setModalProc] = useState({ open: false, data: null });

    // ─── permisos ─────────────────────────────────────────────────────────────
    const userRole = String(user?.rol || "").toLowerCase();
    const canEdit =
        user?.isSuper || user?.isRRHH ||
        userRole === "rrhh" || userRole === "directivo" || userRole === "superadmin";

    // ─── carga inicial ───────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [obs, procs] = await Promise.all([
                api(`/objetivos-iso?year=${year}`),
                api(`/procesos-iso?year=${year}`),
            ]);
            setObjetivos(Array.isArray(obs) ? obs : []);
            setProcesos(Array.isArray(procs) ? procs : []);
        } catch {
            toast.error("No se pudieron cargar los datos.");
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Fetch de plantillas cuando cambia el año
    useEffect(() => {
        (async () => {
            try {
                const resp = await api(`/templates?year=${year}&all=true`);
                const arr = Array.isArray(resp) ? resp
                    : Array.isArray(resp?.items) ? resp.items
                        : Array.isArray(resp?.data) ? resp.data
                            : Array.isArray(resp?.docs) ? resp.docs : [];
                setPlantillas(arr);
            } catch {
                setPlantillas([]);
            }
        })();
    }, [year]);

    // Seed automático: si no hay procesos en BD para este año, crear los P01–P15
    useEffect(() => {
        if (!loading && procesos.length === 0) {
            api("/procesos-iso/seed", { method: "POST", body: { year } })
                .then(() => api(`/procesos-iso?year=${year}`))
                .then((data) => { if (Array.isArray(data)) setProcesos(data); })
                .catch(() => { });
        }
    }, [loading, procesos.length, year]);

    // ─── computed ─────────────────────────────────────────────────────────────
    // Procesos filtrados por objetivo seleccionado
    const procesosView = useMemo(() => {
        if (!selectedObjId) return procesos;
        return procesos.filter((p) => {
            const ref = p.objetivoISOId;
            const id = typeof ref === "object" ? ref?._id : ref;
            return String(id) === selectedObjId;
        });
    }, [procesos, selectedObjId]);

    // Plantillas filtradas por proceso seleccionado (o por todos los del objetivo)
    const plantillasView = useMemo(() => {
        // Solo objetivos (KPI/indicadores) — las aptitudes no pertenecen a procesos ISO
        const soloObjetivos = plantillas.filter((pl) => pl.tipo === "objetivo");

        if (selectedProcId) {
            const proc = procesos.find((p) => String(p._id) === selectedProcId);
            if (!proc) return [];
            return soloObjetivos.filter((pl) => pl.proceso?.trim() === proc.fullName?.trim());
        }
        if (selectedObjId) {
            const procesosDelObj = procesosView.map((p) => p.fullName?.trim()).filter(Boolean);
            return soloObjetivos.filter((pl) => procesosDelObj.includes(pl.proceso?.trim()));
        }
        return soloObjetivos;
    }, [plantillas, selectedProcId, selectedObjId, procesosView, procesos]);

    // Conteo: plantillas por proceso
    const plantillasPorProc = useMemo(() => {
        const map = new Map();
        for (const pl of plantillas) {
            const key = pl.proceso?.trim();
            if (key) map.set(key, (map.get(key) || 0) + 1);
        }
        return map;
    }, [plantillas]);

    // Conteo: procesos por objetivo
    const procesosPorObj = useMemo(() => {
        const map = new Map();
        for (const p of procesos) {
            const ref = p.objetivoISOId;
            const id = typeof ref === "object" ? ref?._id : ref;
            if (id) map.set(String(id), (map.get(String(id)) || 0) + 1);
        }
        return map;
    }, [procesos]);

    // ─── CRUD objetivos ───────────────────────────────────────────────────────
    const handleGuardarObj = async (payload) => {
        try {
            const isEdit = !!modalObj.data?._id;
            const saved = isEdit
                ? await api(`/objetivos-iso/${modalObj.data._id}`, { method: "PUT", body: payload })
                : await api("/objetivos-iso", { method: "POST", body: payload });
            setObjetivos((prev) => isEdit ? prev.map((o) => o._id === saved._id ? saved : o) : [...prev, saved]);
            toast.success(isEdit ? "Objetivo actualizado." : "Objetivo creado.");
            setModalObj({ open: false, data: null });
        } catch { toast.error("Error al guardar el objetivo."); }
    };

    const handleEliminarObj = async (id) => {
        if (!confirm("¿Eliminar este objetivo ISO? Los procesos asociados quedarán sin objetivo.")) return;
        try {
            await api(`/objetivos-iso/${id}`, { method: "DELETE" });
            setObjetivos((prev) => prev.filter((o) => o._id !== id));
            if (selectedObjId === id) { setSelectedObjId(null); setSelectedProcId(null); }
            toast.success("Objetivo eliminado.");
        } catch { toast.error("No se pudo eliminar."); }
    };

    // ─── CRUD procesos ────────────────────────────────────────────────────────
    const handleGuardarProc = async (payload) => {
        try {
            const isEdit = !!modalProc.data?._id;
            const saved = isEdit
                ? await api(`/procesos-iso/${modalProc.data._id}`, { method: "PUT", body: payload })
                : await api("/procesos-iso", { method: "POST", body: payload });
            setProcesos((prev) => isEdit ? prev.map((p) => p._id === saved._id ? saved : p) : [...prev, saved].sort((a, b) => a.codigo.localeCompare(b.codigo)));
            toast.success(isEdit ? "Proceso actualizado." : "Proceso creado y disponible en plantillas.");
            setModalProc({ open: false, data: null });
        } catch { toast.error("Error al guardar el proceso."); }
    };

    const handleEliminarProc = async (id) => {
        if (!confirm("¿Eliminar este proceso? Las plantillas existentes conservarán su valor actual.")) return;
        try {
            await api(`/procesos-iso/${id}`, { method: "DELETE" });
            setProcesos((prev) => prev.filter((p) => p._id !== id));
            if (selectedProcId === id) setSelectedProcId(null);
            toast.success("Proceso eliminado.");
        } catch { toast.error("No se pudo eliminar."); }
    };

    // ─── UI helpers ───────────────────────────────────────────────────────────
    const actionBtn = (label, onClick, cls = "") => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-white/80 ${cls}`}
            title={label}
        >
            {label === "Editar" ? <Pencil size={13} /> : <Trash2 size={13} />}
        </button>
    );

    // ─── render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#f5f9fc]">
            <div className="mx-auto max-w-[1700px] px-4 lg:px-8 py-6 space-y-5">

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Gestión ISO 9001</h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Info size={12} className="inline" />
                            Las plantillas se asocian automáticamente: <code className="bg-slate-100 px-1 rounded text-xs">Plantilla.proceso === "P01 - Nombre"</code>
                        </p>
                    </div>

                    {/* Selector de año fiscal */}
                    <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-1.5 shadow-sm">
                        <button onClick={() => setYear((y) => y - 1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronLeft size={16} /></button>
                        <span className="text-sm font-semibold min-w-[80px] text-center">{fiscalLabel(year)}</span>
                        <button onClick={() => setYear((y) => y + 1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronRight size={16} /></button>
                    </div>
                </div>

                {/* Breadcrumb de filtros activos */}
                {(selectedObjId || selectedProcId) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <button onClick={() => { setSelectedObjId(null); setSelectedProcId(null); }} className="text-blue-600 hover:underline">Todos</button>
                        {selectedObjId && (
                            <>
                                <span>/</span>
                                <button className="text-blue-700 font-medium" onClick={() => setSelectedProcId(null)}>
                                    {objetivos.find((o) => o._id === selectedObjId)?.nombre || "Objetivo"}
                                </button>
                            </>
                        )}
                        {selectedProcId && (
                            <>
                                <span>/</span>
                                <span className="text-slate-700 font-medium">
                                    {procesos.find((p) => p._id === selectedProcId)?.fullName}
                                </span>
                            </>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Cargando…</div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-3">

                        {/* ── COL 1: Objetivos ISO ────────────────────────────────── */}
                        <section className="rounded-xl bg-white shadow-md ring-1 ring-border/60 flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold">Objetivos - Mejora de Calidad</h2>
                                    <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{objetivos.length}</span>
                                </div>
                                {canEdit && (
                                    <Button size="sm" variant="ghost" className="h-7 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs"
                                        onClick={() => setModalObj({ open: true, data: null })}>
                                        <Plus size={13} /> Nuevo
                                    </Button>
                                )}
                            </div>

                            <ul className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[72vh]">
                                {/* "Todos" pill */}
                                <li>
                                    <button
                                        onClick={() => { setSelectedObjId(null); setSelectedProcId(null); }}
                                        className={`w-full text-left text-xs px-3 py-2 rounded-lg font-medium transition-all
                      ${!selectedObjId ? "bg-blue-600 text-white shadow" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
                                    >
                                        Todos los objetivos
                                    </button>
                                </li>

                                {objetivos.map((obj) => {
                                    const id = String(obj._id);
                                    const selected = selectedObjId === id;
                                    const cantP = procesosPorObj.get(id) || 0;
                                    return (
                                        <li key={id}
                                            className={`group rounded-xl border cursor-pointer transition-all hover:shadow-md
                        ${selected ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200" : "bg-white border-slate-200 hover:border-blue-200"}`}
                                            onClick={() => { setSelectedObjId(selected ? null : id); setSelectedProcId(null); }}
                                        >
                                            <div className="flex flex-col gap-2 px-3 py-2.5">
                                                <div className="flex items-start gap-3">
                                                    {obj.codigo && (
                                                        <span className={`shrink-0 mt-0.5 text-[10px] font-black px-2 py-0.5 rounded-full
                                                            ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                                            {obj.codigo}
                                                        </span>
                                                    )}
                                                    <span className={`text-sm font-semibold flex-1 leading-tight ${selected ? "text-blue-800" : "text-slate-800"}`}>
                                                        {obj.nombre}
                                                    </span>
                                                    <span className={`shrink-0 mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full
                                                        ${selected ? "bg-blue-200 text-blue-900" : "bg-slate-100 text-slate-500"}`}>
                                                        {cantP}P
                                                    </span>
                                                    {canEdit && (
                                                        <div className="flex gap-1 ml-1 mt-0.5">
                                                            {actionBtn("Editar",
                                                                () => setModalObj({ open: true, data: obj }),
                                                                "text-blue-500 hover:text-blue-700")}
                                                            {actionBtn("Eliminar",
                                                                () => handleEliminarObj(id),
                                                                "text-rose-500 hover:text-rose-700")}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Representante de Calidad */}
                                                {obj.representante && (
                                                    <div className="flex items-center gap-1.5 ml-[2.75rem]">
                                                        <UserCheck size={11} className="text-emerald-600" />
                                                        <span className="text-[10px] font-medium text-slate-500">
                                                            Rep. Calidad: <span className="text-slate-700">{obj.representante.nombre} {obj.representante.apellido}</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}

                                {objetivos.length === 0 && (
                                    <li className="text-xs text-muted-foreground text-center py-10">
                                        No hay objetivos.{" "}
                                        {canEdit && <button className="text-blue-600 underline" onClick={() => setModalObj({ open: true, data: null })}>Crear uno</button>}
                                    </li>
                                )}
                            </ul>
                        </section>

                        {/* ── COL 2: Procesos ─────────────────────────────────────── */}
                        <section className="rounded-xl bg-white shadow-md ring-1 ring-border/60 flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold">Procesos</h2>
                                    <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{procesosView.length}</span>
                                </div>
                                {canEdit && (
                                    <Button size="sm" variant="ghost" className="h-7 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs"
                                        onClick={() => setModalProc({ open: true, data: null })}>
                                        <Plus size={13} /> Nuevo
                                    </Button>
                                )}
                            </div>

                            <ul className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[72vh]">
                                {procesosView.map((proc) => {
                                    const id = String(proc._id);
                                    const selected = selectedProcId === id;
                                    const cantPl = plantillasPorProc.get(proc.fullName?.trim()) || 0;
                                    const sinObjetivo = !proc.objetivoISOId;
                                    const objRef = proc.objetivoISOId;
                                    const objLabel = objRef?.codigo ? `[${objRef.codigo}]` : (objRef?.nombre?.slice(0, 12) ?? null);

                                    return (
                                        <li key={id}
                                            className={`group rounded-xl border cursor-pointer transition-all hover:shadow-md
                        ${selected ? "ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:border-emerald-200"}`}
                                            onClick={() => setSelectedProcId(selected ? null : id)}
                                        >
                                            <div className="flex items-center gap-3 px-3 py-2.5">
                                                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full
                          ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                                    {proc.codigo}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-semibold leading-tight truncate ${selected ? "text-emerald-800" : "text-slate-800"}`}>
                                                        {proc.nombre}
                                                    </p>
                                                    {objLabel && (
                                                        <p className="text-[10px] text-muted-foreground">{objLabel}</p>
                                                    )}
                                                    {sinObjetivo && (
                                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                                                            sin objetivo
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full
                          ${selected ? "bg-emerald-200 text-emerald-900" : "bg-slate-100 text-slate-500"}`}>
                                                    {cantPl}
                                                </span>
                                                {canEdit && (
                                                    <div className="flex gap-1 ml-1">
                                                        {actionBtn("Editar",
                                                            () => setModalProc({ open: true, data: proc }),
                                                            "text-blue-500 hover:text-blue-700")}
                                                        {actionBtn("Eliminar",
                                                            () => handleEliminarProc(id),
                                                            "text-rose-500 hover:text-rose-700")}
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}

                                {procesosView.length === 0 && (
                                    <li className="text-xs text-muted-foreground text-center py-10">
                                        Ningún proceso para este objetivo.{" "}
                                        {canEdit && (
                                            <button className="text-blue-600 underline"
                                                onClick={() => setModalProc({ open: true, data: null })}>
                                                Crear uno
                                            </button>
                                        )}
                                    </li>
                                )}
                            </ul>
                        </section>

                        {/* ── COL 3: Plantillas ───────────────────────────────────── */}
                        <section className="rounded-xl bg-white shadow-md ring-1 ring-border/60 flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold">Plantillas</h2>
                                    <span className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                                        {plantillasView.length}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{fiscalLabel(year)}</span>
                                </div>
                            </div>

                            <ul className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[72vh]">
                                {plantillasView.map((pl) => (
                                    <li key={pl._id}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-violet-200 hover:shadow-sm transition-all">
                                        <div className="flex items-start gap-2">
                                            <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full
                        ${pl.tipo === "objetivo" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                                {pl.tipo === "objetivo" ? "OBJ" : "APT"}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{pl.nombre}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    {pl.proceso && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{pl.proceso.split(" - ")[0]}</span>
                                                    )}
                                                    {pl.frecuencia && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{pl.frecuencia}</span>
                                                    )}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full
                            ${pl.activo ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                                                        {pl.activo ? "Activa" : "Inactiva"}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="shrink-0 text-xs font-bold text-slate-500">{pl.pesoBase}%</span>
                                        </div>
                                    </li>
                                ))}

                                {plantillasView.length === 0 && (
                                    <li className="text-xs text-muted-foreground text-center py-10">
                                        {selectedProcId
                                            ? "No hay plantillas con este proceso en el año seleccionado."
                                            : selectedObjId
                                                ? "No hay plantillas para los procesos de este objetivo."
                                                : "No hay plantillas para este año fiscal."}
                                    </li>
                                )}
                            </ul>
                        </section>
                    </div>
                )}

                {/* ── Modales ─────────────────────────────────────────────────── */}
                <Modal isOpen={modalObj.open} onClose={() => setModalObj({ open: false, data: null })}
                    title={modalObj.data ? "Editar Obj. Mejora de Calidad" : "Nuevo Obj. Mejora de Calidad"}>
                    {modalObj.open && (
                        <FormularioObjetivoISO
                            initialData={modalObj.data}
                            defaultYear={year}
                            onGuardar={handleGuardarObj}
                            onCancelar={() => setModalObj({ open: false, data: null })}
                        />
                    )}
                </Modal>

                <Modal isOpen={modalProc.open} onClose={() => setModalProc({ open: false, data: null })}
                    title={modalProc.data ? "Editar Proceso" : "Nuevo Proceso"}>
                    {modalProc.open && (
                        <FormularioProceso
                            initialData={modalProc.data}
                            defaultYear={year}
                            onGuardar={handleGuardarProc}
                            onCancelar={() => setModalProc({ open: false, data: null })}
                        />
                    )}
                </Modal>
            </div>
        </div>
    );
}
