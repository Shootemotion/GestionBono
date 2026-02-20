// src/components/FormularioProceso.jsx
// Modal para crear/editar un ProcesoISO.
// Los procesos creados aquí aparecen automáticamente en el select
// de Proceso al crear/editar una Plantilla.
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";

export default function FormularioProceso({ initialData = null, onGuardar, onCancelar, defaultYear }) {
    const currentFiscal = getCurrentFiscalYear();
    const [codigo, setCodigo] = useState(initialData?.codigo || "");
    const [nombre, setNombre] = useState(initialData?.nombre || "");
    const [descripcion, setDescripcion] = useState(initialData?.descripcion || "");
    const [year, setYear] = useState(initialData?.year || defaultYear || currentFiscal);
    const [objetivoISOId, setObjetivoISOId] = useState(initialData?.objetivoISOId?._id || initialData?.objetivoISOId || "");
    const [activo, setActivo] = useState(initialData?.activo ?? true);
    const [objetivos, setObjetivos] = useState([]);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const inputCls =
        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

    useEffect(() => {
        // Cargar objetivos del mismo año fiscal para el select
        api(`/objetivos-iso?year=${year}`).then((data) => {
            if (Array.isArray(data)) setObjetivos(data);
        }).catch(() => { });
    }, [year]);

    // Preview del fullName que se guardará en Plantilla.proceso
    const preview = codigo.trim() && nombre.trim()
        ? `${codigo.trim().toUpperCase()} - ${nombre.trim()}`
        : "";

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!codigo.trim()) errs.codigo = "El código es obligatorio.";
        if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            await onGuardar({
                codigo: codigo.trim().toUpperCase(),
                nombre: nombre.trim(),
                descripcion: descripcion.trim(),
                year: Number(year),
                objetivoISOId: objetivoISOId || null,
                activo,
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-2">

            {/* Código + Nombre */}
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs font-medium mb-1 block">Código *</label>
                    <input
                        className={inputCls}
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value)}
                        placeholder="ej: P16"
                        required
                    />
                    {errors.codigo && <p className="mt-1 text-xs text-red-600">{errors.codigo}</p>}
                </div>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Nombre *</label>
                    <input
                        className={inputCls}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="ej: Nuevas Tecnologías"
                        required
                    />
                    {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre}</p>}
                </div>
            </div>

            {/* Año fiscal */}
            <div>
                <label className="text-xs font-medium mb-1 block">Año fiscal *</label>
                <select
                    className={inputCls}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    required
                >
                    {[2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                        <option key={y} value={y}>{y}–{y + 1}</option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">Sep {year} – Ago {Number(year) + 1}</p>
            </div>

            {/* Preview del fullName */}
            {preview && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
                    <span className="text-xs text-blue-500 font-medium block mb-0.5">Valor en plantillas:</span>
                    <span className="font-mono font-semibold text-blue-800">{preview}</span>
                    <p className="text-[10px] text-blue-400 mt-1">
                        Este texto debe coincidir exactamente con el campo "Proceso" al crear una plantilla.
                    </p>
                </div>
            )}

            {/* Descripción */}
            <div>
                <label className="text-xs font-medium mb-1 block">Descripción (opcional)</label>
                <textarea
                    className="w-full min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Descripción del proceso..."
                />
            </div>

            {/* Objetivo ISO */}
            <div>
                <label className="text-xs font-medium mb-1 block">Objetivo ISO asociado</label>
                <select
                    className={inputCls}
                    value={objetivoISOId}
                    onChange={(e) => setObjetivoISOId(e.target.value)}
                >
                    <option value="">— Sin objetivo asignado —</option>
                    {objetivos.map((o) => (
                        <option key={o._id} value={o._id}>
                            {o.codigo ? `[${o.codigo}] ` : ""}{o.nombre}
                        </option>
                    ))}
                </select>
            </div>

            {/* Estado */}
            <div className="flex items-center gap-2">
                <input type="checkbox" id="activo-proc" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-blue-600" />
                <label htmlFor="activo-proc" className="text-sm cursor-pointer">Activo</label>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={onCancelar} disabled={submitting}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Guardando…" : initialData ? "Guardar cambios" : "Crear proceso"}
                </Button>
            </div>
        </form>
    );
}
