
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsuariosAdmin from "./UsuariosAdmin";
import RolesAdmin from "./RolesAdmin";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, HardDrive, RefreshCw, Shield, Users, Server, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { API_ORIGIN } from "@/lib/api";

const BackupsList = () => {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [runningBackup, setRunningBackup] = useState(false);
    const [nextBackupTime, setNextBackupTime] = useState("");

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

    const handleRestore = async (backupName) => {
        if (!confirm(`PELIGRO: ¿Estás seguro de que quieres restaurar el backup "${backupName}"?\n\nESTO SOBREESCRIBIRÁ TODA LA INFORMACIÓN ACTUAL.\n\nEsta acción no se puede deshacer.`)) {
            return;
        }

        setLoading(true);
        const toastId = toast.loading("Restaurando sistema...");

        try {
            const res = await api(`/system/backups/${backupName}/restore`, { method: 'POST' });

            toast.dismiss(toastId);
            if (res.success) {
                toast.success("Sistema restaurado correctamente. Se recomienda recargar la página.");
                setTimeout(() => window.location.reload(), 2000);
            } else {
                throw new Error(res.message || "Error desconocido");
            }
        } catch (err) {
            console.error(err);
            toast.dismiss(toastId);
            toast.error("Error al restaurar: " + (err.message || err.toString()));
        } finally {
            setLoading(false);
        }
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

                                    <Button variant="ghost" size="sm" onClick={() => handleRestore(bk.name)} className="text-amber-600 hover:text-amber-700 hover:bg-amber-100">
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
        </div>
    );
};

export default function Sistemas() {
    return (
        <div className="container-app space-y-8">
            <div className="mb-8 text-center pt-4">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">Administración de Sistemas</h1>
                <p className="text-slate-500 mt-2 text-lg">Gestión centralizada de seguridad, usuarios y roles.</p>
            </div>

            <Tabs defaultValue="backups" className="w-full flex flex-col items-center">
                <TabsList className="flex w-full max-w-2xl h-14 p-1.5 bg-slate-100 rounded-full border border-slate-200">
                    <TabsTrigger value="backups" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2">
                        <HardDrive className="w-4 h-4" /> Backups
                    </TabsTrigger>
                    <TabsTrigger value="users" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2">
                        <Users className="w-4 h-4" /> Usuarios
                    </TabsTrigger>
                    <TabsTrigger value="roles" className="flex-1 rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all gap-2">
                        <Shield className="w-4 h-4" /> Roles
                    </TabsTrigger>
                </TabsList>

                <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <TabsContent value="backups">
                        <BackupsList />
                    </TabsContent>

                    <TabsContent value="users">
                        <UsuariosAdmin />
                    </TabsContent>

                    <TabsContent value="roles">
                        <RolesAdmin />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
