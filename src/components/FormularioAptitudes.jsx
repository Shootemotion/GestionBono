// src/components/FormularioAptitudes.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * Util: normaliza mensajes de error (fetch/axios/custom)
 */
const MAX_LIST = 2000; // ajustá a gusto
function normalizeError(err) {
  const status = err?.status || err?.response?.status || err?.code || null;
  const data = err?.data || err?.response?.data || null;
  // intentamos agarrar mensaje “humano”
  const message =
    data?.message ||
    data?.error ||
    err?.message ||
    (typeof err === "string" ? err : "Error desconocido");
  const traceId =
    data?.traceId || data?.trackingId || data?.correlationId || null;

  // intentamos extraer validaciones tipicas (Mongoose/express-validator)
  let fieldErrors = {};
  if (data?.errors) {
    if (Array.isArray(data.errors)) {
      // express-validator style: [{path/msg/param}]
      for (const e of data.errors) {
        const key = e.path || e.param || e.field || "general";
        fieldErrors[key] = e.msg || e.message || "Dato inválido";
      }
    } else if (typeof data.errors === "object") {
      // Mongoose validation: { field: { message } }
      for (const [k, v] of Object.entries(data.errors)) {
        fieldErrors[k] = v?.message || "Dato inválido";
      }
    }
  }

  return { status, message, data, raw: err, traceId, fieldErrors };
}

/**
 * Util: prefijo legible según status
 */
function statusPrefix(status) {
  if (!status) return "Error";
  if (status >= 500) return "Error del servidor";
  if (status === 404) return "Recurso no encontrado";
  if (status === 409) return "Conflicto";
  if (status === 401 || status === 403) return "Permisos insuficientes";
  if (status === 422) return "Datos inválidos";
  if (status >= 400) return "Solicitud inválida";
  return "Error";
}

/**
 * Mini componente: alerta superior
 */
function FormAlert({ title, children, variant = "error" }) {
  const variants = {
    error: "bg-red-50 text-red-800 ring-red-200",
    warn: "bg-amber-50 text-amber-800 ring-amber-200",
    info: "bg-blue-50 text-blue-800 ring-blue-200",
  };
  return (
    <div className={`rounded-md p-3 ring-1 ${variants[variant]}`}>
      <div className="font-medium mb-1">{title}</div>
      {children ? <div className="text-sm">{children}</div> : null}
    </div>
  );
}

/**
 * Skeleton simple para carga
 */
function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-40 bg-slate-200 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
          <div className="h-10 bg-slate-200 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
        </div>
      </div>
      <div className="h-24 bg-slate-200 rounded" />
      <div className="flex justify-end gap-2">
        <div className="h-9 w-28 bg-slate-200 rounded" />
        <div className="h-9 w-32 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

export default function FormularioAptitudes({
  // Datos
  initialData = null, // si ya te lo trae el parent
  datosIniciales = null, // legacy
  templateId = null, // opcional: si lo pasás, el form se autocarga
  initialYear,
  initialScopeType,
  initialScopeId,
  areas = [],
  sectores = [],
  empleados = [],
  // Callbacks
  onSaved,
  onCancelar,
  onSaveAndContinue,
}) {
  const data = initialData ?? datosIniciales ?? null;
  const isEdit = !!(data && data._id) || !!templateId;
  const currentYear = new Date().getFullYear();

  // Carga/remota
  const [loading, setLoading] = useState(!!templateId && !data);
  const [loadError, setLoadError] = useState(null);

  // Base
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proceso, setProceso] = useState("");
  const [year, setYear] = useState(initialYear || currentYear);
  const [scopeType, setScopeType] = useState(initialScopeType || "area");
  const [scopeId, setScopeId] = useState(initialScopeId || "");
  const [frecuencia, setFrecuencia] = useState("anual");
  const [peso, setPeso] = useState("");

  // Fiscal override (igual que en objetivos)
  const [usarFechaCierreCustom, setUsarFechaCierreCustom] = useState(false);
  const [fechaCierre, setFechaCierre] = useState("");

  // envío/errores
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Autocomplete empleados
  const [empQuery, setEmpQuery] = useState("");
  const [empOpen, setEmpOpen] = useState(false);
  const empBoxRef = useRef(null);

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const pill =
    "inline-flex items-center h-6 px-2 rounded-full text-[11px] ring-1 bg-accent/40 ring-border/60";

  const FieldError = ({ name }) =>
    fieldErrors?.[name] ? (
      <p className="mt-1 text-xs text-red-600">{String(fieldErrors[name])}</p>
    ) : null;

  // Opciones “Proceso”
  const PROCESOS = [
    { value: "", label: "Seleccioná un proceso…" },
    { value: "Económico", label: "Económico" },
    { value: "Gestión", label: "Gestión" },
    { value: "Organizacional", label: "Organizacional" },
  ];

  const selectedEmpleado = useMemo(() => {
    const lista = Array.isArray(empleados) ? empleados : [];
    const sid = scopeId != null ? String(scopeId) : "";
    return lista.find((e) => String(e?._id ?? e?.id) === sid) || null;
  }, [scopeId, empleados]);

  const empleadosFiltrados = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    const base = Array.isArray(empleados) ? empleados : [];
    if (!q) return base.slice(0, MAX_LIST);
    return base
      .filter((e) => {
        const n = `${e?.apellido ?? ""} ${e?.nombre ?? ""}`.toLowerCase();
        const a = (e?.apodo ?? "").toLowerCase();
        return n.includes(q) || a.includes(q);
      })
      .slice(0, MAX_LIST);
  }, [empQuery, empleados]);

  /**
   * Carga “autosuficiente” si viene templateId y no hay initialData
   */
  async function fetchTemplateOnce(id) {
    setLoading(true);
    setLoadError(null);
    try {
      const tpl = await api(`/templates/${id}`);
      // pre-carga de campos
      hydrateFromData(tpl);
    } catch (err) {
      const info = normalizeError(err);
      setLoadError(info);
      toast.error(`${statusPrefix(info.status)}: ${info.message}`);
      console.groupCollapsed(
        `[FormularioAptitudes] Falló cargar plantilla ${id} (${info.status ?? "sin status"})`
      );
      console.log("Respuesta .data:", info?.data);
      console.error("Error completo:", info?.raw || err);
      console.groupEnd();
    } finally {
      setLoading(false);
    }
  }

  function hydrateFromData(d) {
    const fallbackYear = initialYear || currentYear;
    setNombre(d?.nombre || "");
    setDescripcion(d?.descripcion || "");
    setProceso(d?.proceso || "");
    setYear(d?.year || fallbackYear);

    const apiScope = d?.scopeType || initialScopeType || "area";
    setScopeType(apiScope);
    setScopeId(
      apiScope === "area"
        ? d?.areaId || d?.scopeId || initialScopeId || ""
        : apiScope === "sector"
        ? d?.sectorId || d?.scopeId || initialScopeId || ""
        : d?.empleadoId || d?.scopeId || initialScopeId || ""
    );

    setFrecuencia(d?.frecuencia || "anual");
    setPeso(String(d?.pesoBase ?? d?.peso ?? "0"));

    // 👇 Nuevo: hidratar override de cierre fiscal
    setUsarFechaCierreCustom(!!d?.fechaCierreCustom);
    setFechaCierre(
      d?.fechaCierre ? String(d.fechaCierre).slice(0, 10) : ""
    );
  }

  // Cargar si tenemos initialData
  useEffect(() => {
    if (data) hydrateFromData(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Autocarga por templateId
  useEffect(() => {
    if (templateId && !data) fetchTemplateOnce(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // cerrar dropdown empleados al click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (empBoxRef.current && !empBoxRef.current.contains(e.target)) {
        setEmpOpen(false);
      }
    }
    if (empOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [empOpen]);

  // Validación cliente
  const validateClient = () => {
    const errs = {};
    // ámbito
    if (!scopeId) {
      errs.scopeId =
        scopeType === "empleado"
          ? "Seleccioná un empleado."
          : scopeType === "sector"
          ? "Seleccioná un sector."
          : "Seleccioná un área.";
    }
    // campos base
    if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (!frecuencia) errs.frecuencia = "Seleccioná una frecuencia.";

    // valores razonables
    const pesoNum = Number(peso === "" ? 0 : peso);
    if (Number.isNaN(pesoNum) || pesoNum < 0 || pesoNum > 100) {
      errs.peso = "El peso debe ser un número entre 0 y 100.";
    }

    // año razonable
    const y = Number(year);
    if (Number.isNaN(y) || y < currentYear - 5 || y > currentYear + 5) {
      errs.year = `Año fuera de rango (${currentYear - 5} a ${currentYear + 5}).`;
    }

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

    const body = {
      tipo: "aptitud",
      year: Number(year),
      scopeType,
      scopeId,
      nombre,
      descripcion,
      proceso,
      frecuencia,
      pesoBase: Number(peso === "" ? 0 : peso),
      activo: true,
    };

    if (usarFechaCierreCustom && fechaCierre) {
      body.fechaCierre = new Date(fechaCierre);
      body.fechaCierreCustom = true;
    }

    setIsSubmitting(true);
    try {
      const saved = isEdit
        ? await api(`/templates/${templateId || data?._id}`, {
            method: "PUT",
            body,
          })
        : await api("/templates", { method: "POST", body });

      toast.success(isEdit ? "Aptitud actualizada" : "Aptitud creada");
      if (opts.seguir && !isEdit) onSaveAndContinue?.(saved);
      else onSaved?.(saved);
    } catch (err) {
      const info = normalizeError(err);
      // propaga validaciones de backend a la UI
      if (info.fieldErrors && Object.keys(info.fieldErrors).length) {
        setFieldErrors((prev) => ({ ...prev, ...info.fieldErrors }));
      }
      const pref = statusPrefix(info.status);
      const suffix = info.traceId ? ` (ID: ${info.traceId})` : "";
      toast.error(`${pref}: ${info.message}${suffix}`);

      console.groupCollapsed(
        `[FormularioAptitudes] Falló el submit (${info.status ?? "sin status"})`
      );
      console.log("Payload enviado:", body);
      console.log("Respuesta .data:", info?.data);
      if (info?.traceId) console.log("TraceId:", info.traceId);
      console.error("Error completo:", info?.raw || err);
      console.groupEnd();
    } finally {
      setIsSubmitting(false);
    }
  };

  // —— UI ——
  if (loading) return <FormSkeleton />;

  return (
    <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
      {/* Banner de error de carga (cuando viene templateId y falla) */}
      {loadError ? (
        <FormAlert title={`${statusPrefix(loadError.status)} al cargar la plantilla`}>
          <div className="space-y-2">
            <div>{loadError.message}</div>
            {loadError.traceId ? (
              <div className="text-xs opacity-80">ID de seguimiento: {loadError.traceId}</div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fetchTemplateOnce(templateId)}
              >
                Reintentar
              </Button>
              <details className="text-xs">
                <summary className="cursor-pointer select-none">Detalles técnicos</summary>
                <pre className="mt-1 max-h-48 overflow-auto bg-black/5 p-2 rounded">
{JSON.stringify(loadError.data ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </FormAlert>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IZQUIERDA */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">💡 Aptitud</h3>
            <span className={pill}>Año: {year}</span>
          </div>

          <div>
            <label className="text-xs">Nombre</label>
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Liderazgo en equipo"
              aria-invalid={!!fieldErrors.nombre}
              required
            />
            <FieldError name="nombre" />
          </div>

          <div>
            <label className="text-xs">Proceso (opcional)</label>
            <select
              className={inputCls}
              value={proceso}
              onChange={(e) => setProceso(e.target.value)}
              aria-invalid={!!fieldErrors.proceso}
            >
              {PROCESOS.map((p) => (
                <option key={p.value || "blank"} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <FieldError name="proceso" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs">Peso (%)</label>
              <input
                type="number"
                className={`${inputCls} ${peso === "0" ? "text-muted-foreground" : ""}`}
                value={peso}
                min={0}
                max={100}
                inputMode="decimal"
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onBlur={() => setPeso((v) => (v === "" ? "0" : v))}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  setPeso(raw.slice(0, 3));
                }}
                aria-invalid={!!fieldErrors.peso}
              />
              <FieldError name="peso" />
            </div>
            <div>
              <label className="text-xs">Frecuencia</label>
              <select
                className={inputCls}
                value={frecuencia}
                onChange={(e) => setFrecuencia(e.target.value)}
                aria-invalid={!!fieldErrors.frecuencia}
              >
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
              <FieldError name="frecuencia" />
            </div>
          </div>

          {/* Override de cierre fiscal */}
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
                aria-invalid={!!fieldErrors.scopeId}
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
              {areas.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  No hay áreas disponibles. Verificá permisos o carga inicial.
                </p>
              )}
            </div>
          )}

          {scopeType === "sector" && (
            <div>
              <label className="text-xs">Sector</label>
              <select
                className={inputCls}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                aria-invalid={!!fieldErrors.scopeId}
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
              {sectores.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  No hay sectores disponibles para seleccionar.
                </p>
              )}
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
                      aria-invalid={!!fieldErrors.scopeId}
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
                            onClick={() => {
                              setScopeId(String(e._id ?? e.id));
                              setEmpOpen(false);
                            }}
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
                  {empleados.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      No hay empleados cargados/visibles para tu usuario.
                    </p>
                  )}
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
              min={currentYear - 5}
              max={currentYear + 5}
              aria-invalid={!!fieldErrors.year}
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
          aria-invalid={!!fieldErrors.descripcion}
        />
        <FieldError name="descripcion" />
      </div>

      {/* Nota informativa — escala 1–5 linda */}
      <div className="rounded-xl border ring-1 ring-border/60 bg-white px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-full flex items-center justify-center border">
            <span className="text-xs font-semibold">i</span>
          </div>
          <p className="text-base">
            Las <strong>aptitudes</strong> se evalúan en <em>Seguimiento</em> con una{" "}
            <strong>escala 1–5</strong>:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-500 ring-1 ring-red-300" />
            <div className="leading-tight">
              <div className="text-sm font-bold">1</div>
              <div className="text-[12px] text-slate-600">Insatisfactorio</div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-400 ring-1 ring-red-300" />
            <div className="leading-tight">
              <div className="text-sm font-bold">2</div>
              <div className="text-[12px] text-slate-600">Necesita mejorar</div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="inline-block h-3 w-3 rounded-sm bg-yellow-400 ring-1 ring-yellow-300" />
            <div className="leading-tight">
              <div className="text-sm font-bold">3</div>
              <div className="text-[12px] text-slate-600">Cumple</div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-400 ring-1 ring-green-300" />
            <div className="leading-tight">
              <div className="text-sm font-bold">4</div>
              <div className="text-[12px] text-slate-600">Supera</div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-500 ring-1 ring-green-300" />
            <div className="leading-tight">
              <div className="text-sm font-bold">5</div>
              <div className="text-[12px] text-slate-600">Sobresaliente</div>
            </div>
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={isSubmitting}>
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
          {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear aptitud"}
        </Button>
      </div>
    </form>
  );
}
