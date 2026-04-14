import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsuariosAdmin from "./UsuariosAdmin";
import RolesAdmin from "./RolesAdmin";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, HardDrive, RefreshCw, Shield, Users, Server, RotateCcw, AlertTriangle, Check, CheckCircle2, MessageSquarePlus, Activity, Cpu, Database, BarChart3, Clock, Info, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { API_ORIGIN } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { dashEmpleado } from "@/lib/dashboard";
import { calculatePeriodScores } from "@/lib/scoreHelpers";

const ScoreAuditPanel = () => {
    const { impersonateUser } = useAuth();
    const navigate = useNavigate();
    
    const [year, setYear] = useState(2025);
    const [searchVal, setSearchVal] = useState("");
    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fixingId, setFixingId] = useState(null);
    // liveScores[empId][periodo] = { obj, comp, global }
    const [liveScores, setLiveScores] = useState({});
    const [liveLoading, setLiveLoading] = useState(false);

    const [impersonatingId, setImpersonatingId] = useState(null);
    const [impersonateSelect, setImpersonateSelect] = useState("");

    // Change Password State
    const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
    const [passLoading, setPassLoading] = useState(false);

    // 1) Cargar feedbacks con sus scores de BD (no recalcula nada)
    const loadAudit = async (y = year) => {
        setLoading(true);
        setLiveScores({});
        try {
            const { results: data } = await api(`/feedbacks/admin/audit-scores?year=${y}`);
            setAllData(data || []);
            if (!data || data.length === 0) toast.info(`No hay feedbacks para auditar en ${y}`);
        } catch (error) {
            console.error(error);
            toast.error("Error al obtener la auditoría");
        } finally {
            setLoading(false);
        }
    };
    // 2) Calcular scores "en vivo" con la misma función que usa la Sala de Evaluación
    const calcularEnVivo = async () => {
        if (allData.length === 0) return;
        setLiveLoading(true);
        const newLive = {};
        let ok = 0, fail = 0;

        for (const emp of allData) {
            try {
                // Llamada directa al dashboard del empleado (mismo endpoint que la Sala de Evaluación)
                const dashData = await dashEmpleado(emp.empleadoId, year);
                if (!dashData) {
                    console.warn(`[AUDIT] dashEmpleado retornó null para ${emp.empleado} (${emp.empleadoId})`);
                    fail++;
                    continue;
                }
                newLive[emp.empleadoId] = {};
                emp.feedbacks.forEach(fb => {
                    const scores = calculatePeriodScores(dashData, fb.periodo);
                    newLive[emp.empleadoId][fb.periodo] = {
                        obj: Number(scores.obj),
                        comp: Number(scores.comp),
                        global: Number(scores.global)
                    };
                });
                ok++;
                // Actualizar el estado parcialmente para que el usuario vea progreso
                setLiveScores(prev => ({ ...prev, [emp.empleadoId]: newLive[emp.empleadoId] }));
            } catch (e) {
                console.error(`[AUDIT] Error para ${emp.empleado}:`, e?.message || e);
                fail++;
            }
        }

        setLiveLoading(false);
        if (ok > 0 && fail === 0) {
            toast.success(`Scores en vivo calculados para ${ok} empleados`);
        } else if (ok > 0) {
            toast.warning(`Calculado: ${ok} OK, ${fail} fallaron (ver consola)`);
        } else {
            toast.error(`No se pudo calcular ningún score. Verificá que el backend esté activo en puerto 5007.`);
        }
    };

    useEffect(() => {
        loadAudit(year);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year]);

    const results = useMemo(() => {
        if (!searchVal) return allData;
        return allData.filter(e => e.empleado.toLowerCase().includes(searchVal.toLowerCase()));
    }, [allData, searchVal]);

    const uniqueEmpleados = useMemo(() => {
        return Array.from(new Set(allData.map(e => e.empleado))).sort();
    }, [allData]);

    const handleImpersonate = async (empId) => {
        setImpersonatingId(empId);
        try {
            const userData = await api(`/_whoami?empleadoId=${empId}`);
            if (userData) {
                impersonateUser(userData);
                toast.success(`Ahora estás viendo la App como ${userData.nombre}`);
                navigate("/");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error al enmascarar usuario");
        } finally {
            setImpersonatingId(null);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error("Las contraseñas nuevas no coinciden");
        }
        setPassLoading(true);
        try {
            await api("/auth/change-password", {
                method: "POST",
                body: { currentPassword: passwords.current, newPassword: passwords.new }
            });
            toast.success("Contraseña actualizada correctamente");
            setPasswords({ current: "", new: "", confirm: "" });
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Error al cambiar la contraseña");
        } finally {
            setPassLoading(false);
        }
    };

    // Corregir: envía los scores calculados por el frontend y los guarda en BD
    const handleFix = async (empId, fbId, periodo) => {
        const live = liveScores[empId]?.[periodo];
        if (!live) {
            toast.error("Primero presioná 'Calcular En Vivo'");
            return;
        }
        const { obj, comp, global } = live;
        if (!confirm(`¿Corregir ${periodo}?\nObj: ${obj.toFixed(2)} | Comp: ${comp.toFixed(2)} | Global: ${global.toFixed(2)}\nEsto actualiza el registro guardado en BD.`)) return;

        setFixingId(fbId);
        try {
            await api('/feedbacks/admin/fix-scores', {
                method: 'POST',
                body: { feedbackId: fbId, scores: { obj, comp, global } }
            });
            toast.success(`Score de ${periodo} corregido exitosamente`);
            setAllData(prev => prev.map(emp => {
                if (emp.empleadoId !== empId) return emp;
                return {
                    ...emp,
                    feedbacks: emp.feedbacks.map(fb => {
                        if (fb._id !== fbId) return fb;
                        return { ...fb, bdScores: { obj, comp, global } };
                    })
                };
            }));
        } catch (e) {
            console.error(e);
            toast.error("Error al corregir score");
        } finally {
            setFixingId(null);
        }
    };

    const ScoreCell = ({ bd, live }) => {
        const hasDiff = live !== undefined && Math.abs(bd - live) > 0.09;
        return (
            <div className="flex flex-col items-center gap-1 text-xs font-mono">
                <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 w-[110px] flex justify-between">
                    <span>BD:</span><span>{bd.toFixed(2)}</span>
                </span>
                {live !== undefined ? (
                    <span className={`font-bold px-2 py-0.5 rounded w-[110px] flex justify-between border ${
                        hasDiff ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                        <span>Vivo:</span><span>{live.toFixed(2)}</span>
                    </span>
                ) : (
                    <span className="text-slate-300 px-2 py-0.5 w-[110px] text-center italic text-[10px]">—calcular—</span>
                )}
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* COLUMN LEFT: FILTERS & AUDIT TABLE */}
            <div className="lg:col-span-8 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-bold text-slate-700">Año Fiscal</label>
                        <select
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white transition-colors"
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                        >
                            <option value={2024}>2024</option>
                            <option value={2025}>2025</option>
                            <option value={2026}>2026</option>
                        </select>
                    </div>
                    <div className="flex-[2] space-y-2">
                        <label className="text-sm font-bold text-slate-700">Filtrar por Apellido</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Ej. Fitz Patrick"
                                value={searchVal}
                                onChange={e => setSearchVal(e.target.value)}
                                list="audit-empleados-list"
                                className="w-full p-2.5 pl-10 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white transition-colors"
                            />
                            <datalist id="audit-empleados-list">
                                {uniqueEmpleados.map(emp => (
                                    <option key={emp} value={emp} />
                                ))}
                            </datalist>
                        </div>
                    </div>
                    <Button
                        onClick={() => loadAudit(year)}
                        disabled={loading}
                        className="h-[46px] px-6 bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <RefreshCw className="w-5 h-5 mr-2" />}
                        {loading ? '...' : 'Recargar'}
                    </Button>
                    <Button
                        onClick={calcularEnVivo}
                        disabled={liveLoading || allData.length === 0}
                        className="h-[46px] px-6 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {liveLoading ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <Activity className="w-5 h-5 mr-2" />}
                        {liveLoading ? '...' : 'Calcular'}
                    </Button>
                </div>

                {allData.length > 0 && Object.keys(liveScores).length === 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-start gap-3">
                        <Info className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>
                            Cargados <strong>{allData.length}</strong> empleados. Presioná <strong>“Calcular”</strong> para auditar.
                        </span>
                    </div>
                )}

                {results.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-sm">
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <span className="font-bold text-slate-500">Resultados de Auditoría ({results.length})</span>
                            <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                Lógica de Sala de Evaluación
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-4 text-left font-bold text-slate-500">Empleado</th>
                                        <th className="px-4 py-4 text-left font-bold text-slate-500">Periodo</th>
                                        <th className="px-4 py-4 text-center font-bold text-slate-500">Obj (70%)</th>
                                        <th className="px-4 py-4 text-center font-bold text-slate-500">Comp (30%)</th>
                                        <th className="px-4 py-4 text-center font-bold text-slate-500">Global</th>
                                        <th className="px-4 py-4 text-right font-bold text-slate-500">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {results.map((emp) => (
                                        emp.feedbacks.map((fb, idx) => {
                                            const live = liveScores[emp.empleadoId]?.[fb.periodo];
                                            const hasDiff = live && Math.abs((fb.bdScores.global || 0) - live.global) > 0.09;
                                            return (
                                                <tr key={fb._id} className={`hover:bg-slate-50 transition-colors ${hasDiff ? 'bg-amber-50/50' : ''}`}>
                                                    <td className="px-4 py-4">
                                                        {idx === 0
                                                            ? <span className="font-bold text-slate-700 break-words">{emp.empleado}</span>
                                                            : <span className="text-slate-200">&ldquo;</span>}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className="font-bold text-slate-700">{fb.periodo}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <ScoreCell bd={fb.bdScores.obj} live={live?.obj} />
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <ScoreCell bd={fb.bdScores.comp} live={live?.comp} />
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <ScoreCell bd={fb.bdScores.global} live={live?.global} />
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        {live ? (
                                                            hasDiff ? (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleFix(emp.empleadoId, fb._id, fb.periodo)}
                                                                    disabled={fixingId === fb._id}
                                                                    className="bg-amber-500 hover:bg-amber-600 text-white shadow-sm h-8 px-2 text-[10px] font-bold"
                                                                >
                                                                    {fixingId === fb._id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'CORREGIR'}
                                                                </Button>
                                                            ) : (
                                                                <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />
                                                            )
                                                        ) : (
                                                            <span className="text-slate-300 text-[10px] italic">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* COLUMN RIGHT: IMPERSONATION & SECURITY */}
            <div className="lg:col-span-4 space-y-6">
                {/* QUICK IMPERSONATE SELECTOR */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-sm">
                    <div className="p-4 bg-blue-600 border-b border-blue-700 flex items-center gap-3">
                        <Users className="w-5 h-5 text-blue-100" />
                        <span className="font-bold text-white uppercase tracking-wider text-xs">Modo Enmascarado</span>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Seleccionar Empleado</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={impersonateSelect}
                                    onChange={e => setImpersonateSelect(e.target.value)}
                                    list="impersonate-list"
                                    className="w-full p-2 pl-9 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                                />
                                <datalist id="impersonate-list">
                                    {uniqueEmpleados.map(emp => (
                                        <option key={emp} value={emp} />
                                    ))}
                                </datalist>
                            </div>
                        </div>
                        <Button
                            onClick={() => {
                                const emp = allData.find(e => e.empleado === impersonateSelect);
                                if (emp) handleImpersonate(emp.empleadoId);
                                else toast.error("Seleccione un empleado válido");
                            }}
                            disabled={!impersonateSelect || impersonatingId}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-[44px] shadow-sm active:scale-[0.98] transition-all"
                        >
                            {impersonatingId ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                            Ver App como...
                        </Button>
                        <p className="text-[10px] text-slate-400 italic text-center leading-relaxed">
                            Permite ver la plataforma con la identidad de otro usuario para diagnosticar errores.
                        </p>
                    </div>
                </div>

                {/* PASSWORD CHANGE SECTION */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-sm">
                    <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3">
                        <Shield className="w-5 h-5 text-blue-400" />
                        <span className="font-bold text-white uppercase tracking-wider text-xs">Seguridad Admin</span>
                    </div>
                    <form onSubmit={handleChangePassword} className="p-5 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Clave Actual</label>
                            <input
                                type="password"
                                required
                                value={passwords.current}
                                onChange={(e) => setPasswords(p => ({ ...p, current: e.target.value }))}
                                className="w-full h-[38px] px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Nueva Clave</label>
                            <input
                                type="password"
                                required
                                value={passwords.new}
                                onChange={(e) => setPasswords(p => ({ ...p, new: e.target.value }))}
                                className="w-full h-[38px] px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Confirmar Nueva</label>
                            <input
                                type="password"
                                required
                                value={passwords.confirm}
                                onChange={(e) => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                className="w-full h-[38px] px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={passLoading}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold h-[44px] shadow-sm transition-all"
                        >
                            {passLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Actualizar
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const BackupsList = () => {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [runningBackup, setRunningBackup] = useState(false);
    const [nextBackupTime, setNextBackupTime] = useState("");

    // Restore Dialog State
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
    const [selectedBackup, setSelectedBackup] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [backupPreview, setBackupPreview] = useState([]); // List of collections available
    const [restoreMode, setRestoreMode] = useState('full'); // 'full' or 'partial'
    const [selectedCollections, setSelectedCollections] = useState([]);

    const calculateTimeUntilBackup = () => {
        const now = new Date();
        const target = new Date();
        target.setHours(3, 0, 0, 0); // 03:00 AM

        if (now > target) {
            target.setDate(target.getDate() + 1); // Next day
        }

        const diff = target - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setNextBackupTime(`${hours}h ${minutes}m ${seconds}s`);
    };

    useEffect(() => {
        calculateTimeUntilBackup();
        const interval = setInterval(calculateTimeUntilBackup, 1000); // Update every second
        return () => clearInterval(interval);
    }, []);

    const handleManualBackup = async () => {
        if (!confirm("¿Generar un backup manual ahora? Esto puede tomar unos segundos.")) return;
        setRunningBackup(true);
        try {
            const res = await api('/system/run', { method: 'POST' });
            toast.success(`Backup manual creado: ${res.filename}`);
            loadBackups(); // Refresh list
        } catch (e) {
            console.error(e);
            toast.error("Error ejecutando backup manual");
        } finally {
            setRunningBackup(false);
        }
    };

    const loadBackups = async () => {
        setLoading(true);
        try {
            const res = await api('/system/backups');
            if (Array.isArray(res)) {
                setBackups(res);
            }
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar backups");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBackups();
    }, []);

    const handleDownload = (filename) => {
        const token = localStorage.getItem('token');
        const url = `${API_ORIGIN || ''}/api/system/backups/${filename}/download`;

        fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(async res => {
                if (!res.ok) {
                    const text = await res.text();
                    console.error("Download error:", res.status, res.statusText, text);
                    throw new Error(`Download failed: ${res.status}`);
                }
                return res.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            })
            .catch(err => {
                toast.error("Error descargando archivo.");
                console.error(err);
            });
    };

    const handleInitiateRestore = async (backupName) => {
        setSelectedBackup(backupName);
        setRestoreDialogOpen(true);
        setPreviewLoading(true);
        setRestoreMode('full');
        setBackupPreview([]);
        setSelectedCollections([]);

        try {
            const res = await api(`/system/backups/${backupName}/preview`);
            if (Array.isArray(res)) {
                setBackupPreview(res);
                // Pre-select all by default? Or none? Let's pre-select all for convenience if they switch to partial
                setSelectedCollections(res.map(c => c.name));
            }
        } catch (e) {
            console.error("Error loading preview:", e);
            toast.error("No se pudo cargar la vista previa del backup.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleConfirmRestore = async () => {
        if (!selectedBackup) return;

        if (restoreMode === 'partial' && selectedCollections.length === 0) {
            toast.error("Debes seleccionar al menos una colección para restaurar.");
            return;
        }

        const isFullKey = restoreMode === 'full';
        const collectionsToRestore = isFullKey ? null : selectedCollections;

        if (!confirm(`PELIGRO: ¿Estás seguro de restaurar ${isFullKey ? 'TODO el sistema' : selectedCollections.length + ' colecciones'} desde "${selectedBackup}"?\n\nESTO SOBREESCRIBIRÁ LOS DATOS ACTUALES.`)) {
            return;
        }

        setRestoreDialogOpen(false);
        setLoading(true);
        const toastId = toast.loading("Restaurando sistema...");

        try {
            const res = await api(`/system/backups/${selectedBackup}/restore`, {
                method: 'POST',
                body: JSON.stringify({ collections: collectionsToRestore })
            });

            toast.dismiss(toastId);
            if (res.success) {
                toast.success("Sistema restaurado correctamente.");
                setTimeout(() => window.location.reload(), 1500);
            } else {
                throw new Error(res.message || "Error desconocido");
            }
        } catch (err) {
            console.error(err);
            toast.dismiss(toastId);
            toast.error("Error al restaurar: " + (err.message || err.toString()));
        } finally {
            setLoading(false);
            setSelectedBackup(null);
        }
    };

    const toggleCollection = (name) => {
        setSelectedCollections(prev =>
            prev.includes(name)
                ? prev.filter(c => c !== name)
                : [...prev, name]
        );
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Status Card - Redesigned */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                <div className="flex gap-6 items-center z-10">
                    <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 shadow-inner">
                        <RefreshCw className={`w-8 h-8 text-blue-400 ${runningBackup ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                        <h4 className="font-bold text-xl text-white tracking-tight">Sistema de Respaldo Automático</h4>
                        <div className="flex flex-col gap-1 mt-2">
                            <span className="text-slate-400 text-sm font-medium">
                                Próximo backup: <span className="text-blue-200">03:00 AM</span>
                            </span>
                            <div className="flex items-baseline gap-2">
                                <span className="font-mono text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 tracking-wider">
                                    {nextBackupTime}
                                </span>
                                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">restantes</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 z-10">
                    <Button
                        variant="default"
                        size="lg"
                        onClick={handleManualBackup}
                        disabled={runningBackup || loading}
                        className="h-14 px-8 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 text-base font-bold transition-all hover:scale-105 active:scale-95"
                    >
                        {runningBackup ? (
                            <>
                                <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                                Generando Backup...
                            </>
                        ) : (
                            <>
                                <HardDrive className="w-6 h-6 mr-3" />
                                Ejecutar Backup Manual
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="flex justify-between items-center mt-8 px-2">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Historial de Copias</h3>
                    <p className="text-sm text-slate-500">Listado de backups automáticos y manuales.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadBackups} disabled={loading} className="border-slate-300 text-slate-600 hover:bg-slate-50">
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar Lista
                </Button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-left font-bold text-slate-600 uppercase text-xs tracking-wider">Nombre de Archivo</th>
                            <th className="px-6 py-4 text-left font-bold text-slate-600 uppercase text-xs tracking-wider">Fecha Creación</th>
                            <th className="px-6 py-4 text-left font-bold text-slate-600 uppercase text-xs tracking-wider">Tamaño</th>
                            <th className="px-6 py-4 text-right font-bold text-slate-600 uppercase text-xs tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {backups.map((bk) => (
                            <tr key={bk.name} className="hover:bg-blue-50/50 transition-colors group">
                                <td className="px-6 py-4 font-mono text-xs text-slate-600 font-medium">{bk.name}</td>
                                <td className="px-6 py-4 text-slate-500">
                                    {new Date(bk.createdAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-slate-500 font-medium">{formatBytes(bk.size)}</td>
                                <td className="px-6 py-4 text-right">
                                    <Button variant="ghost" size="sm" onClick={() => handleDownload(bk.name)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-100">
                                        <Download className="w-4 h-4 mr-2" />
                                        Descargar
                                    </Button>

                                    <Button variant="ghost" size="sm" onClick={() => handleInitiateRestore(bk.name)} className="text-amber-600 hover:text-amber-700 hover:bg-amber-100">
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Restaurar
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {backups.length === 0 && !loading && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    <div className="flex flex-col items-center gap-3">
                                        <HardDrive className="w-10 h-10 text-slate-200" />
                                        <p>No hay backups disponibles aún.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="p-5 bg-amber-50 text-amber-900 rounded-xl text-sm border border-amber-100 flex gap-4 items-start shadow-sm">
                <div className="p-2 bg-amber-100 rounded-lg shrink-0 text-amber-600">
                    <Download className="w-5 h-5" />
                </div>
                <div>
                    <span className="font-bold block text-base mb-1">Nota Importante de Seguridad</span>
                    <p className="opacity-90 leading-relaxed">
                        Estos archivos contienen <strong>TODA</strong> la base de datos en formato JSON.
                        Te recomendamos guardarlos periódicamente en un disco externo o nube personal para máxima seguridad.
                        Son copias independientes del servidor y te permitirán restaurar el sistema en caso de emergencia.
                    </p>
                </div>
            </div>

            <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-5 h-5" />
                            Confirmar Restauración
                        </DialogTitle>
                        <DialogDescription>
                            Estás a punto de restaurar el backup <strong>{selectedBackup}</strong>.
                            Esta acción sobreescribirá los datos actuales y es irreversible.
                        </DialogDescription>
                    </DialogHeader>

                    {previewLoading ? (
                        <div className="py-8 flex justify-center text-slate-400">
                            <RefreshCw className="w-8 h-8 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-6 py-4">
                            <div className="flex p-1 bg-slate-100 rounded-lg">
                                <button
                                    onClick={() => setRestoreMode('full')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${restoreMode === 'full' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Restauración Completa
                                </button>
                                <button
                                    onClick={() => setRestoreMode('partial')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${restoreMode === 'partial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Personalizada (Por Colección)
                                </button>
                            </div>

                            {restoreMode === 'full' ? (
                                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-amber-800 text-sm">
                                    <p className="font-bold flex items-center gap-2">
                                        <HardDrive className="w-4 h-4" />
                                        Se reemplazará TODA la base de datos.
                                    </p>
                                    <p className="mt-1 opacity-80 pl-6">Todas las colecciones actuales serán eliminadas y reemplazadas por las del backup.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-sm font-bold text-slate-700">Selecciona qué restaurar:</span>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="xs" className="h-6 text-xs" onClick={() => setSelectedCollections(backupPreview.map(c => c.name))}>Todas</Button>
                                            <Button variant="ghost" size="xs" className="h-6 text-xs" onClick={() => setSelectedCollections([])}>Ninguna</Button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-lg bg-slate-50/50">
                                        {backupPreview.map((col) => (
                                            <label key={col.name} className="flex items-center space-x-2 p-2 rounded hover:bg-white hover:shadow-sm cursor-pointer border border-transparent hover:border-slate-100 transition-all">
                                                <Checkbox
                                                    checked={selectedCollections.includes(col.name)}
                                                    onCheckedChange={() => toggleCollection(col.name)}
                                                />
                                                <span className="text-sm font-medium text-slate-700">{col.name}</span>
                                                <span className="text-xs text-slate-400 ml-auto">{formatBytes(col.size)}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 text-right">
                                        {selectedCollections.length} de {backupPreview.length} colecciones seleccionadas
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmRestore}
                            disabled={previewLoading || (restoreMode === 'partial' && selectedCollections.length === 0)}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {restoreMode === 'full' ? 'Restaurar TODO' : `Restaurar ${selectedCollections.length} Colecciones`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const HealthDashboard = () => {
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadHealth = async () => {
        try {
            const res = await api('/system/health');
            setHealth(res);
        } catch (err) {
            console.error("Error loading health:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHealth();
        const interval = setInterval(loadHealth, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    if (loading && !health) {
        return (
            <div className="flex justify-center py-20">
                <RefreshCw className="w-10 h-10 animate-spin text-blue-500" />
            </div>
        );
    }

    const StatCard = ({ title, value, icon: Icon, color, detail, tooltip, isWarning }) => (
        <div className={`relative group bg-white p-6 rounded-2xl border ${isWarning ? 'border-red-300 shadow-red-100' : 'border-slate-200'} shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow`}>
            
            {/* Tooltip implementation */}
            {tooltip && (
                <div className="absolute -top-2 right-4 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-64">
                    <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700">
                        {tooltip}
                        {/* Little triangle arrow at the bottom */}
                        <div className="absolute -bottom-1 right-6 w-2 h-2 bg-slate-900 border-b border-r border-slate-700 transform rotate-45"></div>
                    </div>
                </div>
            )}

            <div className={`p-3 rounded-xl ${isWarning ? 'bg-red-50 text-red-600' : `bg-${color}-50 text-${color}-600`}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
                <div className="flex justify-between items-start">
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                    {tooltip && <Info className={`w-4 h-4 ${isWarning ? 'text-red-400' : 'text-slate-300'}`} />}
                </div>
                <p className={`text-2xl font-black mt-1 ${isWarning ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
                {detail && <p className={`text-xs font-medium mt-1 ${isWarning ? 'text-red-500' : 'text-slate-400'}`}>{detail}</p>}
            </div>
        </div>
    );

    const dbOnline = health?.database?.readyState === 1;
    
    // Threshold calculations
    const highMemory = health?.server?.memory?.heapUsedCount > (health?.server?.memory?.heapTotalCount * 0.85); // 85% used
    const cpuThreshold = health?.server?.cpuCount || 4; // default to 4 if unknown
    const highLoad = health?.server?.loadAvg?.[0] > cpuThreshold;

    return (
        <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Base de Datos" 
                    value={dbOnline ? "Online" : "Error"} 
                    icon={Database} 
                    color={dbOnline ? "green" : "red"}
                    detail={`Estado: ${health?.database?.status || 'desconocido'}`}
                    isWarning={!dbOnline}
                    tooltip={<><strong>Indicador Crítico.</strong> Muestra si el servidor está conectado a MongoDB. Si marca Error, ninguna información podrá ser guardada ni leída. Reintenta actualizar la web.</>}
                />
                <StatCard 
                    title="Uptime Servidor" 
                    value={health?.server?.uptimeFormatted || "0s"} 
                    icon={Clock} 
                    color="blue"
                    detail={`Plataforma: ${health?.server?.platform}`}
                    tooltip={<>Muestra hace cuánto tiempo el backend principal arrancó. Útil para saber si hubo un reinicio automático reciente.</>}
                />
                <StatCard 
                    title="Memoria (Heap)" 
                    value={health?.server?.memory?.heapUsed || "0 MB"} 
                    icon={Cpu} 
                    color="purple"
                    detail={`Total Asignado: ${health?.server?.memory?.heapTotal}`}
                    isWarning={highMemory}
                    tooltip={<><strong>Peligro &gt; 85%.</strong> Muestra la RAM usada por el motor de Node.js frente a la reservada. Si está en crítico (muy cercano al total), el sistema podría volverse inestable y reiniciarse.</>}
                />
                <StatCard 
                    title="Carga de Red" 
                    value={health?.server?.loadAvg?.[0]?.toFixed(2) || "0.00"} 
                    icon={Activity} 
                    color="orange"
                    detail={`Cores: ${health?.server?.cpuCount || '?'}`}
                    isWarning={highLoad}
                    tooltip={<><strong>Peligro &gt; Núcleos.</strong> Indica la saturación del procesador en el último minuto. Valores por encima del número de núcleos de CPU indican que el servidor está sobrecargado y procesará lento.</>}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Stats Summary */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
                        <BarChart3 className="w-24 h-24" />
                    </div>
                    
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-600" />
                            Estadísticas del Sistema
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
                             <div className="flex justify-between">
                                 <span className="text-xs font-bold text-slate-400 uppercase">Empleados en DB</span>
                                 <Users className="w-4 h-4 text-slate-300" />
                             </div>
                             <p className="text-3xl font-black text-slate-700 mt-2">{health?.stats?.employees || 0}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
                             <div className="flex justify-between">
                                 <span className="text-xs font-bold text-slate-400 uppercase">Evaluaciones DB</span>
                                 <MessageSquarePlus className="w-4 h-4 text-slate-300" />
                             </div>
                             <p className="text-3xl font-black text-slate-700 mt-2">{health?.stats?.evaluations || 0}</p>
                        </div>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex gap-4 items-center">
                        <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                             <Activity className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                             <span className="text-xs font-bold text-blue-500 uppercase">Usuarios Activos (Últimas 24h)</span>
                             <div className="flex items-baseline gap-2 mt-1">
                                 <p className="text-3xl font-black text-blue-800">{health?.stats?.usersActive24h || 0}</p>
                                 <p className="text-sm font-medium text-blue-400">/ {health?.stats?.usersTotal || 0} registrados</p>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Technical Details */}
                <div className="bg-slate-900 p-8 rounded-2xl shadow-xl text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Server className="w-24 h-24" />
                    </div>
                    <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-blue-400">
                        <Server className="w-5 h-5" />
                        Detalles del Entorno
                    </h3>
                    <div className="space-y-4 font-mono text-sm">
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-slate-400">Node.js Version</span>
                            <span className="text-blue-200">{health?.server?.nodeVersion}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-slate-400">OS Platform</span>
                            <span className="text-blue-200">{health?.server?.platform}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-slate-400">Memory RSS</span>
                            <span className="text-blue-200">{health?.server?.memory?.rss}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-slate-400">Último Chequeo</span>
                            <span className="text-slate-500">{new Date(health?.timestamp).toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-4">
                <Button variant="outline" size="lg" onClick={loadHealth} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Actualizar Estado
                </Button>
            </div>
        </div>
    );
};

export default function Sistemas() {
    const nav = useNavigate();
    const { user } = useAuth();
    const isSuper = user?.isSuper || user?.rol === "superadmin";

    return (
        <div className="container-app space-y-8">
            <div className="flex justify-start pt-4">
                <Button variant="ghost" onClick={() => nav('/')} className="text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver al Inicio
                </Button>
            </div>
            <div className="mb-8 text-center pt-2">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">Administración de Sistemas</h1>
                <p className="text-slate-500 mt-2 text-lg">Gestión centralizada de seguridad, usuarios y roles.</p>
            </div>

            <Tabs defaultValue="backups" className="w-full flex flex-col items-center">
                <TabsList className="flex w-full max-w-4xl h-14 p-1.5 bg-slate-100 rounded-full border border-slate-200 overflow-x-auto custom-scrollbar flex-nowrap shrink-0 justify-start">
                    <TabsTrigger value="backups" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2 min-w-max">
                        <HardDrive className="w-4 h-4" /> Backups
                    </TabsTrigger>
                    <TabsTrigger value="health" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2 min-w-max">
                        <Activity className="w-4 h-4" /> Salud
                    </TabsTrigger>
                    <TabsTrigger value="users" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2 min-w-max">
                        <Users className="w-4 h-4" /> Usuarios
                    </TabsTrigger>
                    <TabsTrigger value="roles" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2 min-w-max">
                        <Shield className="w-4 h-4" /> Roles
                    </TabsTrigger>

                    {isSuper && (
                        <TabsTrigger value="audit" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2 min-w-max text-amber-600">
                            <AlertTriangle className="w-4 h-4" /> Auditoría Scores
                        </TabsTrigger>
                    )}

                    <button
                        onClick={() => nav('/gestion-mejoras')}
                        className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-bold transition-all gap-2 px-3 py-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-50 min-w-max"
                    >
                        <MessageSquarePlus className="w-4 h-4" /> Mejoras
                    </button>
                </TabsList>

                <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TabsContent value="backups">
                        <BackupsList />
                    </TabsContent>

                    <TabsContent value="health">
                        <HealthDashboard />
                    </TabsContent>

                    <TabsContent value="users">
                        <UsuariosAdmin />
                    </TabsContent>

                    <TabsContent value="roles">
                        <RolesAdmin />
                    </TabsContent>

                    {isSuper && (
                        <TabsContent value="audit">
                            <ScoreAuditPanel />
                        </TabsContent>
                    )}
                </div>
            </Tabs>
        </div>
    );
}
