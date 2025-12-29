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
  const [estado, setEstado] = useState("");
  const [year, setYear] = useState(initialYear || currentYear);
  const [scopeType, setScopeType] = useState(initialScopeType || "area");
  const [scopeId, setScopeId] = useState(initialScopeId || "");
  const [frecuencia, setFrecuencia] = useState("anual");
  const [modoAcumulacion, setModoAcumulacion] = useState("periodo");
  const [peso, setPeso] = useState(0);

  const MAX_LIST = 2000;
  const [metas, setMetas] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [empQuery, setEmpQuery] = useState("");
  const [empOpen, setEmpOpen] = useState(false);
  const empBoxRef = useRef(null);

  const [usarFechaCierreCustom, setUsarFechaCierreCustom] = useState(false);
  const [fechaCierre, setFechaCierre] = useState("");

  const selectedEmpleado = useMemo(() => {
    const lista = Array.isArray(empleados) ? empleados : [];
    const sid = scopeId != null ? String(scopeId) : "";
    return lista.find((e) => String(e?._id ?? e?.id) === sid) || null;
  }, [scopeId, empleados]);

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
    setEstado(initialData.activo ? "Activo" : "Inactivo");
   

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
    setModoAcumulacion(
      initialData.modoAcumulacion ||
      (initialData.acumulativo ? "acumulativo" : "periodo")
    );
    setPeso(initialData.pesoBase ?? initialData.peso ?? 0);

    // Metas con la nueva estructura (sin target de texto)
    setMetas(
      Array.isArray(initialData.metas)
        ? initialData.metas.map((m) => ({
          nombre: m.nombre || "",
          unidad: m.unidad || "Porcentual",
          operador: m.operador || ">=",
          modoAcumulacion: m.modoAcumulacion || "periodo",
          acumulativa:
            m.acumulativa ??
            (m.modoAcumulacion === "acumulativo" ? true : false),

          esperado:
            m.esperado ??
            (typeof m.target === "number" ? m.target : null) ??
            "",

          pesoMeta:
            m.pesoMeta !== undefined && m.pesoMeta !== null
              ? m.pesoMeta
              : "",
          reconoceEsfuerzo:
            m.reconoceEsfuerzo !== undefined
              ? m.reconoceEsfuerzo
              : true,
          permiteOver:
            m.permiteOver !== undefined ? m.permiteOver : false,
          tolerancia:
            m.tolerancia !== undefined && m.tolerancia !== null
              ? m.tolerancia
              : 0,
          tolerancia:
            m.tolerancia !== undefined && m.tolerancia !== null
              ? m.tolerancia
              : 0,
          reglaCierre: m.reglaCierre || "promedio",
          umbralPeriodos: m.umbralPeriodos || 0,
        }))
        : []
    );

    setUsarFechaCierreCustom(!!initialData.fechaCierreCustom);
    setFechaCierre(
      initialData.fechaCierre
        ? String(initialData.fechaCierre).slice(0, 10)
        : ""
    );
  }, [initialData, currentYear]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (empBoxRef.current && !empBoxRef.current.contains(e.target)) {
        setEmpOpen(false);
      }
    }
    if (empOpen) document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [empOpen]);

  // Metas helpers
  const handleAddMeta = () =>
    setMetas((m) => [
      ...m,
      {
        nombre: "",
        unidad: "Porcentual",
        operador: ">=",
        modoAcumulacion: "periodo",
        acumulativa: false,
        esperado: "",
        pesoMeta: "",
        reconoceEsfuerzo: true,
        permiteOver: false,
        tolerancia: 0,
        permiteOver: false,
        tolerancia: 0,
        reglaCierre: "promedio",
        umbralPeriodos: 0,
      },
    ]);

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

    // limpiar metas y castear números
    const metasClean = (metas || [])
      .map((m) => {
        const esperadoNum =
          m.esperado === "" || m.esperado == null
            ? null
            : Number(m.esperado);
        const pesoMetaNum =
          m.pesoMeta === "" || m.pesoMeta == null
            ? null
            : Number(m.pesoMeta);
        const toleranciaNum =
          m.tolerancia === "" || m.tolerancia == null
            ? 0
            : Number(m.tolerancia);

        const unidad = m.unidad || "Porcentual";
        const esBinaria = unidad === "Cumple/No Cumple";

        return {
          nombre: (m.nombre || "").trim(),
          target: null, // 🔹 dejamos de usar el target de texto
          esperado:
            esperadoNum !== null && !Number.isNaN(esperadoNum)
              ? esperadoNum
              : null,
          unidad,
          operador: esBinaria ? ">=" : m.operador || ">=",
          modoAcumulacion: m.modoAcumulacion || "periodo",
          acumulativa:
            m.modoAcumulacion === "acumulativo" ||
            !!m.acumulativa,
          pesoMeta:
            pesoMetaNum !== null && !Number.isNaN(pesoMetaNum)
              ? pesoMetaNum
              : null,
          reconoceEsfuerzo: esBinaria
            ? false
            : m.reconoceEsfuerzo !== false,
          permiteOver:
            esBinaria ? false : m.permiteOver === true,
          tolerancia:
            !Number.isNaN(toleranciaNum) && toleranciaNum >= 0
              ? toleranciaNum
              : 0,

          reglaCierre: m.reglaCierre || "promedio",
          umbralPeriodos: Number(m.umbralPeriodos || 0),
        };
      })
      .filter((m) => m.nombre || m.esperado !== null);

    const body = {
      tipo: "objetivo",
      year: Number(year),
      scopeType,
      scopeId,
      nombre,
      descripcion,
      proceso,

      frecuencia,
      modoAcumulacion,
      acumulativo: modoAcumulacion === "acumulativo",
      pesoBase: Number(peso || 0),
      activo: estado === "Activo",
    };

    if (usarFechaCierreCustom && fechaCierre) {
      body.fechaCierre = new Date(fechaCierre);
      body.fechaCierreCustom = true;
    }

    if (metasClean.length > 0) body.metas = metasClean;

    setIsSubmitting(true);
    try {
      const saved = isEdit
        ? await api(`/templates/${initialData._id}`, {
          method: "PUT",
          body,
        })
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
      <p className="mt-1 text-xs text-red-600">
        {String(fieldErrors[name])}
      </p>
    ) : null;

  const PROCESOS = [
    { value: "", label: "Seleccioná un proceso…" },
    { value: "Económico", label: "Económico" },
    { value: "Gestión", label: "Gestión" },
    { value: "Organizacional", label: "Organizacional" },
  ];

  const ESTADO = [
    { value: "", label: "Selecciona un estado…" },
    { value: "Activo", label: "Activo" },
    { value: "Inactivo", label: "Inactivo" },

  ];





  return (
    <form onSubmit={(e) => handleSubmit(e)} className="flex flex-col h-full">
      {/* Contenido Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                placeholder="Ej.: Lograr una rentabilidad superior al 18%"
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
                  <option key={p.value || "blank"} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <FieldError name="proceso" />

              <label className="text-xs">Estado</label>
              <select
                className={inputCls}
                value={estado}
                onChange={(a) => setEstado(a.target.value)}
                required
              >
                {ESTADO.map((p) => (
                  <option key={p.value || "blank"} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <FieldError name="estado" />
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
                </select>
                <FieldError name="frecuencia" />
              </div>
            </div>

            <div>
              <label className="text-xs flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={usarFechaCierreCustom}
                  onChange={(e) =>
                    setUsarFechaCierreCustom(e.target.checked)
                  }
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
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "area"
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
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "sector"
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
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "empleado"
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

          {metas.map((m, i) => {
            const esBinaria = m.unidad === "Cumple/No Cumple";
            return (
              <div
                key={i}
                className="relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
              >
                {/* Header / Barra superior */}
                <div className="flex items-start justify-between gap-4 border-b bg-muted/30 p-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Nombre de la Meta
                    </label>
                    <input
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={m.nombre}
                      onChange={(e) =>
                        handleMetaChange(i, "nombre", e.target.value)
                      }
                      placeholder="Ej.: Alcanzar 95% de satisfacción..."
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Peso (%)
                    </label>
                    <div className="relative">
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        type="number"
                        min={0}
                        max={100}
                        value={m.pesoMeta ?? ""}
                        onChange={(e) =>
                          handleMetaChange(i, "pesoMeta", e.target.value)
                        }
                      />
                      <span className="absolute right-3 top-2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6 h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemoveMeta(i)}
                    title="Eliminar meta"
                  >
                    ✕
                  </Button>
                </div>

                {/* Body / Contenido */}
                <div className="grid gap-6 p-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Grupo 1: Configuración Básica */}
                  <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Configuración
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Unidad de Medida
                        </label>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={m.unidad}
                          onChange={(e) =>
                            handleMetaChange(i, "unidad", e.target.value)
                          }
                        >
                          <option value="Porcentual">Porcentual (%)</option>
                          <option value="Numerico">Numérico (#)</option>
                          <option value="Cumple/No Cumple">
                            Binaria (Cumple/No)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Modo de Seguimiento
                        </label>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={m.modoAcumulacion || "periodo"}
                          onChange={(e) => {
                            const v = e.target.value;
                            handleMetaChange(i, "modoAcumulacion", v);
                            handleMetaChange(
                              i,
                              "acumulativa",
                              v === "acumulativo"
                            );
                          }}
                        >
                          <option value="periodo">Por Período (Independiente)</option>
                          <option value="acumulativo">Acumulativo (Suma)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Regla de Cierre Anual
                        </label>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={m.reglaCierre || "promedio"}
                          onChange={(e) =>
                            handleMetaChange(i, "reglaCierre", e.target.value)
                          }
                        >
                          <option value="promedio">Promedio de Hitos</option>
                          <option value="umbral_periodos">
                            Umbral de Períodos
                          </option>
                          <option value="cierre_unico">
                            Último Valor / Cierre Único
                          </option>
                        </select>
                      </div>
                      {m.reglaCierre === "umbral_periodos" && (
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">
                            Umbral (Cant.)
                          </label>
                          <input
                            type="number"
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={m.umbralPeriodos || ""}
                            onChange={(e) =>
                              handleMetaChange(
                                i,
                                "umbralPeriodos",
                                e.target.value
                              )
                            }
                            placeholder="Ej. 3"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grupo 2: Objetivo y Cálculo */}
                  <div className="space-y-4 border-l pl-0 md:pl-6 lg:border-l">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Objetivo
                    </h4>
                    {esBinaria ? (
                      <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>
                          Esta meta es binaria. Se evaluará como "Cumple" o "No
                          Cumple" en cada hito.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                              Operador
                            </label>
                            <select
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                              value={m.operador || ">="}
                              onChange={(e) =>
                                handleMetaChange(i, "operador", e.target.value)
                              }
                            >
                              <option value=">=">{">="} Mayor o igual</option>
                              <option value=">">{">"} Mayor que</option>
                              <option value="<=">{"<="} Menor o igual</option>
                              <option value="<">{"<"} Menor que</option>
                              <option value="==">{"=="} Igual a</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                              Valor Esperado
                            </label>
                            <input
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                              type="number"
                              placeholder="0.00"
                              value={m.esperado ?? ""}
                              onChange={(e) =>
                                handleMetaChange(i, "esperado", e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">
                            Tolerancia (puntos)
                          </label>
                          <input
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            type="number"
                            min={0}
                            value={m.tolerancia ?? 0}
                            onChange={(e) =>
                              handleMetaChange(i, "tolerancia", e.target.value)
                            }
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Margen aceptable antes de considerar incumplimiento.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Grupo 3: Opciones Avanzadas */}
                  <div className="space-y-4 border-l pl-0 md:pl-6 lg:border-l">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Opciones
                    </h4>
                    <div className="space-y-3">
                      {!esBinaria && (
                        <>
                          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-2 hover:bg-accent">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!m.reconoceEsfuerzo}
                              onChange={(e) =>
                                handleMetaChange(
                                  i,
                                  "reconoceEsfuerzo",
                                  e.target.checked
                                )
                              }
                            />
                            <div className="space-y-0.5">
                              <span className="block text-sm font-medium">
                                Reconoce Esfuerzo
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                Permite puntaje parcial si no se llega al 100%.
                              </span>
                            </div>
                          </label>

                          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-2 hover:bg-accent">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!m.permiteOver}
                              onChange={(e) =>
                                handleMetaChange(
                                  i,
                                  "permiteOver",
                                  e.target.checked
                                )
                              }
                            />
                            <div className="space-y-0.5">
                              <span className="block text-sm font-medium">
                                Permite Over-achievement
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                Permite superar el 100% (hasta 120%).
                              </span>
                            </div>
                          </label>
                        </>
                      )}
                      {esBinaria && (
                        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                          Sin opciones adicionales para metas binarias.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="secondary" onClick={handleAddMeta}>
            ➕ Agregar meta
          </Button>
        </div>
      </div>

      {/* Botones (Sticky Footer) */}
      <div className="flex-none p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 z-10">
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
          {isSubmitting
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Crear objetivo"}
        </Button>
      </div>
    </form>
  );
}
