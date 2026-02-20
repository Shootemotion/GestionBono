// src/components/FormularioObjetivoISO.jsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";

export default function FormularioObjetivoISO({ initialData = null, onGuardar, onCancelar, defaultYear }) {
    const currentFiscal = getCurrentFiscalYear();
    const [codigo, setCodigo] = useState(initialData?.codigo || "");
    const [nombre, setNombre] = useState(initialData?.nombre || "");
    const [descripcion, setDescripcion] = useState(initialData?.descripcion || "");
    const [year, setYear] = useState(initialData?.year || defaultYear || currentFiscal);
    const [activo, setActivo] = useState(initialData?.activo ?? true);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const inputCls =
        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
        if (!year) errs.year = "El año fiscal es obligatorio.";
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            await onGuardar({
                codigo: codigo.trim(),
                nombre: nombre.trim(),
                descripcion: descripcion.trim(),
                year: Number(year),
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
                    <label className="text-xs font-medium mb-1 block">Código</label>
                    <input
                        className={inputCls}
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value)}
                        placeholder="ej: OBJ-01"
                    />
                </div>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Nombre *</label>
                    <input
                        className={inputCls}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="ej: Gestión del Proceso Preanalítico"
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

            {/* Descripción */}
            <div>
                <label className="text-xs font-medium mb-1 block">Descripción (opcional)</label>
                <textarea
                    className="w-full min-h-[72px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Descripción del objetivo ISO..."
                />
            </div>

            {/* Estado */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="activo-iso"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="accent-blue-600"
                />
                <label htmlFor="activo-iso" className="text-sm cursor-pointer">Activo</label>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={onCancelar} disabled={submitting}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Guardando…" : initialData ? "Guardar cambios" : "Crear objetivo"}
                </Button>
            </div>
        </form>
    );
}
