import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api";
import { Pencil } from "lucide-react";

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
  sectorId: "Sector",
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
  // ---------- Estado de datos ----------
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [apodo, setApodo] = useState("");
  const [dni, setDni] = useState("");
  const [cuil, setCuil] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailDomain, setEmailDomain] = useState("@diagnos.com.ar");
  const [celular, setCelular] = useState("");
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
      setCelular("");
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
  useEffect(() => {
    setSectorId(""); // ⬅ resetea siempre para evitar “desincronización”
  }, [areaId]);

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
    if (isEmpty(sectorId)) next.sectorId = "Seleccioná el sector.";
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

    onGuardar({
      nombre,
      apellido,
      apodo,
      dni,
      cuil,
      dni,
      cuil,
      email: `${emailUser}${emailDomain}`,
      celular,
      domicilio,
      fechaIngreso,
      puesto,
      categoria, // opcional
      area: areaId,
      sector: sectorId,
      foto, // si hay archivo, el padre hará POST /:id/foto
    });
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
    "Auxiliares Maestranza",
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Resumen de errores */}
      {resumenErrores.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Revisá estos campos:</strong>{" "}
          {resumenErrores.join(" • ")}
        </div>
      )}

      {/* HEADER: Foto a la izquierda + campos inline a la derecha */}
      <div className="-mx-4 -mt-4 px-4 pt-4 pb-4 border-b bg-muted/20 rounded-t-xl">
        <div className="grid gap-4 items-center grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr]">
          {/* Foto cuadrada */}
          <label className="relative group cursor-pointer">
            <div className="w-[120px] sm:w-[160px] aspect-square rounded-xl overflow-hidden ring-1 ring-border bg-background shadow-sm">
              {previewFoto ? (
                <img src={previewFoto} alt="Foto de perfil" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
                  Subir foto
                </div>
              )}
            </div>
            <div className="absolute inset-0 rounded-xl grid place-items-center text-[11px] font-medium text-foreground/90 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
              Cambiar foto
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFoto(e.target.files?.[0] || null)}
            />
          </label>

          {/* Lado derecho: Nombre, Apellido, PUESTO + CATEGORÍA */}
          <div className="flex flex-col gap-2">
            {/* NOMBRE + APELLIDO (inline) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <InlineEditable
                refInput={refs.nombre}
                value={nombre}
                placeholder="Nombre"
                editing={editNombre}
                onEdit={() => setEditNombre(true)}
                onChange={setNombre}
                onBlur={() => setEditNombre(false)}
                error={errors.nombre}
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
              />
            </div>

            {/* PUESTO + CATEGORÍA como chips editables */}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <InlineSelect
                refSelect={refs.puesto}
                label="Puesto"
                value={puesto}
                options={puestos}
                placeholder="Seleccionar puesto"
                editing={editPuesto}
                onEdit={() => setEditPuesto(true)}
                onChange={setPuesto}
                onBlur={() => setEditPuesto(false)}
                error={errors.puesto}
              />
              <InlineSelect
                label="Categoría"
                value={categoria}
                options={opcionesCategoria}
                placeholder="Seleccionar categoría"
                editing={editCategoria}
                onEdit={() => setEditCategoria(true)}
                onChange={setCategoria}
                onBlur={() => setEditCategoria(false)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Apodo */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground">Apodo (opcional)</label>
        <input
          className={inputCls(false)}
          value={apodo}
          onChange={(e) => setApodo(e.target.value)}
          placeholder="Ej: Leo, Gabi…"
        />
      </div>

      {/* DNI / CUIL */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">DNI</label>
          <input
            ref={refs.dni}
            className={inputCls(!!errors.dni)}
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            required
            aria-invalid={!!errors.dni}
            inputMode="numeric"
          />
          {errors.dni && <p className="mt-1 text-xs text-red-600">{errors.dni}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">CUIL</label>
          <input
            ref={refs.cuil}
            className={inputCls(!!errors.cuil)}
            value={cuil}
            onChange={(e) => setCuil(e.target.value)}
            required
            aria-invalid={!!errors.cuil}
            inputMode="numeric"
            maxLength={11}
          />
          {errors.cuil && <p className="mt-1 text-xs text-red-600">{errors.cuil}</p>}
        </div>
      </div>

      {/* Email / Celular */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Fecha de ingreso</label>
          <div className="relative">
            <input
              ref={refs.fechaIngreso}
              type="date"
              className={`${inputCls(!!errors.fechaIngreso)} pr-8`}
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              required
              aria-invalid={!!errors.fechaIngreso}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">📅</span>
          </div>
          {errors.fechaIngreso && <p className="mt-1 text-xs text-red-600">{errors.fechaIngreso}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Celular</label>
          <input
            className={inputCls(false)}
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            placeholder="Ej: 11 1234 5678"
          />
        </div>
      </div>

      {/* DOMICILIO */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground">Domicilio</label>
        <input
          ref={refs.domicilio}
          className={inputCls(!!errors.domicilio)}
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
          placeholder="Ej: Calle 123, Piso 4, Depto A"
          aria-invalid={!!errors.domicilio}
        />
        {errors.domicilio && <p className="mt-1 text-xs text-red-600">{errors.domicilio}</p>}
      </div>

      {/* Fecha de ingreso */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground">Email</label>
        <div className="flex">
          <input
            ref={refs.email}
            type="text"
            className={`flex-1 rounded-l-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 ${!!errors.email
              ? "border-red-500 focus-visible:ring-red-500 z-10"
              : "border-border focus-visible:ring-ring"
              }`}
            value={emailUser}
            onChange={(e) => setEmailUser(e.target.value)}
            placeholder="usuario"
            required
            aria-invalid={!!errors.email}
          />
          <select
            className="rounded-r-md border border-l-0 border-border bg-slate-50 px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={emailDomain}
            onChange={(e) => setEmailDomain(e.target.value)}
          >
            <option value="@diagnos.com.ar">@diagnos.com.ar</option>
            <option value="@gmail.com">@gmail.com</option>
            <option value="@hotmail.com">@hotmail.com</option>
          </select>
        </div>
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
      </div>

      {/* Área / Sector */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Área</label>
          <select
            ref={refs.areaId}
            className={inputCls(!!errors.areaId)}
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            required
            aria-invalid={!!errors.areaId}
          >
            <option value="">{areas.length ? "Seleccione un área" : "No hay áreas"}</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </select>
          {errors.areaId && <p className="mt-1 text-xs text-red-600">{errors.areaId}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Sector</label>
          <select
            ref={refs.sectorId}
            className={inputCls(!!errors.sectorId)}
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            required
            aria-invalid={!!errors.sectorId}
            disabled={!areaId || !sectoresDelArea.length}
          >
            <option value="">
              {!areaId ? "Elegí un área primero" : (sectoresDelArea.length ? "Seleccione un sector" : "Sin sectores")}
            </option>
            {sectoresDelArea.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </select>
          {errors.sectorId && <p className="mt-1 text-xs text-red-600">{errors.sectorId}</p>}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit">{empleadoInicial ? "Guardar cambios" : "Guardar"}</Button>
      </div>
    </form>
  );
}

/* ------------ Componentes inline edit ----------------- */
function InlineEditable({ value, placeholder, editing, onEdit, onChange, onBlur, error, refInput }) {
  if (editing) {
    return (
      <div className="flex flex-col">
        <input
          ref={refInput}
          autoFocus
          className={`border-b bg-transparent outline-none text-base font-semibold px-1 py-0.5 min-w-[140px] ${error ? "border-red-500" : "border-input"
            }`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
        />
        {error && <span className="text-[11px] text-red-600 mt-1">{error}</span>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group inline-flex items-center gap-2 text-base font-semibold hover:underline underline-offset-4"
      title={`Editar ${placeholder?.toLowerCase() || "valor"}`}
    >
      {value || <span className="text-muted-foreground">{placeholder}</span>}
      <Pencil size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </button>
  );
}

function InlineSelect({
  label,
  value,
  options = [],
  placeholder = "Seleccionar…",
  editing,
  onEdit,
  onChange,
  onBlur,
  error,
  refSelect,
}) {
  if (editing) {
    return (
      <div className="flex flex-col">
        <select
          ref={refSelect}
          autoFocus
          className={`rounded-full border px-3 py-1 text-sm bg-background ${error ? "border-red-500" : ""}`}
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
        {error && <span className="text-[11px] text-red-600 mt-1">{error}</span>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      title={`Editar ${label}`}
      className="group inline-flex items-center gap-2"
    >
      <span className={`text-[12px] rounded-full border px-2 py-0.5 bg-background shadow-sm ${error ? "border-red-500" : ""}`}>
        {value || <span className="text-muted-foreground">{label}</span>}
      </span>
      <Pencil size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </button>
  );
}
