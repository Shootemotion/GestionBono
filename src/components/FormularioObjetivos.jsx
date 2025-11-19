// src/components/FormularioObjetivos.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function FormularioObjetivos({
  initialData = null,
  initialYear,
  initialScopeType,
  initialScopeId,
  areas = [],
  sectores = [],
  empleados = [],
  onSaved,
  onCancelar,
  onSaveAndContinue,
}) {
  const isEdit = !!initialData?._id;
  const currentYear = new Date().getFullYear();

  // Base
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proceso, setProceso] = useState("");
  const [year, setYear] = useState(initialYear || currentYear);
  const [scopeType, setScopeType] = useState(initialScopeType || "area"); // "area" | "sector" | "empleado"
  const [scopeId, setScopeId] = useState(initialScopeId || "");
  const [frecuencia, setFrecuencia] = useState("anual");

  const [peso, setPeso] = useState(0);
const MAX_LIST = 2000; // ajustá a gusto
  // Metas
  const [metas, setMetas] = useState([]);

  // envío/errores
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // búsqueda empleados (autocomplete)
  const [empQuery, setEmpQuery] = useState("");
  const [empOpen, setEmpOpen] = useState(false);
  const empBoxRef = useRef(null);


  
const selectedEmpleado = useMemo(
   () => {
     const lista = Array.isArray(empleados) ? empleados : [];
     const sid = scopeId != null ? String(scopeId) : "";
     return lista.find(e => String(e?._id ?? e?.id) === sid) || null;
   },
   [scopeId, empleados]
 );

  const empleadosFiltrados = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return empleados.slice(0, MAX_LIST);
    return empleados
      .filter((e) => {
        const n = `${e?.apellido ?? ""} ${e?.nombre ?? ""}`.toLowerCase();
        const a = (e?.apodo ?? "").toLowerCase();
        return n.includes(q) || a.includes(q);
      })
      .slice(0, MAX_LIST);
  }, [empQuery, empleados]);

  // Cargar initialData
  useEffect(() => {
  if (!initialData) return;

  setNombre(initialData.nombre || "");
  setDescripcion(initialData.descripcion || "");
  setProceso(initialData.proceso || "");
  setYear(initialData.year || currentYear);

  const apiScope = initialData.scopeType || "area";
  setScopeType(apiScope);

  setScopeId(
    apiScope === "area"
      ? initialData.areaId || initialData.scopeId || ""
      : apiScope === "sector"
      ? initialData.sectorId || initialData.scopeId || ""
      : initialData.empleadoId || initialData.scopeId || ""
  );

  setFrecuencia(initialData.frecuencia || "anual");
  setPeso(initialData.pesoBase ?? initialData.peso ?? 0);

  setMetas(
    Array.isArray(initialData.metas)
      ? initialData.metas.map((m) => ({
          nombre: m.nombre || "",
          target: m.target ?? "",
          unidad: m.unidad || "Porcentual",
          operador: m.operador || ">=",
        }))
      : []
  );

  // Override de cierre fiscal
  setUsarFechaCierreCustom(!!initialData.fechaCierreCustom);
  setFechaCierre(
    initialData.fechaCierre
      ? String(initialData.fechaCierre).slice(0, 10)
      : ""
  );
}, [initialData]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (empBoxRef.current && !empBoxRef.current.contains(e.target)) {
        setEmpOpen(false);
      }
    }
    if (empOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [empOpen]);

  // Metas helpers
  const handleAddMeta = () =>
    setMetas((m) => [...m, { nombre: "", target: "", unidad: "Porcentual", operador: ">=" }]);

  const handleMetaChange = (idx, field, value) =>
    setMetas((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );

  const handleRemoveMeta = (idx) =>
    setMetas((prev) => prev.filter((_, i) => i !== idx));

  // Errores
  const pickMessage = (err) => {
    const status = err?.status || err?.response?.status;
    const data = err?.data || err?.response?.data;
    const msg =
      data?.message || data?.error || err?.message || "Error desconocido";
    return { status, message: msg, raw: err, data };
  };


  

  const validateClient = () => {
    const errs = {};
    if (!scopeId) {
      errs.scopeId =
        scopeType === "empleado"
          ? "Seleccioná un empleado."
          : "Seleccioná un área o sector.";
    }
    if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (!proceso.trim()) errs.proceso = "El campo Proceso es obligatorio.";
  
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit
  const handleSubmit = async (e, opts = { seguir: false }) => {
    e.preventDefault();
    setFieldErrors({});

    if (!validateClient()) {
      toast.error("Revisá los campos marcados.");
      return;
    }

    // limpiar metas vacías y castear target si es numérico
    const metasClean = (metas || [])
      .map((m) => ({
        nombre: (m.nombre || "").trim(),
        target:
          m.target === "" || m.target == null
            ? null
            : isNaN(+m.target)
            ? m.target
            : Number(m.target),
        unidad: (m.unidad || "").trim(),
        operador: m.operador || ">=",
      }))
      .filter((m) => m.nombre || m.target !== null || m.unidad);

    // el backend usa los mismos literales para scopeType
    const body = {
  tipo: "objetivo",
  year: Number(year),
  scopeType,
  scopeId,
  nombre,
  descripcion,
  proceso,
  frecuencia,
  pesoBase: Number(peso || 0),
  activo: true,
};

if (usarFechaCierreCustom && fechaCierre) {
  body.fechaCierre = new Date(fechaCierre);
  body.fechaCierreCustom = true;
}

    if (metasClean.length > 0) body.metas = metasClean;

    setIsSubmitting(true);
    try {
      const saved = isEdit
        ? await api(`/templates/${initialData._id}`, { method: "PUT", body })
        : await api("/templates", { method: "POST", body });

      toast.success(isEdit ? "Objetivo actualizado" : "Objetivo creado");
      if (opts.seguir && !isEdit) onSaveAndContinue?.(saved);
      else onSaved?.(saved);
    } catch (err) {
      const info = pickMessage(err);
      if (info?.data?.errors && typeof info.data.errors === "object") {
        setFieldErrors(info.data.errors);
      }
      const prefix =
        info.status >= 500
          ? "Error del servidor"
          : info.status >= 400
          ? "Datos inválidos"
          : "No se pudo guardar";
      toast.error(`${prefix}: ${info.message}`);

      console.groupCollapsed(
        `[FormObjetivos] Falló el submit (${info.status ?? "sin status"})`
      );
      console.log("Payload enviado:", body);
      console.log("Respuesta .data:", info?.data);
      console.log("Respuesta .raw:", info?.raw);
      console.error("Error completo:", err);
      console.groupEnd();
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const pill =
    "inline-flex items-center h-6 px-2 rounded-full text-[11px] ring-1 bg-accent/40 ring-border/60";

  const FieldError = ({ name }) =>
    fieldErrors?.[name] ? (
      <p className="mt-1 text-xs text-red-600">{String(fieldErrors[name])}</p>
    ) : null;

     // Opciones “Proceso” (igual que en Aptitudes)
  const PROCESOS = [
    { value: "", label: "Seleccioná un proceso…" },
    { value: "Económico", label: "Económico" },
    { value: "Gestión", label: "Gestión" },
    { value: "Organizacional", label: "Organizacional" },
  ];

  const [usarFechaCierreCustom, setUsarFechaCierreCustom] = useState(false);
const [fechaCierre, setFechaCierre] = useState("");
  return (
    <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IZQUIERDA */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">🎯 Objetivo</h3>
            <span className={pill}>Año: {year}</span>
          </div>

          <div>
            <label className="text-xs">Nombre</label>
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Comunicación con clientes"
              required
            />
            <FieldError name="nombre" />
          </div>


   <div>
    <label className="text-xs">Proceso</label>
    <select
      className={inputCls}
     value={proceso}
      onChange={(e) => setProceso(e.target.value)}
      required
    >
      {PROCESOS.map((p) => (
        <option key={p.value || "blank"} value={p.value}>{p.label}</option>
      ))}
    </select>
    <FieldError name="proceso" />
  </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs">Peso (%)</label>
              <input
                type="number"
                className={inputCls}
                value={peso}
                min={0}
                max={100}
                onChange={(e) => setPeso(Number(e.target.value))}
              />
              <FieldError name="peso" />
            </div>
            <div>
              <label className="text-xs">Frecuencia</label>
              <select
                className={inputCls}
                value={frecuencia}
                onChange={(e) => setFrecuencia(e.target.value)}
              >
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
              <FieldError name="frecuencia" />
            </div>
          </div>
<div>
  <label className="text-xs flex items-center gap-2">
    <input
      type="checkbox"
      checked={usarFechaCierreCustom}
      onChange={(e) => setUsarFechaCierreCustom(e.target.checked)}
    />
    Fecha de cierre diferente al 31/08 del año fiscal
  </label>

  {usarFechaCierreCustom && (
    <input
      type="date"
      className={inputCls}
      value={fechaCierre}
      onChange={(e) => setFechaCierre(e.target.value)}
    />
  )}
</div>
        
        </div>

        {/* DERECHA - Configuración */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold">⚙️ Configuración</h3>

          <div>
            <label className="text-xs">Ámbito</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setScopeType("area");
                  setScopeId("");
                }}
                className={`rounded-md border px-2 py-2 text-sm ${
                  scopeType === "area"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                }`}
              >
                Área
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeType("sector");
                  setScopeId("");
                }}
                className={`rounded-md border px-2 py-2 text-sm ${
                  scopeType === "sector"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                }`}
              >
                Sector
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeType("empleado");
                  setScopeId("");
                  setEmpQuery("");
                }}
                className={`rounded-md border px-2 py-2 text-sm ${
                  scopeType === "empleado"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                }`}
              >
                Empleado
              </button>
            </div>
          </div>

          {scopeType === "area" && (
            <div>
              <label className="text-xs">Área</label>
              <select
                className={inputCls}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                required
              >
                <option value="">Seleccioná un área…</option>
                {areas.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <FieldError name="scopeId" />
            </div>
          )}

          {scopeType === "sector" && (
            <div>
              <label className="text-xs">Sector</label>
              <select
                className={inputCls}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                required
              >
                <option value="">Seleccioná un sector…</option>
                {sectores.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <FieldError name="scopeId" />
            </div>
          )}

          {scopeType === "empleado" && (
            <div ref={empBoxRef}>
              <label className="text-xs">Empleado</label>

              {selectedEmpleado ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 mt-1">
                  <div className="text-sm">
                    {selectedEmpleado.apellido}, {selectedEmpleado.nombre}
                    {selectedEmpleado.apodo ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({selectedEmpleado.apodo})
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => {
                      setScopeId("");
                      setEmpQuery("");
                      setEmpOpen(true);
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative mt-1">
                    <input
                      className={inputCls}
                      placeholder="Buscar por apellido, nombre o apodo…"
                      value={empQuery}
                      onChange={(e) => {
                        setEmpQuery(e.target.value);
                        setEmpOpen(true);
                      }}
                      onFocus={() => setEmpOpen(true)}
                    />
                    {empOpen && (
                      <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow">
                        {empleadosFiltrados.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Sin resultados
                          </div>
                        )}
                        {empleadosFiltrados.map((e) => (
                          <button
                            key={e._id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                           onClick={() => { setScopeId(String(e._id ?? e.id)); setEmpOpen(false); }}
                          >
                            {e.apellido}, {e.nombre}
                            {e.apodo ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({e.apodo})
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <FieldError name="scopeId" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Escribí para buscar y seleccioná al empleado.
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-xs">Año</label>
            <input
              type="number"
              className={inputCls}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min={currentYear - 2}
              max={currentYear + 3}
            />
            <FieldError name="year" />
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div>
        <label className="text-xs">Descripción</label>
        <textarea
          className="w-full min-h-24 rounded-md border px-3 py-2 text-sm"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <FieldError name="descripcion" />
      </div>

     {/* Metas */}
<div className="space-y-3 border-t pt-4">
  <h3 className="text-base font-semibold">📌 Metas</h3>
 {metas.map((m, i) => (
  <div
    key={i}
    className="grid grid-cols-5 gap-3 items-end bg-muted/20 rounded-md p-2"
  >
    {/* Nombre */}
    <div>
      <label className="text-xs">Nombre</label>
      <input
        className="w-full rounded-md border px-2 py-1 text-sm"
        value={m.nombre}
        onChange={(e) => handleMetaChange(i, "nombre", e.target.value)}
      />
    </div>

    {/* Unidad */}
    <div>
      <label className="text-xs">Unidad</label>
      <select
        className="w-full rounded-md border px-2 py-1 text-sm"
        value={m.unidad}
        onChange={(e) => handleMetaChange(i, "unidad", e.target.value)}
      >
        <option value="Cumple/No Cumple">Cumple/No Cumple</option>
        <option value="Porcentual">Porcentual</option>
        <option value="Numerico">Numérico</option>
      </select>
    </div>

    {/* Target + Operador (solo si no es Cumple/No Cumple) */}
    {m.unidad !== "Cumple/No Cumple" && (
      <>
        <div>
          <label className="text-xs">Target</label>
          <input
            className="w-full rounded-md border px-2 py-1 text-sm"
            value={m.target}
            onChange={(e) => handleMetaChange(i, "target", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs">Operador</label>
          <select
            className="w-full rounded-md border px-2 py-1 text-sm"
            value={m.operador || ">="}
            onChange={(e) => handleMetaChange(i, "operador", e.target.value)}
          >
            <option value=">=">{">="}</option>
            <option value=">">{">"}</option>
            <option value="<=">{"<="}</option>
            <option value="<">{"<"}</option>
            <option value="==">{"=="}</option>
            <option value="!=">{"!="}</option>
          </select>
        </div>
      </>
    )}

    {/* Cumple/No cumple (checkbox) */}
    {m.unidad === "Cumple/No Cumple" && (
      <div className="flex items-center">
        <label className="text-xs mr-2">Cumplimiento</label>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={!!m.cumple}
          onChange={(e) => handleMetaChange(i, "cumple", e.target.checked)}
        />
      </div>
    )}

    {/* Botón eliminar */}
    <div className="flex justify-end items-center">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-8 px-2 bg-rose-100 text-rose-700 hover:bg-rose-200 border-0"
        onClick={() => handleRemoveMeta(i)}
      >
        ✕
      </Button>
    </div>
  </div>
))}
<Button type="button" variant="secondary" onClick={handleAddMeta}>
  ➕ Agregar meta
</Button>

</div>

      {/* Botones */}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancelar}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        {!isEdit && (
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => handleSubmit(e, { seguir: true })}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Crear y seguir"}
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear objetivo"}
        </Button>
      </div>
    </form>
  );
}
