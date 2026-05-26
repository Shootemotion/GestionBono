// src/components/FormularioObjetivoISO.jsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentFiscalYear } from "@/lib/scoreHelpers";
import { api } from "@/lib/api";

export default function FormularioObjetivoISO({ initialData = null, onGuardar, onCancelar, defaultYear, procesosDisponibles = [], readOnly = false }) {
    const currentFiscal = getCurrentFiscalYear();
    const [codigo, setCodigo] = useState(initialData?.codigo || "");
    const [nombre, setNombre] = useState(initialData?.nombre || "");
    const [descripcion, setDescripcion] = useState(initialData?.descripcion || "");
    const [year, setYear] = useState(initialData?.year || defaultYear || currentFiscal);
    const [activo, setActivo] = useState(initialData?.activo ?? true);
    const [meta, setMeta] = useState(initialData?.meta ?? 80);
    const [unidadMeta, setUnidadMeta] = useState(initialData?.unidadMeta ?? "");
    const [operador, setOperador] = useState(initialData?.operador ?? ">");
    const [desarrollo, setDesarrollo] = useState(initialData?.desarrollo || "");

    // Nuevo estado para Representante y Lista de Empleados
    const [representante, setRepresentante] = useState(initialData?.representante?._id || initialData?.representante || "");
    const [empleados, setEmpleados] = useState([]);
    const [loadingEmpleados, setLoadingEmpleados] = useState(false);

    // Estado para los procesos seleccionados
    const [selectedProcesos, setSelectedProcesos] = useState(() => {
        if (!initialData?._id || !procesosDisponibles) return [];
        // Filtrar los procesos que tengan asignado este objetivo
        return procesosDisponibles
            .filter(p => {
                 const refs = p.objetivosISO || [];
                 return refs.some(ref => ref === initialData._id || ref?._id === initialData._id);
            })
            .map(p => p._id);
    });

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
        `w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${readOnly ? 'opacity-80 bg-slate-100 cursor-not-allowed text-slate-600' : 'bg-background'}`;

    const operadorDescriptions = {
        ">": "Cumple si el resultado es mayor que la meta. Ej: resultado 85 > meta 80 → Cumple.",
        "=": "Cumple si el resultado es igual a la meta. Ej: resultado 80 = meta 80 → Cumple.",
        "<": "Cumple si el resultado es menor que la meta. Ej: resultado 70 < meta 80 → Cumple.",
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
        if (!year) errs.year = "El año fiscal es obligatorio.";
        // Representante opcional en edición: solo requerido al crear nuevo objetivo
        if (!initialData && !representante) errs.representante = "El representante es obligatorio para un nuevo objetivo.";

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
                procesos: selectedProcesos,
                meta,
                unidadMeta,
                operador,
                desarrollo: desarrollo.trim(),
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
                        disabled={readOnly}
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
                        disabled={readOnly}
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
                    disabled={readOnly}
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
                    onFocus={() => { if (!readOnly) setShowDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    disabled={loadingEmpleados || readOnly}
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
                    className={`${inputCls} min-h-[72px] resize-none`}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Descripción del objetivo ISO..."
                    disabled={readOnly}
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
                    disabled={readOnly}
                />
                <label htmlFor="activo-iso" className="text-sm cursor-pointer">Activo</label>
            </div>

            {/* Procesos Vinculados */}
            <div className="pt-2">
                <label className="text-xs font-medium mb-2 block">Procesos Vinculados (Opcional)</label>
                {procesosDisponibles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-md p-2 bg-slate-50/50">
                        {procesosDisponibles.map(proc => {
                            const isChecked = selectedProcesos.includes(proc._id);
                            return (
                                <label key={proc._id} className={`flex items-start gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${isChecked ? 'bg-blue-50' : 'hover:bg-slate-100'}`}>
                                    <input
                                        type="checkbox"
                                        className={`mt-1 accent-blue-600 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                                        checked={isChecked}
                                        disabled={readOnly}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedProcesos(prev => [...prev, proc._id]);
                                            } else {
                                                setSelectedProcesos(prev => prev.filter(id => id !== proc._id));
                                            }
                                        }}
                                    />
                                    <div className="text-xs flex-1 leading-tight">
                                        <span className="font-semibold block">{proc.codigo}</span>
                                        <span className="text-muted-foreground">{proc.nombre}</span>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 italic px-1 py-2 border rounded-md bg-slate-50">
                        No hay procesos disponibles para este año fiscal.
                    </div>
                )}
            </div>

            {/* Meta de Avance y Desarrollo (Trasladados al final) */}
            <div className="grid gap-3 mt-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                {/* Compact: Meta libre, Unidad y Operador con explicación */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                    <div>
                        <label className="text-[11px] font-bold text-blue-900 mb-1 block uppercase tracking-wide">Meta objetivo (valor libre)</label>
                        <input
                            type="number"
                            step="0.01"
                            className={`${inputCls} border-blue-200 focus-visible:ring-blue-300 font-bold text-blue-800 max-w-[180px]`}
                            value={meta}
                            onChange={(e) => setMeta(Number(e.target.value))}
                            disabled={readOnly}
                            placeholder="Ej: 80"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Valor libre para la meta (porcentaje o unidades)</p>
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-blue-900 mb-1 block uppercase tracking-wide">Unidad de medida (opcional)</label>
                        <input
                            type="text"
                            className={`${inputCls} border-blue-200 focus-visible:ring-blue-300 max-w-[220px]`}
                            value={unidadMeta}
                            onChange={(e) => setUnidadMeta(e.target.value)}
                            disabled={readOnly}
                            placeholder="%, unidades, horas..."
                        />
                        <p className="text-[10px] text-blue-700 mt-1">Cómo se mide la meta</p>
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-blue-900 mb-1 block uppercase tracking-wide">Operador (resultado vs meta)</label>
                        <select
                            className={`${inputCls} border-blue-200 focus-visible:ring-blue-300 font-bold text-blue-800 max-w-[160px]`}
                            value={operador}
                            onChange={(e) => setOperador(e.target.value)}
                            disabled={readOnly}
                        >
                            <option value=">">Mayor que (&gt;)</option>
                            <option value="=">Igual a (=)</option>
                            <option value="<">Menor que (&lt;)</option>
                        </select>
                        <p className="text-[10px] text-slate-600 mt-1">{operadorDescriptions[operador]}</p>
                    </div>
                </div>

                {/* Desarrollo */}
                <div>
                    <label className="text-[11px] font-bold text-blue-900 mb-1 block uppercase tracking-wide">Motivo / Desarrollo del Avance</label>
                    <textarea
                        disabled={readOnly}
                        className={`${inputCls} min-h-[72px] resize-none border-blue-200 focus-visible:ring-blue-300`}
                        value={desarrollo}
                        onChange={(e) => setDesarrollo(e.target.value)}
                        placeholder="Evidencia o justificación del progreso..."
                    />
                </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                <Button type="button" variant="outline" onClick={onCancelar} disabled={submitting}>
                    {readOnly ? "Cerrar ventana" : "Cancelar"}
                </Button>
                {!readOnly && (
                    <Button type="submit" disabled={submitting}>
                        {submitting ? "Guardando…" : initialData ? "Guardar cambios" : "Crear objetivo"}
                    </Button>
                )}
            </div>
        </form>
    );
}
