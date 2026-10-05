// src/components/FormularioObjetivos.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { getCurrentFiscalYear, fiscalYearEnd, fiscalYearLabel, fiscalYearRange } from "@/lib/fiscalYear";
import { Target, Users, Award, Ruler, Plus, Trash2 } from "lucide-react";
import { AyudaCampo, BotonAyudaMetas, PanelAyudaMetas } from "@/components/AyudaMeta";
import { construirPayloadObjetivo } from "@/lib/payloadObjetivo";
import AvisosValidacion from "@/components/objetivos/AvisosValidacion";

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
  const currentFiscalYear = getCurrentFiscalYear();

  // Base
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proceso, setProceso] = useState("");
  const [estado, setEstado] = useState("");
  const [year, setYear] = useState(initialData?.year || initialYear || currentFiscalYear);
  const [scopeType, setScopeType] = useState(initialScopeType || "area");
  const [scopeId, setScopeId] = useState(initialScopeId || "");
  const [frecuencia, setFrecuencia] = useState("mensual");
  const [modoAcumulacion, setModoAcumulacion] = useState("periodo");
  const [peso, setPeso] = useState(0);

  const MAX_LIST = 2000;
  const [metas, setMetas] = useState([]);
  const [objetivosCalidad, setObjetivosCalidad] = useState([]); // ids seleccionados
  const [objetivosCalidadAvail, setObjetivosCalidadAvail] = useState([]); // catálogo del año

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [empQuery, setEmpQuery] = useState("");
  const [empOpen, setEmpOpen] = useState(false);
  const empBoxRef = useRef(null);

  // Combobox de Objetivos de Calidad
  const [objCalQuery, setObjCalQuery] = useState("");
  const [objCalOpen, setObjCalOpen] = useState(false);
  const objCalBoxRef = useRef(null);

  const [usarFechaCierreCustom, setUsarFechaCierreCustom] = useState(false);
  const [fechaCierre, setFechaCierre] = useState("");

  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  // Aviso previo a sobrescribir: qué se rompe si se guarda así.
  const [impacto, setImpacto] = useState(null);
  const [consultandoImpacto, setConsultandoImpacto] = useState(false);
  const [ayudaMetasAbierta, setAyudaMetasAbierta] = useState(false);
  const [motivoVersion, setMotivoVersion] = useState("");
  const [comentarioVersion, setComentarioVersion] = useState("");

  // Procesos cargados dinámicamente desde la BD (ProcesoISO)
  // Deduplicados por fullName para evitar duplicados cuando hay docs con/sin year.
  const [procesosApi, setProcesosApi] = useState([]);
  useEffect(() => {
    api("/procesos-iso?activo=true").then((d) => {
      if (Array.isArray(d)) {
        // Deduplicar por fullName (el valor guardado en Plantilla.proceso)
        const seen = new Set();
        const unique = d.filter((p) => {
          if (seen.has(p.fullName)) return false;
          seen.add(p.fullName);
          return true;
        });
        setProcesosApi(unique);
      }
    }).catch(() => { });
  }, []);

  // Objetivos de Mejora de Calidad del año fiscal (catálogo)
  useEffect(() => {
    if (!year) return;
    api(`/objetivos-iso?year=${year}`)
      .then((d) => {
        if (Array.isArray(d)) setObjetivosCalidadAvail(d);
      })
      .catch(() => { });
  }, [year]);

  const toggleObjetivoCalidad = (id) =>
    setObjetivosCalidad((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

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


    setYear(initialData.year || currentFiscalYear);

    const apiScope = initialData.scopeType || "area";
    setScopeType(apiScope);

    setScopeId(
      apiScope === "area"
        ? initialData.areaId || initialData.scopeId || ""
        : apiScope === "sector"
          ? initialData.sectorId || initialData.scopeId || ""
          : initialData.empleadoId || initialData.scopeId || ""
    );

    setFrecuencia(initialData.frecuencia || "mensual");
    setModoAcumulacion(
      initialData.modoAcumulacion ||
      (initialData.acumulativo ? "acumulativo" : "periodo")
    );
    setPeso(initialData.pesoBase ?? initialData.peso ?? 0);

    // Metas con la nueva estructura (sin target de texto)
    setMetas(
      Array.isArray(initialData.metas)
        ? initialData.metas.map((m) => ({
          // El _id viaja de ida y vuelta para que el backend reconozca la meta
          // al guardar y no le genere uno nuevo (ver conservarIdsDeMetas).
          _id: m._id,
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

          reglaCierre: m.reglaCierre || "promedio",
          umbralPeriodos: m.umbralPeriodos || 0,
        }))
        : []
    );

    // Objetivos de Mejora de Calidad (pueden venir poblados o como ids)
    setObjetivosCalidad(
      Array.isArray(initialData.objetivosCalidad)
        ? initialData.objetivosCalidad
            .map((o) => (typeof o === "object" ? String(o?._id ?? "") : String(o)))
            .filter(Boolean)
        : []
    );

    setUsarFechaCierreCustom(!!initialData.fechaCierreCustom);
    setFechaCierre(
      initialData.fechaCierre
        ? String(initialData.fechaCierre).slice(0, 10)
        : ""
    );
  }, [initialData, currentFiscalYear]);

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

  useEffect(() => {
    function handleClickOutside(e) {
      if (objCalBoxRef.current && !objCalBoxRef.current.contains(e.target)) {
        setObjCalOpen(false);
      }
    }
    if (objCalOpen) document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [objCalOpen]);

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

  /**
   * Todo lo que el formulario tiene en pantalla, en un objeto.
   *
   * Lo consumen los dos caminos que mandan el objetivo al backend —el panel
   * de avisos y el guardado— para que los dos hablen del mismo documento.
   */
  const valoresDelFormulario = useMemo(
    () => ({
      year, scopeType, scopeId, nombre, descripcion, proceso,
      frecuencia, modoAcumulacion, peso, estado, metas,
      objetivosCalidad, usarFechaCierreCustom, fechaCierre,
    }),
    [year, scopeType, scopeId, nombre, descripcion, proceso, frecuencia,
     modoAcumulacion, peso, estado, metas, objetivosCalidad,
     usarFechaCierreCustom, fechaCierre]
  );

  // Se valida recién cuando hay algo que validar: con el formulario en blanco
  // los avisos serían todos "falta completar", que ya los dicen los campos.
  const payloadParaValidar = useMemo(
    () => (nombre?.trim() && frecuencia ? construirPayloadObjetivo(valoresDelFormulario) : null),
    [valoresDelFormulario, nombre, frecuencia]
  );

  const validateClient = () => {
    const errs = {};
    if (!scopeId) {
      errs.scopeId =
        scopeType === "empleado"
          ? "Seleccioná un empleado."
          : "Seleccioná un área o sector.";
    }
    if (!nombre.trim()) errs.nombre = "El nombre es obligatorio.";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit
  /**
   * Antes de sobrescribir, le pregunta al backend qué se rompe con estos
   * cambios. Si hay algo grave —resultados que quedarían fuera del calendario,
   * metas con datos que desaparecen— frena y lo muestra. Si no, guarda directo.
   *
   * Nace del caso concreto: cambiar un objetivo de mensual a trimestral dejó 5
   * resultados cargados colgados de períodos inexistentes, en 20 personas, sin
   * un solo aviso.
   */
  const pedirImpactoYGuardar = async (e) => {
    e.preventDefault();
    if (!isEdit || !initialData?._id) return handleSubmit(e, { seguir: false, esVersion: false });
    setConsultandoImpacto(true);
    try {
      const r = await api(`/templates/${initialData._id}/impacto`, {
        method: "POST",
        body: {
          frecuencia,
          pesoBase: Number(peso || 0),
          metas: (metas || []).map((m) => ({ _id: m._id, nombre: m.nombre })),
        },
      });
      if (r?.avisos?.length) {
        setImpacto(r);
        return; // el diálogo decide
      }
    } catch {
      // Si el chequeo falla no se bloquea el guardado: es una ayuda, no un portero.
    } finally {
      setConsultandoImpacto(false);
    }
    handleSubmit(e, { seguir: false, esVersion: false });
  };

  const handleSubmit = async (e, opts = { seguir: false, esVersion: false }) => {
    e.preventDefault();
    setFieldErrors({});

    if (!validateClient()) {
      toast.error("Revisá los campos marcados.");
      return;
    }

    // El cuerpo se arma en un solo lugar, compartido con la validación en
    // vivo: si validáramos una cosa y guardáramos otra, el panel de avisos
    // estaría hablando de un objetivo distinto del que se manda.
    const body = construirPayloadObjetivo(valoresDelFormulario);

    // El backend rechaza con 409 un cambio de frecuencia que deja resultados
    // fuera del calendario, salvo que venga confirmado. Este flag es el "ya
    // vi el impacto y aun así quiero hacerlo" y sólo lo pone el botón del
    // diálogo de impacto: no se manda por defecto a propósito.
    if (opts.confirmarImpacto) body.confirmarImpacto = true;

    setIsSubmitting(true);
    try {
      let saved;
      if (opts.esVersion) {
        body.motivoVersion = motivoVersion;
        body.comentarioVersion = comentarioVersion;
        // Enviar a versionar
        const { plantilla } = await api(`/templates/${initialData._id}/versionar`, {
          method: "POST",
          body,
        });
        saved = plantilla;
        toast.success("Nueva versión creada correctamente y enviada para aprobación");
      } else {
        saved = isEdit
          ? await api(`/templates/${initialData._id}`, {
            method: "PUT",
            body,
          })
          : await api("/templates", { method: "POST", body });

        toast.success(isEdit ? "Objetivo actualizado" : "Objetivo creado");
      }

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

  const ESTADO = [
    { value: "", label: "Selecciona un estado…" },
    { value: "Activo", label: "Activo" },
    { value: "Inactivo", label: "Inactivo" },
  ];





  return (
    <form onSubmit={(e) => handleSubmit(e)} className="flex flex-col h-full">
      {/* Contenido Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {isEdit && initialData?.activo && initialData?.estadoAprobacion !== "pendiente" && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2 flex gap-3 text-blue-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            <div className="text-sm">
              <p className="font-semibold mb-1">Estás editando la Versión {initialData.version || 1} (Activa).</p>
              <p>Podés hacer correcciones menores y <strong>guardar cambios (sobrescribir)</strong>, o si son cambios que afectan metas/números, podés <strong>Crear Nueva Versión (v{(initialData.version || 1) + 1})</strong>. La nueva versión se enviará a estado "Pendiente de Aprobación" para revisión de RRHH/Directores.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IZQUIERDA */}
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Target className="h-4 w-4 text-blue-600" />
                  Qué se mide
                </h3>
                <span className={pill}>{fiscalYearLabel(year)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                El enunciado del objetivo. Acá no va ningún número: los umbrales
                se definen abajo, en <strong>Cómo se mide</strong>.
              </p>
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
              <label className="text-xs">Proceso <span className="text-gray-400">(opcional)</span></label>
              <select
                className={inputCls}
                value={proceso}
                onChange={(e) => setProceso(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {procesosApi.map((p) => (
                  <option key={p._id} value={p.fullName}>
                    {p.fullName}
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
                Fecha de cierre distinta al cierre del año fiscal ({fiscalYearEnd(year).toLocaleDateString("es-AR")})
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
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-slate-500" />
              A quién y cuándo aplica
            </h3>
            <p className="text-xs text-muted-foreground -mt-1 mb-1">
              Alcance y año fiscal del objetivo.
            </p>

            <div>
              <label className="text-xs">Ámbito
                {isEdit && <span className="ml-2 text-[10px] text-amber-600 font-semibold">(🔒 No modificable en edición)</span>}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isEdit}
                  onClick={() => {
                    setScopeType("area");
                    setScopeId("");
                  }}
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "area"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                    } ${isEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Área
                </button>
                <button
                  type="button"
                  disabled={isEdit}
                  onClick={() => {
                    setScopeType("sector");
                    setScopeId("");
                  }}
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "sector"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                    } ${isEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Sector
                </button>
                <button
                  type="button"
                  disabled={isEdit}
                  onClick={() => {
                    setScopeType("empleado");
                    setScopeId("");
                    setEmpQuery("");
                  }}
                  className={`rounded-md border px-2 py-2 text-sm ${scopeType === "empleado"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background hover:bg-accent"
                    } ${isEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Empleado
                </button>
              </div>
              {isEdit && (
                <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Para cambiar el ámbito, cloná la plantilla o creá una nueva.
                </p>
              )}
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
              <label className="text-xs">Año fiscal
                {isEdit && <span className="ml-2 text-[10px] text-amber-600 font-semibold">(🔒 No modificable en edición)</span>}
              </label>
              <input
                type="number"
                className={inputCls + (isEdit ? " opacity-50 cursor-not-allowed" : "")}
                value={year}
                onChange={(e) => !isEdit && setYear(Number(e.target.value))}
                readOnly={isEdit}
                min={currentFiscalYear - 2}
                max={currentFiscalYear + 3}
              />
              <FieldError name="year" />
              <p className="mt-1 text-xs text-muted-foreground">{fiscalYearLabel(year)} · {fiscalYearRange(year)}</p>
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

        {/* Objetivos de Mejora de Calidad asociados */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Award className="h-4 w-4 text-emerald-600" />
                Objetivos de Mejora de Calidad
              </h3>
              <p className="text-xs text-muted-foreground">
                Asociá esta plantilla a uno o varios objetivos de Gestión de Calidad del año {year}.
              </p>
            </div>
            {objetivosCalidad.length > 0 && (
              <button
                type="button"
                className="text-[11px] text-blue-600 hover:underline"
                onClick={() => setObjetivosCalidad([])}
              >
                Limpiar selección ({objetivosCalidad.length})
              </button>
            )}
          </div>

          {objetivosCalidadAvail.length === 0 ? (
            <p className="text-xs text-muted-foreground italic bg-slate-50 border border-slate-100 rounded-md p-3">
              No hay objetivos de mejora de calidad cargados para el año {year}. Podés crearlos desde la sección Gestión de Calidad.
            </p>
          ) : (
            <div ref={objCalBoxRef} className="relative">
              {/* Trigger / control compacto */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setObjCalOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setObjCalOpen((v) => !v);
                  }
                }}
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer flex items-center gap-2 flex-wrap focus-visible:ring-2 focus-visible:ring-ring outline-none"
              >
                {objetivosCalidad.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    Seleccioná uno o más objetivos…
                  </span>
                ) : (
                  objetivosCalidad.map((id) => {
                    const obj = objetivosCalidadAvail.find((o) => String(o._id) === id);
                    if (!obj) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2 pr-1 py-0.5 text-[11px]"
                      >
                        {obj.codigo && <span className="font-bold">{obj.codigo}</span>}
                        <span className="font-medium max-w-[160px] truncate">{obj.nombre}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleObjetivoCalidad(id);
                          }}
                          className="ml-0.5 rounded-full hover:bg-blue-100 text-blue-600 p-0.5"
                          title="Quitar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      </span>
                    );
                  })
                )}
                <span className="ml-auto text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${objCalOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </div>

              {/* Panel desplegable */}
              {objCalOpen && (
                <div className="absolute left-0 right-0 mt-1 z-20 rounded-md border border-slate-200 bg-popover text-popover-foreground shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                    <input
                      type="text"
                      autoFocus
                      value={objCalQuery}
                      onChange={(e) => setObjCalQuery(e.target.value)}
                      placeholder="Buscar por código o nombre…"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {(() => {
                      const q = objCalQuery.trim().toLowerCase();
                      const filtrados = q
                        ? objetivosCalidadAvail.filter((o) =>
                            `${o.codigo ?? ""} ${o.nombre ?? ""}`.toLowerCase().includes(q)
                          )
                        : objetivosCalidadAvail;
                      if (filtrados.length === 0) {
                        return (
                          <li className="px-3 py-2 text-xs text-muted-foreground italic">
                            Sin resultados.
                          </li>
                        );
                      }
                      return filtrados.map((obj) => {
                        const id = String(obj._id);
                        const selected = objetivosCalidad.includes(id);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => toggleObjetivoCalidad(id)}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${selected ? "bg-blue-50/50" : ""}`}
                            >
                              <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"}`}>
                                {selected && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                )}
                              </span>
                              {obj.codigo && <span className="text-[10px] font-black text-slate-500 shrink-0">{obj.codigo}</span>}
                              <span className="font-medium text-slate-700 truncate">{obj.nombre}</span>
                            </button>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500">
                    <span>{objetivosCalidad.length} seleccionado{objetivosCalidad.length === 1 ? "" : "s"} · {objetivosCalidadAvail.length} disponibles</span>
                    <button
                      type="button"
                      onClick={() => setObjCalOpen(false)}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Metas — el "cómo se mide" */}
        <div className="space-y-3 border-t pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Ruler className="h-4 w-4 shrink-0 text-indigo-600" />
                Cómo se mide
              </h3>
              <p className="max-w-2xl text-xs text-muted-foreground">
                Con qué regla se decide si el objetivo se cumplió. Cada{" "}
                <strong>meta</strong> es una forma de medirlo: qué unidad, qué
                valor hay que alcanzar y cómo se combinan los períodos al cerrar
                el año. Con una sola meta alcanza en la mayoría de los casos; si
                agregás varias, repartí el peso entre ellas.
              </p>
            </div>
            <BotonAyudaMetas
              abierto={ayudaMetasAbierta}
              onToggle={() => setAyudaMetasAbierta((v) => !v)}
            />
          </div>

          {/* Fuera de la fila flex: si va adentro, aplasta el título y la
              segunda columna de la grilla se sale de la vista. */}
          {ayudaMetasAbierta && (
            <PanelAyudaMetas onCerrar={() => setAyudaMetasAbierta(false)} />
          )}

          {metas.map((m, i) => {
            const esBinaria = m.unidad === "Cumple/No Cumple";
            // En acumulativo el motor suma todo el año y compara el total, sin
            // mirar reglaCierre (backend/src/lib/scoringCore.js).
            const esAcumulativa = m.modoAcumulacion === "acumulativo" || !!m.acumulativa;
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Header / Barra superior */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                  <div className="flex-1 space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      Nombre de la Meta
                      <AyudaCampo campo="nombre" />
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
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      Peso (%)
                      <AyudaCampo campo="pesoMeta" />
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
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Body / Contenido */}
                <div className="grid gap-6 p-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Grupo 1: Configuración Básica */}
                  <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Unidad y seguimiento
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                          Unidad de Medida
                          <AyudaCampo campo="unidad" />
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
                        <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                          Modo de Seguimiento
                          <AyudaCampo campo="modoAcumulacion" />
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
                          <option value="periodo">Por período — de mantenimiento</option>
                          <option value="acumulativo">Acumulativo — se suma en el año</option>
                        </select>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {esAcumulativa
                            ? "Se suman las cargas de todo el año y el total se compara con el valor esperado. Ej.: 12 cargas mensuales que deben sumar 600."
                            : "Cada período se mide por separado contra el valor esperado. Ej.: cada mes hay que llegar al 95%."}
                        </p>
                      </div>
                      <div>
                        <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                          Regla de Cierre Anual
                          <AyudaCampo campo="reglaCierre" />
                        </label>
                        <select
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          value={esAcumulativa ? "" : (m.reglaCierre || "promedio")}
                          disabled={esAcumulativa}
                          onChange={(e) =>
                            handleMetaChange(i, "reglaCierre", e.target.value)
                          }
                        >
                          {esAcumulativa && <option value="">No aplica (acumulativo)</option>}
                          <option value="promedio">Promedio de Hitos</option>
                          <option value="umbral_periodos">
                            Umbral de Períodos
                          </option>
                          <option value="cierre_unico">
                            Último Valor / Cierre Único
                          </option>
                        </select>
                        {esAcumulativa ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            En modo acumulativo el cierre ya está definido: se
                            suman todas las cargas del año y ese total se compara
                            contra el valor esperado. La regla de cierre no
                            interviene.
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Cómo se combinan los períodos al cerrar el año.
                          </p>
                        )}
                      </div>
                      {m.reglaCierre === "umbral_periodos" && (
                        <div>
                          <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                            Umbral (Cant.)
                            <AyudaCampo campo="umbralPeriodos" />
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
                      Umbral de cumplimiento
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
                            <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                              Operador
                              <AyudaCampo campo="operador" />
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
                            <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                              Valor Esperado
                              <AyudaCampo campo="esperado" />
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
                          <label className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                            Tolerancia (puntos)
                            <AyudaCampo campo="tolerancia" />
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
                            Margen para dar la meta por cumplida. Ojo: marca el
                            hito como cumplido, pero si abajo está activo
                            &ldquo;Reconoce esfuerzo&rdquo; el puntaje sigue
                            siendo proporcional (con esperado 100 y tolerancia
                            5, un 96 cumple pero puntúa 96%).
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
                              <span className="flex items-center gap-1 text-sm font-medium">
                                Reconoce Esfuerzo
                                <AyudaCampo campo="reconoceEsfuerzo" />
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                Da puntaje proporcional si no se llega al 100%.
                                Solo se aplica en el <strong>cierre anual</strong>:
                                durante el año el seguimiento siempre muestra el
                                avance proporcional. Si lo desactivás, una meta
                                al 50% se ve 50% todo el año y cierra en 0.
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
                              <span className="flex items-center gap-1 text-sm font-medium">
                                Permite Over-achievement
                                <AyudaCampo campo="permiteOver" />
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

          <Button
            type="button"
            variant="secondary"
            onClick={handleAddMeta}
            className="w-full border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Agregar otra meta
          </Button>
        </div>
      </div>

      {/* Botones (Sticky Footer) */}
      {/* AVISOS DE CONFIGURACIÓN
          Va pegado a los botones y no dentro del formulario a propósito: es lo
          último que se lee antes de guardar, y así no depende de dónde quedó
          el scroll. Las reglas son del backend; acá solo se muestran. */}
      {payloadParaValidar && (
        <div className="flex-none px-6 pt-3 border-t border-slate-100 bg-slate-50">
          <AvisosValidacion payload={payloadParaValidar} id={initialData?._id || null} />
        </div>
      )}

      <div className={`flex-none p-6 bg-slate-50 flex justify-end gap-2 z-10 items-center ${payloadParaValidar ? "pt-4" : "border-t border-slate-100"}`}>
        {isEdit && initialData?.activo && initialData?.estadoAprobacion !== "pendiente" && (
          <div className="flex-1 mr-4">
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
              Si modificás una plantilla activa con evaluaciones en curso, podés afectar los datos históricos. Considerá crear una nueva versión.
            </div>
          </div>
        )}

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
            onClick={(e) => handleSubmit(e, { seguir: true, esVersion: false })}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Crear y seguir"}
          </Button>
        )}

        {/* Jerarquía deliberada: versionar es la acción principal y sobrescribir
            la secundaria. Antes convivían dos botones de peso visual parecido,
            uno decía "Crear Versión 2" y el otro "Actualizar V1", y se leían
            como equivalentes. No lo son: sobrescribir pisa el objetivo. En toda
            la base hay una sola plantilla versionada — el diseño empujaba al
            botón destructivo. */}
        {isEdit && (
          <Button
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-600 hover:bg-slate-100"
            onClick={(e) => pedirImpactoYGuardar(e)}
            disabled={isSubmitting}
            title="Reemplaza el objetivo actual. Queda registrado en el historial y se puede revertir."
          >
            {isSubmitting ? "Guardando…" : "Sobrescribir sin versionar"}
          </Button>
        )}

        {isEdit ? (
          <Button
            type="button"
            onClick={() => setVersionDialogOpen(true)}
            disabled={isSubmitting}
            className="font-bold"
          >
            {isSubmitting ? "Guardando…" : `Guardar como versión ${(initialData.version || 1) + 1}`}
          </Button>
        ) : (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Crear objetivo"}
          </Button>
        )}
      </div>

      {/* AVISO DE IMPACTO — qué se rompe si se sobrescribe así */}
      <Dialog open={!!impacto} onOpenChange={(v) => !v && setImpacto(null)}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Antes de sobrescribir</DialogTitle>
            <DialogDescription>
              Estos cambios afectan datos que ya están cargados. Revisalo antes de guardar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {(impacto?.avisos || []).map((a, i) => {
              const estilo = a.gravedad === "alta"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : a.gravedad === "buena"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800";
              return (
                <div key={i} className={`rounded-lg border p-3 ${estilo}`}>
                  <div className="text-sm font-bold">{a.titulo}</div>
                  {a.detalle && <div className="text-xs mt-1 leading-snug">{a.detalle}</div>}
                  {a.empleados?.length > 0 && (
                    <div className="text-xs mt-1.5">
                      <span className="font-semibold">Personas afectadas ({a.empleados.length}):</span>{" "}
                      {a.empleados.slice(0, 8).join(", ")}
                      {a.empleados.length > 8 && ` y ${a.empleados.length - 8} más`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 border-t pt-2">
            Los resultados cargados no se borran nunca. Si quedan fuera del calendario dejan de verse, y
            vuelven a aparecer si se restaura la frecuencia anterior. Este cambio queda en el historial
            del objetivo y se puede revertir.
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setImpacto(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isSubmitting}
              onClick={(e) => {
                setImpacto(null);
                handleSubmit(e, { seguir: false, esVersion: false, confirmarImpacto: true });
              }}
            >
              Sobrescribir igual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE REVERSION */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Solicitar Nueva Versión (v{(initialData?.version || 1) + 1})</DialogTitle>
            <DialogDescription>
              Por favor, indicá el motivo principal de este reversionado y completá con un comentario aclaratorio para que RRHH o el Director puedan evaluarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo (Obligatorio)</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={motivoVersion}
                onChange={(e) => setMotivoVersion(e.target.value)}
              >
                <option value="">-- Seleccionar motivo --</option>
                <option value="Cambio en la estrategia organizacional">Cambio en la estrategia organizacional</option>
                <option value="Factores externos imprevistos">Factores externos imprevistos</option>
                <option value="Ajuste de presupuestos o recursos">Ajuste de presupuestos o recursos</option>
                <option value="Error en la definición original de la meta">Error en la definición original de la meta</option>
                <option value="Reasignación de tareas del empleado">Reasignación de tareas del empleado</option>
                <option value="Otro / Situación excepcional">Otro / Situación excepcional</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Comentario adicional (Obligatorio)</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Explicá brevemente por qué es necesario este cambio..."
                value={comentarioVersion}
                onChange={(e) => setComentarioVersion(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setVersionDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button
              type="button"
              onClick={(e) => {
                if (!motivoVersion || !comentarioVersion.trim()) {
                  toast.error("El motivo y el comentario son obligatorios para solicitar una nueva versión.");
                  return;
                }
                setVersionDialogOpen(false);
                handleSubmit(e, { seguir: false, esVersion: true });
              }}
              disabled={isSubmitting || !motivoVersion || !comentarioVersion.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Enviar Solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
