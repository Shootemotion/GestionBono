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

    const [resultadoMes, setResultadoMes] = useState(() => {
        const found = objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado);
        return found?.resultadoMes || 0;
    });

    const [comentario, setComentario] = useState(() => {
        const found = objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado);
        return found?.comentario || "";
    });
    
    const [archivo, setArchivo] = useState(null);
    const [subiendo, setSubiendo] = useState(false);
    const [expandedMonth, setExpandedMonth] = useState(mesSeleccionado);

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

    const mesesDisponibles = useMemo(() => {
        return FISCAL_MONTH_ORDER.map((m) => {
            const existing = objetivo.seguimientoMensual?.find(s => s.mes === m);
            return {
                mes: m,
                label: MONTH_NAMES[m].slice(0, 3),
                year: m >= 9 ? fiscalYear : fiscalYear + 1,
                existing,
                disabled: isFuture(m),
            };
        });
    }, [objetivo, fiscalYear]);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleMesChange = (newMes) => {
        const m = Number(newMes);
        setMesSeleccionado(m);
        const existing = objetivo.seguimientoMensual?.find(s => s.mes === m);
        setProgresoMensual(existing?.progreso || 0);
        setResultadoMes(existing?.resultadoMes || 0);
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
                resultadoMes: Number(resultadoMes),
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
        <div className="flex flex-col gap-0 h-full">
            {/* Header del Modal */}
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-blue-25">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                        <TrendingUp size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-900">Registrar Avance Mensual</h2>
                        <p className="text-sm text-slate-600 mt-0.5">{objetivo.nombre}</p>
                    </div>
                </div>
            </div>

            {/* Contenido Scrollable */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">

                    {/* 1️⃣ Selección de Mes - Calendario Visual */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                            <label className="text-sm font-bold text-slate-900">Selecciona el Mes</label>
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {mesesDisponibles.map((item) => {
                                const progreso = item.existing?.progreso ?? 0;
                                const isSelected = mesSeleccionado === item.mes;
                                return (
                                    <button
                                        key={item.mes}
                                        type="button"
                                        disabled={item.disabled}
                                        onClick={() => handleMesChange(item.mes)}
                                        className={`rounded-lg p-2.5 text-center transition-all border-2 ${
                                            item.disabled
                                                ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                                                : isSelected
                                                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-200'
                                                : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                                        }`}
                                    >
                                        <div className="text-xs font-bold text-slate-900">{item.label}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">{item.year}</div>
                                        {item.existing && (
                                            <div className="mt-1 text-[10px] font-black bg-emerald-50 text-emerald-700 rounded px-1">
                                                ✓{progreso}%
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2️⃣ Progreso y Resultado - Side by Side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-2 block uppercase">Avance del Mes</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={progresoMensual}
                                    onChange={(e) => setProgresoMensual(e.target.value)}
                                    placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">%</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1.5">Porcentaje cumplido este mes</p>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-2 block uppercase">Resultado del Mes</label>
                            <input
                                type="number"
                                step="0.01"
                                className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={resultadoMes}
                                onChange={(e) => setResultadoMes(e.target.value)}
                                placeholder="0"
                            />
                            <p className="text-[11px] text-slate-500 mt-1.5">Valor numérico alcanzado</p>
                        </div>
                    </div>

                    {/* Validación de Meta - Compacta */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">Meta:</span>
                            <span className="font-bold text-slate-900">{objetivo.meta}{objetivo.unidadMeta ? ` ${objetivo.unidadMeta}` : ''}</span>
                            <span className="font-bold text-slate-700 ml-2">{objetivo.operador}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">Resultado:</span>
                            <span className="font-bold text-slate-900">{resultadoMes || 0}{objetivo.unidadMeta ? ` ${objetivo.unidadMeta}` : ''}</span>
                        </div>
                        <div>
                            {(() => {
                                const result = Number(resultadoMes) || 0;
                                const meta = objetivo.meta;
                                let cumple = false;
                                if (objetivo.operador === ">") cumple = result > meta;
                                else if (objetivo.operador === "=") cumple = result === meta;
                                else if (objetivo.operador === "<") cumple = result < meta;
                                return (
                                    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
                                        cumple 
                                            ? 'bg-emerald-100 text-emerald-700' 
                                            : 'bg-orange-100 text-orange-700'
                                    }`}>
                                        {cumple ? '✓ Cumple' : '✗ No cumple'}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>



                    {/* 3️⃣ Comentario / Justificación */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-2 block uppercase">Comentario / Justificación</label>
                        <textarea
                            className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            placeholder="Describe los logros, desafíos o evidencias de este mes..."
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                            rows={4}
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5">Máximo 500 caracteres</p>
                    </div>

                    {/* 4️⃣ Adjunto - Mejorado */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-2 block uppercase">Evidencia / Adjunto</label>
                        {!archivo ? (
                            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer bg-blue-50 hover:bg-blue-100 transition-all group">
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Paperclip size={28} className="text-blue-400 group-hover:text-blue-600 mb-2 transition-colors" />
                                    <p className="text-sm font-semibold text-blue-900">Arrastra un archivo aquí</p>
                                    <p className="text-xs text-blue-700 mt-0.5">o haz clic para seleccionar</p>
                                    <p className="text-[10px] text-blue-600 mt-1.5">PDF, DOCX, JPG, PNG</p>
                                </div>
                                <input type="file" className="hidden" onChange={(e) => setArchivo(e.target.files[0])} />
                            </label>
                        ) : (
                            <div className="flex items-center justify-between p-4 bg-emerald-50 border-2 border-emerald-200 rounded-lg animate-in fade-in zoom-in duration-200">
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className="p-2 bg-emerald-600 rounded text-white shrink-0">
                                        <FileText size={16} />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-bold text-emerald-900 truncate">{archivo.name}</p>
                                        <p className="text-[10px] text-emerald-700">{(archivo.size / 1024).toFixed(2)} KB</p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setArchivo(null)} 
                                    className="p-1.5 hover:bg-emerald-200 rounded-full text-emerald-600 transition-colors shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        )}
                        {objetivo.seguimientoMensual?.find(s => s.mes === mesSeleccionado)?.adjunto && !archivo && (
                            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                                <p className="font-semibold">ℹ️ Archivo existente</p>
                                <p className="mt-1">Ya existe un archivo cargado. Subir uno nuevo lo reemplazará.</p>
                            </div>
                        )}
                    </div>

                    {/* Advertencia de límite */}
                    {totalProyectado > 100 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                            <p className="text-xs font-semibold text-red-800">El progreso total no puede superar el 100%</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Botones */}
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end gap-3">
                <Button 
                    variant="outline" 
                    onClick={onCancelar}
                    className="font-semibold"
                >
                    Cancelar
                </Button>
                <Button 
                    onClick={handleGuardar} 
                    disabled={totalProyectado > 100 || subiendo}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                    <TrendingUp size={16} className="mr-2" />
                    {subiendo ? "Guardando..." : "Guardar Avance"}
                </Button>
            </div>
        </div>
    );
}
