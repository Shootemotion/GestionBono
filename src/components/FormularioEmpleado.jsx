import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api";
import { Pencil, AlertTriangle, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

/* ===================== Helpers ===================== */
const resolveUrl = (u) => {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u; // absoluta
  const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
  return `${String(base).replace(/\/+$/, "")}/${String(u).replace(/^\/+/, "")}`;
};

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const isDigits = (v) => /^\d+$/.test(String(v || "").trim());

const fieldLabel = {
  nombre: "Nombre",
  apellido: "Apellido",
  dni: "DNI",
  cuil: "CUIL",
  email: "Email",
  fechaIngreso: "Fecha de ingreso",
  puesto: "Puesto",
  areaId: "Área",
  sectorId: "Dependencias",
  domicilio: "Domicilio",
};

/* =================================================== */

export default function FormularioEmpleado({
  onGuardar,
  onCancelar,
  empleadoInicial = null,
  areas = [],
  sectores = [],
  opcionesPuesto = [],
  opcionesCategoria = ["Staff", "Profesional", "Jefatura", "Gerencia", "Dirección"],
}) {
  const navigate = useNavigate();

  // ---------- Estado de datos ----------
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [apodo, setApodo] = useState("");
  const [dni, setDni] = useState("");
  const [cuil, setCuil] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailDomain, setEmailDomain] = useState("@diagnos.com.ar");
  const [celular, setCelular] = useState("");
  const [genero, setGenero] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [puesto, setPuesto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [areaId, setAreaId] = useState("");   // ⬅ por defecto vacío (consistente con Legajo)
  const [sectorId, setSectorId] = useState("");
  const [foto, setFoto] = useState(null);

  // Errores por campo
  const [errors, setErrors] = useState({});

  // Refs para enfocar el primer error
  const refs = {
    nombre: useRef(null),
    apellido: useRef(null),
    dni: useRef(null),
    cuil: useRef(null),
    email: useRef(null),
    fechaIngreso: useRef(null),
    puesto: useRef(null),
    areaId: useRef(null),
    sectorId: useRef(null),
    domicilio: useRef(null),
  };

  // ---------- Modo edición inline (header) ----------
  const isNew = !empleadoInicial?._id;
  const [editNombre, setEditNombre] = useState(isNew);
  const [editApellido, setEditApellido] = useState(isNew);
  const [editPuesto, setEditPuesto] = useState(isNew);
  const [editCategoria, setEditCategoria] = useState(isNew);

  // ---------- Modal de Confirmación de Cambio ----------
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  // ---------- Foto / preview ----------
  const fotoExistente = useMemo(
    () => resolveUrl(empleadoInicial?.fotoUrl),
    [empleadoInicial?.fotoUrl]
  );
  const [objectUrl, setObjectUrl] = useState(null);
  const previewFoto = foto
    ? objectUrl
    : (fotoExistente || null);

  useEffect(() => {
    if (!foto) return;
    const url = URL.createObjectURL(foto);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [foto]);

  // ---------- Cargar datos iniciales ----------
  useEffect(() => {
    setErrors({});
    if (empleadoInicial) {
      setNombre(empleadoInicial.nombre || "");
      setApellido(empleadoInicial.apellido || "");
      setApodo(empleadoInicial.apodo || "");
      setDni(empleadoInicial.dni || "");
      setCuil(empleadoInicial.cuil || "");
      setCuil(empleadoInicial.cuil || "");
      if (empleadoInicial.email) {
        const parts = empleadoInicial.email.split("@");
        if (parts.length === 2) {
          setEmailUser(parts[0]);
          setEmailDomain("@" + parts[1]);
        } else {
          setEmailUser(empleadoInicial.email);
          setEmailDomain("@diagnos.com.ar"); // fallback
        }
      } else {
        setEmailUser("");
        setEmailDomain("@diagnos.com.ar");
      }
      setCelular(empleadoInicial.celular || "");

      // Normalize Gender
      const gRaw = (empleadoInicial.genero || empleadoInicial.sexo || "").toLowerCase().trim();
      if (["masculino", "hombre", "varon", "m", "male"].includes(gRaw) || (gRaw.startsWith("m") && !gRaw.includes("mujer"))) {
        setGenero("Masculino");
      } else if (["femenino", "mujer", "f", "female"].includes(gRaw) || gRaw.includes("mujer")) {
        setGenero("Femenino");
      } else {
        setGenero(empleadoInicial.genero || "");
      }

      setDomicilio(empleadoInicial.domicilio || "");
      setFechaIngreso(
        empleadoInicial.fechaIngreso
          ? new Date(empleadoInicial.fechaIngreso).toISOString().split("T")[0]
          : ""
      );
      setPuesto(empleadoInicial.puesto || "");
      setCategoria(empleadoInicial.categoria || "");
      setAreaId(empleadoInicial.area?._id || empleadoInicial.area || "");
      setSectorId(empleadoInicial.sector?._id || empleadoInicial.sector || "");
      setFoto(null);
      setEditNombre(false);
      setEditApellido(false);
      setEditPuesto(false);
      setEditCategoria(false);
    } else {
      setNombre("");
      setApellido("");
      setApodo("");
      setDni("");
      setCuil("");
      setCuil("");
      setEmailUser("");
      setEmailDomain("@diagnos.com.ar");
      setEmailDomain("@diagnos.com.ar");
      setCelular("");
      setGenero("");
      setDomicilio("");
      setFechaIngreso("");
      setPuesto("");
      setCategoria("");
      setAreaId("");     // ⬅ no autoseleccionar primer área
      setSectorId("");
      setFoto(null);
      setEditNombre(true);
      setEditApellido(true);
      setEditPuesto(true);
      setEditCategoria(true);
    }
  }, [empleadoInicial]);

  // ---------- Auto-llenado de CUIL (Solo creación) ----------
  useEffect(() => {
    if (!isNew) return;
    // Si el usuario borra el DNI, limpiamos CUIL? O dejamos el prefijo?
    // Mejor dejamos el prefijo 20 + lo que haya quedado
    setCuil((prev) => {
      const limpio = String(prev ?? "").trim();
      // Si está vacío, arrancamos con 20 + dni
      if (!limpio) return "20" + dni;

      // Intentamos detectar si ya tiene un prefijo válido (2 digitos)
      // Asumimos que los primeros 2 chars son prefijo si son numéricos.
      const prefix = limpio.slice(0, 2);
      if (/^\d{2}$/.test(prefix)) {
        return prefix + dni;
      }
      // Fallback
      return "20" + dni;
    });
  }, [dni, isNew]);

  // ---------- Sectores del área + validación ----------
  const sectoresDelArea = useMemo(() => {
    const id = areaId ? String(areaId) : "";
    const lista = Array.isArray(sectores) ? sectores : [];
    return lista.filter((s) => String(s?.areaId?._id ?? s?.areaId ?? "") === id);
  }, [sectores, areaId]);

  // reset de sector si cambia el área
  // useEffect(() => {
  //   setSectorId(""); // ⬅ resetea siempre para evitar “desincronización”
  // }, [areaId]);

  // ---------- Validación ----------
  const validate = () => {
    const next = {};

    if (isEmpty(nombre)) next.nombre = "Ingresá el nombre.";
    if (isEmpty(apellido)) next.apellido = "Ingresá el apellido.";

    if (isEmpty(dni)) next.dni = "Ingresá el DNI.";
    else if (!isDigits(dni)) next.dni = "El DNI debe tener solo números.";

    if (isEmpty(cuil)) next.cuil = "Ingresá el CUIL.";
    else if (!/^\d{11}$/.test(String(cuil))) next.cuil = "El CUIL debe tener 11 dígitos.";

    const finalEmail = `${emailUser}${emailDomain}`;
    if (isEmpty(emailUser)) next.email = "Ingresá el email.";
    else if (!isValidEmail(finalEmail)) next.email = "El email no es válido.";

    if (isEmpty(fechaIngreso)) next.fechaIngreso = "Seleccioná la fecha de ingreso.";
    if (isEmpty(puesto)) next.puesto = "Seleccioná el puesto.";
    if (isEmpty(areaId)) next.areaId = "Seleccioná el área.";
    // if (isEmpty(sectorId)) next.sectorId = "Seleccioná el sector."; // Optional now
    if (isEmpty(domicilio)) next.domicilio = "Ingresá el domicilio.";

    setErrors(next);
    return next;
  };

  // Enfocar el primer campo con error
  useEffect(() => {
    const keys = Object.keys(errors);
    if (!keys.length) return;
    const first = keys[0];
    const r = refs[first];
    if (r && r.current) {
      r.current.focus();
      r.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  // ---------- Guardar ----------
  const handleSubmit = (e) => {
    e.preventDefault();
    const issues = validate();
    if (Object.keys(issues).length) return;

    const data = {
      nombre,
      apellido,
      apodo,
      dni,
      cuil,
      email: `${emailUser}${emailDomain}`,
      celular,
      genero,
      domicilio,
      fechaIngreso,
      puesto,
      categoria, // opcional
      area: areaId,
      sector: sectorId,
      foto, // si hay archivo, el padre hará POST /:id/foto
    };

    // Detect Structural Change (Only Edit Mode)
    if (empleadoInicial && !isNew) {
      const oldArea = String(empleadoInicial.area?._id || empleadoInicial.area || "");
      const oldSector = String(empleadoInicial.sector?._id || empleadoInicial.sector || "");

      const newArea = String(areaId || "");
      const newSector = String(sectorId || "");

      if (oldArea !== newArea || oldSector !== newSector) {
        setPendingData(data);
        setShowChangeModal(true);
        return;
      }
    }

    onGuardar(data);
  };

  const confirmarCorreccion = () => {
    if (pendingData) onGuardar(pendingData);
    setShowChangeModal(false);
  };

  const confirmarCambioLaboral = () => {
    // Redirect to Legajo with params to pre-fill "Datos Laborales" form (Carrera)
    // We assume Legajo handles 'action=new-position'
    const params = new URLSearchParams();
    params.set("tab", "datos-laborales");
    params.set("action", "new-position");
    params.set("puesto", puesto);
    params.set("area", areaId);
    params.set("sector", sectorId);

    // Also Close modal here (cancel edit essentially, or we could SAVE then redirect? 
    // User wants "Change in History". If we just save here, we lose the history of the old position unless the backend handles it.
    // The requirement is: "que lo dirija al legajo para hacer el cambio en el historial laboral".
    // This implies we SHOULD NOT save the change here yet, but let the user do it via the Career flow.
    // So we just redirect.
    if (empleadoInicial?._id) {
      navigate(`/nomina/legajo/${empleadoInicial._id}?${params.toString()}`);
    } else {
      // Fallback?? Should not happen in create mode
      toast.error("Error: Acción no disponible en creación");
    }
  };

  const inputCls = (hasError) =>
    `w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 ${hasError
      ? "border-red-500 focus-visible:ring-red-500"
      : "border-border focus-visible:ring-ring"
    }`;

  /* ---------- Opciones por defecto de Puesto (si no envías por props) ---------- */
  const defaultOpcionesPuesto = [
    "Director General",
    "Director Financiero, Administración e Innovación",
    "Director Recursos Humanos",
    "Jefe de Área Administrativa - Contable",
    "Jefe de Atención al Cliente y Sucursales",
    "Jefe de RRHH y Relaciones Institucionales",
    "Auxiliar de Maestranza",
    "Auxiliar Logística y Mantenimiento",
    "Analista de Compras",
    "Analista Contabilidad y Control de Gestión",
    "Analistas de Tesorería",
    "Analistas de Facturación",
    "Coordinador de Facturación",
    "Analista de Informática y Sistemas",
    "Supervisor de Atención al Cliente",
    "Coord. de Consultorios",
    "Coord. de Recepción",
    "Recepcionista",
    "Supervisor de Etapa Preanalítica",
    "Extraccionista",
    "Técnico de Laboratorio",
    "Supervisor de Etapa Analítica",
    "Supervisor de Etapa Post-analítica",
    "Bioquímico",
    "Coordinador de Calidad",
    "Analista de Finanzas",
  ];
  const puestos = opcionesPuesto.length ? opcionesPuesto : defaultOpcionesPuesto;

  /* ======================== UI ======================== */
  const resumenErrores = Object.keys(errors).map((k) => fieldLabel[k]).filter(Boolean);

  const SectionTitle = ({ children }) => (
    <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4 mt-6 first:mt-0 uppercase tracking-wide">
      {children}
    </h3>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">

      {/* Resumen de errores */}
      {resumenErrores.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <strong className="block font-semibold mb-1">Revisá estos campos:</strong>
            <p className="opacity-90">{resumenErrores.join(" • ")}</p>
          </div>
        </div>
      )}

      {/* HEADER: Foto + Datos Principales */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row gap-6 items-start">
        {/* Foto */}
        <label className="relative group cursor-pointer shrink-0 mx-auto sm:mx-0">
          <div className="w-32 h-32 rounded-2xl overflow-hidden ring-4 ring-slate-50 bg-slate-100 shadow-inner flex items-center justify-center">
            {previewFoto ? (
              <img src={previewFoto} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <Users size={48} className="text-slate-300" />
            )}
          </div>
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-all">
            <span className="flex items-center gap-1"><Pencil size={12} /> Cambiar</span>
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFoto(e.target.files?.[0] || null)}
          />
        </label>

        {/* Campos Principales */}
        <div className="flex-1 w-full space-y-4 pt-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nombre Completo</label>
            <div className="flex flex-wrap items-center gap-4">
              <InlineEditable
                refInput={refs.nombre}
                value={nombre}
                placeholder="Nombre"
                editing={editNombre}
                onEdit={() => setEditNombre(true)}
                onChange={setNombre}
                onBlur={() => setEditNombre(false)}
                error={errors.nombre}
                className="text-2xl font-bold text-slate-800"
              />
              <InlineEditable
                refInput={refs.apellido}
                value={apellido}
                placeholder="Apellido"
                editing={editApellido}
                onEdit={() => setEditApellido(true)}
                onChange={setApellido}
                onBlur={() => setEditApellido(false)}
                error={errors.apellido}
                className="text-2xl font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <InlineSelect
              refSelect={refs.puesto}
              label="Puesto"
              value={puesto}
              options={puestos}
              placeholder="Definir puesto"
              editing={editPuesto}
              onEdit={() => setEditPuesto(true)}
              onChange={setPuesto}
              onBlur={() => setEditPuesto(false)}
              error={errors.puesto}
            />
            <span className="text-slate-300">|</span>
            <InlineSelect
              label="Categoría"
              value={categoria}
              options={opcionesCategoria}
              placeholder="Definir categoría"
              editing={editCategoria}
              onEdit={() => setEditCategoria(true)}
              onChange={setCategoria}
              onBlur={() => setEditCategoria(false)}
            />
          </div>
        </div>
      </div>

      {/* DETALLES en Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

        {/* === Datos Personales === */}
        <SectionTitle>Datos Personales</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 mb-8">
          <div className="col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Apodo (Cómo le dicen)</label>
            <input
              className={inputCls(false)}
              value={apodo}
              onChange={(e) => setApodo(e.target.value)}
              placeholder="Ej: Leo, Gabi..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">DNI <span className="text-red-500">*</span></label>
            <input
              ref={refs.dni}
              className={inputCls(!!errors.dni)}
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              required
              aria-invalid={!!errors.dni}
              inputMode="numeric"
              placeholder="Sin puntos"
            />
            {errors.dni && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.dni}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">CUIL <span className="text-red-500">*</span></label>
            <input
              ref={refs.cuil}
              className={inputCls(!!errors.cuil)}
              value={cuil}
              onChange={(e) => setCuil(e.target.value)}
              required
              aria-invalid={!!errors.cuil}
              inputMode="numeric"
              maxLength={11}
              placeholder="11 dígitos sin guiones"
            />
            {errors.cuil && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.cuil}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Género</label>
            <select
              className={inputCls(false)}
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Celular</label>
            <input
              className={inputCls(false)}
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              placeholder="Ej: 11 1234 5678"
            />
          </div>
        </div>

        {/* === Contacto y Domicilio === */}
        <SectionTitle>Contacto y Ubicación</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 mb-8">
          <div className="col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Corporativo <span className="text-red-500">*</span></label>
            <div className="flex shadow-sm rounded-lg">
              <input
                ref={refs.email}
                type="text"
                className={`flex-1 rounded-l-lg border-y border-l bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${!!errors.email
                  ? "border-red-300 bg-red-50 text-red-900 placeholder:text-red-300 z-10"
                  : "border-slate-200 text-slate-700"
                  }`}
                value={emailUser}
                onChange={(e) => setEmailUser(e.target.value)}
                placeholder="nombre.apellido"
                required
                aria-invalid={!!errors.email}
              />
              <select
                className="rounded-r-lg border border-l-0 border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-200 cursor-pointer transition-colors"
                value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)}
              >
                <option value="@diagnos.com.ar">@diagnos.com.ar</option>
                <option value="@diagnoslab.com.ar">@diagnoslab.com.ar</option>
                <option value="@gmail.com">@gmail.com</option>
                <option value="@hotmail.com">@hotmail.com</option>
              </select>
            </div>
            {errors.email && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.email}</p>}
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Domicilio Real <span className="text-red-500">*</span></label>
            <input
              ref={refs.domicilio}
              className={inputCls(!!errors.domicilio)}
              value={domicilio}
              onChange={(e) => setDomicilio(e.target.value)}
              placeholder="Calle, Altura, Piso, Depto, Localidad"
              aria-invalid={!!errors.domicilio}
            />
            {errors.domicilio && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.domicilio}</p>}
          </div>
        </div>

        {/* === Datos Laborales === */}
        <SectionTitle>Información Laboral</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha de Ingreso <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                ref={refs.fechaIngreso}
                type="date"
                className={`${inputCls(!!errors.fechaIngreso)}`}
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
                required
                aria-invalid={!!errors.fechaIngreso}
              />
            </div>
            {errors.fechaIngreso && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.fechaIngreso}</p>}
          </div>

          <div>{/* Spacer or empty */}</div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Área <span className="text-red-500">*</span></label>
            <select
              ref={refs.areaId}
              className={`${inputCls(!!errors.areaId)} appearance-none`}
              value={areaId}
              onChange={(e) => {
                setAreaId(e.target.value);
                setSectorId("");
              }}
              required
              aria-invalid={!!errors.areaId}
            >
              <option value="">Seleccioná un área</option>
              {areas.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            {errors.areaId && <p className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> {errors.areaId}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Dependencia (Sector)</label>
            <select
              ref={refs.sectorId}
              className={`${inputCls(!!errors.sectorId)} appearance-none`}
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              aria-invalid={!!errors.sectorId}
              disabled={!areaId || !sectoresDelArea.length}
            >
              <option value="">
                {!areaId ? "Primero elegí un área..." : "Sin dependencia específica"}
              </option>
              {sectoresDelArea.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-6">
        <Button type="button" variant="ghost" onClick={onCancelar} className="hover:bg-slate-100 text-slate-600">
          Cancelar
        </Button>
        <Button type="submit" size="lg" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 transition-all font-semibold px-8">
          {empleadoInicial ? "Guardar Cambios" : "Crear Colaborador"}
        </Button>
      </div>

      {/* Modal Detect Change */}
      {showChangeModal && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="h-14 w-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-5 mx-auto ring-4 ring-amber-50/50">
                <AlertTriangle size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Cambio de Posición</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Detectamos un cambio en el área o sector. <br />
                ¿Es una corrección de un error o un movimiento real en la estructura?
              </p>

              <div className="space-y-3">
                <Button onClick={confirmarCorreccion} variant="outline" className="w-full border-slate-200 hover:bg-slate-50 hover:text-slate-800 text-slate-600 font-medium">
                  Es una corrección (Actualizar)
                </Button>
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink-0 mx-3 text-[10px] text-slate-300 font-bold uppercase tracking-widest">Opción Rec.</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>
                <Button onClick={confirmarCambioLaboral} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-100">
                  Registrar como Cambio Laboral
                </Button>
              </div>

              <button
                onClick={() => setShowChangeModal(false)}
                className="mt-6 text-xs text-slate-400 hover:text-slate-600 font-medium hover:underline"
              >
                Cancelar operación
              </button>
            </div>
          </div>
        </div>
      )}

    </form>
  );
}

/* ------------ Componentes inline edit (Estilizados) ----------------- */
function InlineEditable({ value, placeholder, editing, onEdit, onChange, onBlur, error, refInput, className }) {
  if (editing) {
    return (
      <div className="flex flex-col relative group">
        <input
          ref={refInput}
          autoFocus
          className={`border-b-2 bg-transparent outline-none px-1 py-0 min-w-[120px] transition-colors ${error ? "border-red-500 text-red-600 placeholder:text-red-300" : "border-blue-500 text-slate-800 placeholder:text-slate-300"
            } ${className || "text-base font-medium"}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
        />
        {error && <span className="absolute -bottom-4 left-0 text-[10px] font-bold text-red-500 whitespace-nowrap">{error}</span>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`group inline-flex items-center gap-2 hover:bg-slate-50 px-2 py-1 rounded-md transition-all -ml-2 ${className || "text-base font-medium text-slate-700"} ${!value ? "text-slate-300" : ""}`}
      title={`Editar ${placeholder?.toLowerCase() || "valor"}`}
    >
      {value || placeholder}
      <Pencil size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />
    </button>
  );
}

function InlineSelect({
  label,
  value,
  options = [],
  placeholder = "Seleccionar...",
  editing,
  onEdit,
  onChange,
  onBlur,
  error,
  refSelect,
}) {
  if (editing) {
    return (
      <div className="flex flex-col relative">
        <select
          ref={refSelect}
          autoFocus
          className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium bg-white shadow-sm outline-none transition-all ${error ? "border-red-500 focus:border-red-600" : "border-blue-100 focus:border-blue-500"
            }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
        >
          <option value="">{placeholder}</option>
          {options.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        {error && <span className="absolute -bottom-4 left-0 text-[10px] font-bold text-red-500 whitespace-nowrap">{error}</span>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      title={`Editar ${label}`}
      className="group inline-flex items-center gap-2 hover:bg-slate-50 px-2 py-1 rounded-full transition-all border border-transparent hover:border-slate-100"
    >
      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${value
        ? "bg-blue-50 text-blue-700 border border-blue-100"
        : "bg-slate-100 text-slate-400 border border-slate-200"
        } ${error ? "bg-red-50 text-red-600 border-red-200" : ""}`}>
        {value || label}
      </span>
      {/* <Pencil size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" /> */}
    </button>
  );
}
