// src/components/FormularioObjetivoISO.jsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { api } from "@/lib/api";

export default function FormularioObjetivoISO({ initialData = null, onGuardar, onCancelar, defaultYear }) {
    const currentFiscal = getCurrentFiscalYear();
    const [codigo, setCodigo] = useState(initialData?.codigo || "");
    const [nombre, setNombre] = useState(initialData?.nombre || "");
    const [descripcion, setDescripcion] = useState(initialData?.descripcion || "");
    const [year, setYear] = useState(initialData?.year || defaultYear || currentFiscal);
    const [activo, setActivo] = useState(initialData?.activo ?? true);


    // Nuevo estado para Representante y Lista de Empleados
    const [representante, setRepresentante] = useState(initialData?.representante?._id || initialData?.representante || "");
    const [empleados, setEmpleados] = useState([]);
    const [loadingEmpleados, setLoadingEmpleados] = useState(false);

    // Estados para el buscador
    const [searchRep, setSearchRep] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    // Cargar empleados para el selector
    useEffect(() => {
        let isMounted = true;
        const fetchEmpleados = async () => {
            setLoadingEmpleados(true);
            try {
                const res = await api("/empleados?pageSize=500&visibility=all");
                if (isMounted) {
                    setEmpleados(res?.items || res || []);
                }
            } catch (err) {
                console.error("Error cargando empleados", err);
            } finally {
                if (isMounted) setLoadingEmpleados(false);
            }
        };
        fetchEmpleados();
        return () => { isMounted = false; };
    }, []);

    // Inicializar el texto de búsqueda si ya hay un representante seleccionado (e.g. en edición)
    useEffect(() => {
        if (empleados.length > 0 && representante) {
            const emp = empleados.find(e => e._id === representante);
            if (emp) setSearchRep(`${emp.apellido}, ${emp.nombre}`);
        }
    }, [representante, empleados]);

    const inputCls =
        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
        if (!year) errs.year = "El año fiscal es obligatorio.";
        if (!representante) errs.representante = "El representante es obligatorio.";

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
                representante: representante || null,
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

            {/* Representante */}
            <div className="relative">
                <label className="text-xs font-medium mb-1 block">Representante de Calidad *</label>
                <input
                    type="text"
                    className={`${inputCls} ${errors.representante ? 'border-red-500' : ''}`}
                    placeholder="Buscar por apellido, nombre o legajo..."
                    value={showDropdown ? searchRep : (empleados.find(e => e._id === representante) ? `${empleados.find(e => e._id === representante).apellido}, ${empleados.find(e => e._id === representante).nombre}` : searchRep)}
                    onChange={(e) => {
                        setSearchRep(e.target.value);
                        setShowDropdown(true);
                        if (e.target.value === "") setRepresentante("");
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    disabled={loadingEmpleados}
                />
                {loadingEmpleados && <p className="mt-1 text-[10px] text-muted-foreground">Cargando nómina...</p>}
                {errors.representante && <p className="mt-1 text-xs text-red-600">{errors.representante}</p>}

                {showDropdown && empleados.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-48 overflow-y-auto">
                        {empleados
                            .filter(emp => `${emp.apellido} ${emp.nombre} ${emp.legajo || ''}`.toLowerCase().includes(searchRep.toLowerCase()))
                            .map(emp => (
                                <div
                                    key={emp._id}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 border-b border-slate-50 last:border-0 ${representante === emp._id ? 'bg-blue-50 font-medium' : ''}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Evita que el onBlur del input se dispare antes
                                        setRepresentante(emp._id);
                                        setShowDropdown(false);
                                        setSearchRep(`${emp.apellido}, ${emp.nombre}`);
                                    }}
                                >
                                    {emp.apellido}, {emp.nombre} {emp.legajo ? <span className="text-muted-foreground text-xs ml-1">({emp.legajo})</span> : ''}
                                </div>
                            ))}
                        {empleados.filter(emp => `${emp.apellido} ${emp.nombre} ${emp.legajo || ''}`.toLowerCase().includes(searchRep.toLowerCase())).length === 0 && (
                            <div className="px-3 py-2 text-sm text-slate-500 italic">No se encontraron empleados</div>
                        )}
                    </div>
                )}
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
