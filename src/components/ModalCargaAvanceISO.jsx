// src/components/ModalCargaAvanceISO.jsx
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Info, TrendingUp, AlertTriangle, Paperclip, X, FileText } from "lucide-react";

const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const FISCAL_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

export default function ModalCargaAvanceISO({ objetivo, onGuardar, onCancelar }) {
    const fiscalYear = objetivo.year;
    
    // ─── Estado ───────────────────────────────────────────────────────────────
    const [mesSeleccionado, setMesSeleccionado] = useState(() => {
        const now = new Date();
        const m = now.getMonth() + 1;
        // Si el mes actual está en el orden fiscal, seleccionarlo. Si no (ej: agosto tarde), usar sep.
        return FISCAL_MONTH_ORDER.includes(m) ? m : 9;
    });

    const [progresoMensual, setProgresoMensual] = useState(() => {
        const found = objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado);
        return found?.progreso || 0;
    });

    const [comentario, setComentario] = useState(() => {
        const found = objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado);
        return found?.comentario || "";
    });
    
    const [archivo, setArchivo] = useState(null);
    const [subiendo, setSubiendo] = useState(false);

    // ─── Lógica de bloqueo de meses futuros ────────────────────────────────────
    const isFuture = (m) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        const itemYear = m >= 9 ? fiscalYear : fiscalYear + 1;
        
        if (itemYear > currentYear) return true;
        if (itemYear === currentYear && m > currentMonth) return true;
        return false;
    };

    // ─── Cálculos de acumulación ──────────────────────────────────────────────
    const historialPrevio = useMemo(() => {
        return (objetivo.seguimientoMensual || []).sort((a, b) => {
            return FISCAL_MONTH_ORDER.indexOf(a.mes) - FISCAL_MONTH_ORDER.indexOf(b.mes);
        });
    }, [objetivo]);

    const acumuladoSinActual = useMemo(() => {
        return historialPrevio
            .filter(s => s.mes !== mesSeleccionado)
            .reduce((sum, s) => sum + (s.progreso || 0), 0);
    }, [historialPrevio, mesSeleccionado]);

    const totalProyectado = acumuladoSinActual + (Number(progresoMensual) || 0);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleMesChange = (newMes) => {
        const m = Number(newMes);
        setMesSeleccionado(m);
        const existing = objetivo.seguimientoMensual?.find(s => s.mes === m);
        setProgresoMensual(existing?.progreso || 0);
        setComentario(existing?.comentario || "");
        setArchivo(null);
    };

    const handleGuardar = async () => {
        if (totalProyectado > 100) {
            toast.error("El progreso total acumulado no puede superar el 100%.");
            return;
        }

        setSubiendo(true);
        try {
            let filename = objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado)?.adjunto || null;

            // Si hay un archivo nuevo, subirlo primero
            if (archivo) {
                const fd = new FormData();
                fd.append("archivo", archivo);
                const data = await api(`/objetivos-iso/${objetivo._id}/mes/${mesSeleccionado}/adjunto`, {
                    method: "POST",
                    body: fd
                });
                filename = data.filename;
            }

            // Construir el nuevo array de seguimiento
            const nuevoSeguimiento = [...(objetivo.seguimientoMensual || [])];
            const index = nuevoSeguimiento.findIndex(s => s.mes === mesSeleccionado);
            
            const entry = {
                mes: mesSeleccionado,
                year: mesSeleccionado >= 9 ? fiscalYear : fiscalYear + 1,
                progreso: Number(progresoMensual),
                comentario: comentario.trim(),
                adjunto: filename
            };

            if (index >= 0) {
                nuevoSeguimiento[index] = entry;
            } else {
                nuevoSeguimiento.push(entry);
            }

            onGuardar({
                progreso: totalProyectado,
                desarrollo: comentario.trim() || objetivo.desarrollo,
                seguimientoMensual: nuevoSeguimiento
            });
        } catch (err) {
            toast.error(err.message || "Error al guardar el avance");
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 p-2">
            {/* Cabecera Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <Info className="text-blue-600 shrink-0 mt-0.5" size={18} />
                <div className="text-xs text-blue-800 leading-relaxed">
                    <p className="font-bold mb-1">Carga Acumulativa Mensual</p>
                    <p>Selecciona un mes para cargar su avance correspondiente. El progreso de cada mes se suma al total del objetivo.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lado Izquierdo: Formulario */}
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase tracking-wide">Seleccionar Mes</label>
                        <select
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={mesSeleccionado}
                            onChange={(e) => handleMesChange(e.target.value)}
                        >
                            {FISCAL_MONTH_ORDER.map(m => (
                                <option key={m} value={m} disabled={isFuture(m)}>
                                    {MONTH_NAMES[m]} {m >= 9 ? fiscalYear : fiscalYear + 1} {isFuture(m) ? " (Bloqueado)" : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase tracking-wide">Avance del Mes (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-lg"
                                value={progresoMensual}
                                onChange={(e) => setProgresoMensual(e.target.value)}
                                placeholder="0"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                        </div>
                        {totalProyectado > 100 && (
                            <p className="text-[10px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                                <AlertTriangle size={12} /> Supera el límite del 100%
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase tracking-wide">Justificación / Evidencia</label>
                        <textarea
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px] resize-none"
                            placeholder="Describe los logros o evidencias de este mes..."
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                        />
                    </div>

                    {/* Adjunto */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase tracking-wide">Evidencia / Adjunto (Opcional)</label>
                        {!archivo ? (
                            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all group">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Paperclip size={24} className="text-slate-400 group-hover:text-blue-500 mb-2 transition-colors" />
                                    <p className="text-[10px] text-slate-500 font-medium">Haga clic para subir (PDF, DOCX, Imágenes)</p>
                                </div>
                                <input type="file" className="hidden" onChange={(e) => setArchivo(e.target.files[0])} />
                            </label>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg animate-in fade-in zoom-in duration-200">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="p-1.5 bg-blue-600 rounded text-white shrink-0">
                                        <FileText size={14} />
                                    </div>
                                    <span className="text-xs font-bold text-blue-900 truncate">{archivo.name}</span>
                                </div>
                                <button onClick={() => setArchivo(null)} className="p-1 hover:bg-blue-100 rounded-full text-blue-600 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                        )}
                        {objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado)?.adjunto && !archivo && (
                            <p className="text-[9px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                                <Paperclip size={10} /> Ya existe un archivo cargado. Subir uno nuevo lo reemplazará.
                            </p>
                        )}
                    </div>
                </div>

                {/* Lado Derecho: Resumen y Estado */}
                <div className="bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-5 flex flex-col gap-5">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={14} /> Resumen de Carga
                    </h3>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Historial previo:</span>
                            <span className="font-bold text-slate-700">{acumuladoSinActual}%</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Carga actual ({MONTH_NAMES[mesSeleccionado].slice(0,3)}):</span>
                            <span className="font-bold text-blue-600">+{progresoMensual || 0}%</span>
                        </div>
                        <div className="h-px bg-slate-200 my-2" />
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block leading-none mb-1">Progreso Total</span>
                                <span className={`text-3xl font-black ${totalProyectado > 100 ? 'text-rose-600' : 'text-slate-900'}`}>
                                    {totalProyectado}%
                                </span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-500 text-right opacity-60">
                                Máx. permitido: 100%
                            </div>
                        </div>
                    </div>

                    {/* Mini Historial */}
                    <div className="mt-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Cargas registradas:</p>
                        <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                            {historialPrevio.length > 0 ? (
                                historialPrevio.map(s => (
                                    <div key={s.mes} className="flex justify-between items-center text-[10px] bg-white border border-slate-100 rounded-md px-2 py-1.5 shadow-sm">
                                        <span className="font-bold text-slate-600">{MONTH_NAMES[s.mes]}</span>
                                        <span className="bg-blue-50 text-blue-700 px-1.5 rounded font-black">+{s.progreso}%</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-[10px] italic text-slate-400">Sin cargas previas.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-2">
                <Button variant="outline" onClick={onCancelar}>
                    Cancelar
                </Button>
                <Button 
                    onClick={handleGuardar} 
                    disabled={totalProyectado > 100 || subiendo}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                    {subiendo ? "Guardando..." : "Guardar Avance"}
                </Button>
            </div>
        </div>
    );
}
