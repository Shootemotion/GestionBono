// src/pages/LegajoEmpleado.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Home, Copy, Check, Briefcase, Building2, UserCircle, Mail, Phone, Calendar, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import CarreraTable from "@/components/CarreraTable.jsx";
import CapacitacionesTable from "@/components/CapacitacionesTable.jsx";
import { API_ORIGIN } from "@/lib/api";

/* ---------- UI helpers ---------- */
const EstadoTag = ({ estado = "ACTIVO" }) => {
  const map = {
    VINCULADO: "bg-emerald-500/10 text-emerald-700 border border-emerald-200",
    ACTIVO: "bg-emerald-500/10 text-emerald-700 border border-emerald-200", // Legacy support
    SUSPENDIDO: "bg-amber-500/10 text-amber-700 border border-amber-200", // Legacy
    DESVINCULADO: "bg-rose-500/10 text-rose-700 border border-rose-200",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wide ${map[estado] || "bg-slate-100 text-slate-600"}`}>
      {estado}
    </span>
  );
};

const Label = ({ children }) => (
  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 ml-1">{children}</div>
);

const Field = ({ label, value }) => (
  <div className="group">
    <Label>{label}</Label>
    <div className="min-h-[2.5rem] rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 font-medium group-hover:bg-slate-50 transition-colors">
      {value ?? "—"}
    </div>
  </div>
);

const FieldInput = ({ label, type = "text", value, onChange, disabled, ...props }) => (
  <div>
    <Label>{label}</Label>
    <input
      type={type}
      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 placeholder:text-slate-300"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      {...props}
    />
  </div>
);

const fmtMoney = (n, cur = "ARS") =>
  (n === null || n === undefined || n === "") ? "—"
    : new Intl.NumberFormat("es-AR", { style: "currency", currency: cur, maximumFractionDigits: 2 })
      .format(Number(n));

/* ---------- helpers de imagen (mismos que en EmpleadoCard) ---------- */
const fotoSrc = (empleado) => {
  const url = empleado?.fotoUrl;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
};

/* ---------- Pestañas ---------- */
const TABS = ["Informacion basica", "Datos laborales", "Capacitaciones", "Documentos"];

/* ---------- fallback de puestos/categorías ---------- */
const DEFAULT_PUESTOS = [
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
const DEFAULT_CATS = ["Staff", "Profesional", "Jefatura", "Gerencia", "Dirección"];

export default function LegajoEmpleado() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);

  const isRRHH = !!(user?.isSuper || user?.isRRHH || user?.caps?.includes?.("nomina:editar"));
  const isOwnProfile = user?.empleadoId === id || user?.empleado?._id === id;
  const canEditBasic = isRRHH || isOwnProfile;

  // Catálogos para pick lists
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [puestos, setPuestos] = useState(DEFAULT_PUESTOS);
  const [categorias] = useState(DEFAULT_CATS);

  // Tab desde URL (?tab=datos-laborales)
  const initialTab = (() => {
    const q = (searchParams.get("tab") || "").toLowerCase();
    const map = {
      "informacion-basica": TABS[0],
      "datos-laborales": TABS[1],
      "capacitaciones": TABS[2],
      "documentos": TABS[3],
    };
    return map[q] || TABS[0];
  })();
  const [tab, setTab] = useState(initialTab);

  // Formularios
  const [estadoLaboral, setEstadoLaboral] = useState("ACTIVO");
  const cvInputRef = useRef(null);
  const [sueldo, setSueldo] = useState({
    monto: "",
    moneda: "ARS",
    vigenteDesde: new Date().toISOString().slice(0, 10),
    comentario: "", // Initialized comentario
  });

  // Edición de info básica (CENTRO)
  const [editBasic, setEditBasic] = useState(false);
  const [basicForm, setBasicForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    celular: "",
    domicilio: "",
    categoria: "",
    puesto: "",
    area: "",
    sector: "",
    fechaIngreso: new Date().toISOString().slice(0, 10),
    dni: "",
    cuil: "",
  });

  // Resúmenes (chips)
  const [resumeCarrera, setResumeCarrera] = useState({ ultimoPuesto: null });
  const [resumeCaps, setResumeCaps] = useState({ total: 0, vencen30: 0 });

  // Carga inicial
  useEffect(() => {
    (async () => {
      try {
        const [e, a, s] = await Promise.all([
          api(`/empleados/${id}`),
          api(`/areas`).catch(() => []),
          api(`/sectores`).catch(() => []),
        ]);
        setEmp(e);
        setAreas(a || []);
        setSectores(s || []);
        setEstadoLaboral(e?.estadoLaboral || "ACTIVO");

        setSueldo({
          monto: e?.sueldoBase?.monto ?? "",
          moneda: e?.sueldoBase?.moneda ?? "ARS",
          vigenteDesde: e?.sueldoBase?.vigenteDesde
            ? String(e.sueldoBase.vigenteDesde).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          comentario: "", // Initialize comentario when loading existing data
        });

        setBasicForm({
          nombre: e?.nombre ?? "",
          apellido: e?.apellido ?? "",
          apodo: e?.apodo ?? "",
          email: e?.email ?? "",
          celular: e?.celular ?? "",
          domicilio: e?.domicilio ?? "",
          categoria: e?.categoria ?? "",
          puesto: e?.puesto ?? "",
          area: e?.area?._id || e?.area || "",
          sector: e?.sector?._id || e?.sector || "",
          fechaIngreso: e?.fechaIngreso ? String(e.fechaIngreso).slice(0, 10) : new Date().toISOString().slice(0, 10),
          dni: e?.dni ?? "",
          cuil: e?.cuil ?? "",
        });
      } catch (err) {
        console.error(err);
        toast.error("No se pudo cargar el legajo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Traer puestos si hay endpoint (no rompe si 404)
  // Traer puestos si hay endpoint (no rompe si 404, pero ensucia log)
  /*
  useEffect(() => {
    (async () => {
      try {
        const p = await api(`/puestos`).catch(() => null);
        if (Array.isArray(p) && p.length) {
          const nombres = p.map((x) => x?.nombre).filter(Boolean);
          if (nombres.length) setPuestos(nombres);
        }
      } catch { }
    })();
  }, []);
  */

  // Resúmenes opcionales
  useEffect(() => {
    (async () => {
      try {
        const r = await api(`/empleados/${id}/carrera/resumen`).catch(() => null);
        if (r) setResumeCarrera({ ultimoPuesto: r?.ultimoPuesto || null });
      } catch { }
      try {
        const c = await api(`/empleados/${id}/capacitaciones/resumen`).catch(() => null);
        if (c) setResumeCaps({ total: Number(c?.total || 0), vencen30: Number(c?.vencen30 || 0) });
      } catch { }
    })();
  }, [id]);

  // Persistir tab en URL
  useEffect(() => {
    const key =
      tab === TABS[0]
        ? "informacion-basica"
        : tab === TABS[1]
          ? "datos-laborales"
          : tab === TABS[2]
            ? "capacitaciones"
            : "documentos";
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", key);
      return p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const historico = useMemo(() => {
    const h = emp?.sueldoBase?.historico || [];
    return h.slice().sort((a, b) => new Date(b?.desde || 0) - new Date(a?.desde || 0));
  }, [emp]);

  const sectoresFiltrados = useMemo(() => {
    if (!basicForm.area) return sectores;
    return (sectores || []).filter((s) => {
      const idArea = String(s?.areaId?._id || s?.areaId || "");
      return idArea === String(basicForm.area);
    });
  }, [basicForm.area, sectores]);

  /* ---------- Acciones ---------- */
  const onBack = () => {
    navigate("/");
  };

  const onGuardarEstado = async () => {
    try {
      const resp = await api(`/empleados/${id}`, { method: "PATCH", body: { estadoLaboral } });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      toast.success("Estado laboral actualizado.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el estado.");
    }
  };

  const onGuardarBasica = async () => {
    try {
      const payload = { ...basicForm };

      // Validate email domain
      if (payload.email && !payload.email.endsWith("@diagnos.com.ar")) {
        return toast.error("El email debe ser del dominio @diagnos.com.ar");
      }
      if (payload.area && payload.area._id) payload.area = payload.area._id;
      if (payload.sector && payload.sector._id) payload.sector = payload.sector._id;

      const resp = await api(`/empleados/${id}`, { method: "PATCH", body: payload });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      setEditBasic(false);
      toast.success("Información básica actualizada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar la información básica.");
    }
  };

  const onGuardarSueldo = async () => {
    try {
      const payload = {
        monto: Number(sueldo.monto),
        moneda: sueldo.moneda || "ARS",
        vigenteDesde: sueldo.vigenteDesde ? new Date(sueldo.vigenteDesde) : new Date(),
        comentario: sueldo.comentario || undefined, // Include comentario in payload
      };
      if (!payload.monto || payload.monto <= 0) return toast.error("Ingresá un monto válido.");
      const resp = await api(`/empleados/${id}/sueldo`, { method: "POST", body: payload });
      const updEmp = resp?.empleado || resp;
      setEmp(updEmp);
      setSueldo({
        monto: updEmp?.sueldoBase?.monto ?? "",
        moneda: updEmp?.sueldoBase?.moneda ?? "ARS",
        vigenteDesde: updEmp?.sueldoBase?.vigenteDesde
          ? String(updEmp.sueldoBase.vigenteDesde).slice(0, 10)
          : sueldo.vigenteDesde,
        comentario: "", // Clear comentario after saving
      });
      toast.success("Sueldo actualizado y registrado en histórico.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el sueldo.");
    }
  };

  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fd = new FormData();
      fd.append("cv", file);
      const resp = await api(`/empleados/${id}/cv`, { method: "POST", body: fd });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      toast.success("CV subido correctamente.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo subir el CV.");
    } finally {
      if (cvInputRef.current) cvInputRef.current.value = "";
    }
  };

  const onEliminarSueldo = async (subId) => {
    if (!window.confirm("¿Estás seguro de eliminar este registro histórico?")) return;
    try {
      const resp = await api(`/empleados/${id}/sueldo/${subId}`, { method: "DELETE" });
      const updEmp = resp?.empleado || resp;
      setEmp(updEmp);
      toast.success("Registro eliminado.");
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar.");
    }
  };

  const onSubirFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("foto", file);
      const resp = await api(`/empleados/${id}/foto`, { method: "POST", body: fd });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      toast.success("Foto actualizada.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo subir la foto.");
    }
  };

  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedEmp, setCopiedEmp] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyReferente = () => {
    const ref = emp?.area?.referentes?.[0];
    if (!ref) return;
    const text = `Referente: ${ref.nombre} ${ref.apellido}\nEmail: ${ref.email}\nCel: ${ref.celular || "—"}`;
    navigator.clipboard.writeText(text);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
    toast.success("Datos del referente copiados.");
  };

  const copyEmpleado = () => {
    const text = `Empleado: ${emp.nombre} ${emp.apellido}\nEmail: ${emp.email}\nCel: ${emp.celular || "—"}`;
    navigator.clipboard.writeText(text);
    setCopiedEmp(true);
    setTimeout(() => setCopiedEmp(false), 2000);
    toast.success("Datos de contacto copiados.");
  };

  const copyAll = () => {
    let text = `DATOS DE CONTACTO\n\n`;
    text += `Empleado: ${emp.nombre} ${emp.apellido}\n`;
    text += `Email: ${emp.email}\n`;
    text += `Cel: ${emp.celular || "—"}\n\n`;

    if (emp?.area?.referentes?.[0]) {
      const ref = emp.area.referentes[0];
      text += `Referente: ${ref.nombre} ${ref.apellido}\n`;
      text += `Email: ${ref.email}\n`;
      text += `Cel: ${ref.celular || "—"}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success("Tarjeta completa copiada.");
  };

  if (loading) return <div className="p-6">Cargando…</div>;
  if (!emp) return <div className="p-6 text-sm text-muted-foreground">Empleado no encontrado.</div>;

  // Chips
  const sueldoVigenteTxt = fmtMoney(emp?.sueldoBase?.monto, emp?.sueldoBase?.moneda);
  const ultimoPuesto = resumeCarrera?.ultimoPuesto || emp?.puesto || "—";
  const capsTotales = resumeCaps?.total ?? 0;
  const capsVencen = resumeCaps?.vencen30 ?? 0;

  const avatar = fotoSrc(emp);

  return (
    <div className="min-h-screen bg-[#f5f9fc]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 font-sans">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-sm border border-slate-100">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-50 to-indigo-50/50" />

          <div className="relative flex flex-col md:flex-row items-center md:items-end justify-between gap-6 pt-8">
            <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
              <div className="h-24 w-24 rounded-full p-1 bg-white shadow-lg ring-1 ring-slate-100 -mt-8 md:mt-0 relative group">
                <div className="h-full w-full rounded-full overflow-hidden bg-slate-100 relative">
                  {avatar ? (
                    <img src={avatar} alt="foto" className="h-full w-full object-cover" />
                  ) : (
                    <img
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        `${emp.nombre} ${emp.apellido}`
                      )}&backgroundColor=e2e8f0&textColor=475569`}
                      alt="iniciales"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {canEditBasic && (
                    <label className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-all duration-300 backdrop-blur-[1px]">
                      <input type="file" accept="image/*" className="hidden" onChange={onSubirFoto} />
                      <span className="text-white text-[10px] font-medium tracking-wide uppercase">Editar</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="mb-1">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {emp.nombre} {emp.apellido}
                </h1>
                <div className="text-sm font-medium text-slate-500 mt-1 flex flex-wrap justify-center md:justify-start items-center gap-2">
                  <span>{emp.puesto || "Sin puesto definido"}</span>
                  <span className="text-slate-300">•</span>
                  {isRRHH && <EstadoTag estado={emp?.estadoLaboral || "ACTIVO"} />}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {isRRHH && (
                <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                  <select
                    className="bg-transparent text-xs font-semibold text-slate-700 px-2 py-1.5 outline-none cursor-pointer"
                    value={estadoLaboral}
                    onChange={(e) => setEstadoLaboral(e.target.value)}
                  >
                    <option value="VINCULADO">VINCULADO</option>
                    <option value="DESVINCULADO">DESVINCULADO</option>
                  </select>
                  <button
                    onClick={onGuardarEstado}
                    className="px-3 py-1.5 bg-white rounded-md text-xs font-medium text-slate-700 shadow-sm border border-slate-200 hover:text-blue-600 transition-colors"
                  >
                    Guardar
                  </button>
                </div>
              )}
              <button
                onClick={onBack}
                className="h-9 px-4 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center gap-2"
              >
                <Home size={16} /> Home
              </button>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar IZQUIERDO */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Chips resumen */}
            <div className="grid grid-cols-2 gap-4">
              {isRRHH && (
                <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sueldo</div>
                  <div className="mt-2 text-lg font-bold text-slate-800 tracking-tight">{sueldoVigenteTxt}</div>
                  <div className="mt-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 w-fit px-1.5 py-0.5 rounded-md">
                    Desde {emp?.sueldoBase?.vigenteDesde ? String(emp.sueldoBase.vigenteDesde).slice(0, 10) : "—"}
                  </div>
                </div>
              )}
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Puesto Actual</div>
                <div className="mt-2 text-sm font-bold text-slate-800 leading-tight">{ultimoPuesto}</div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Capacitaciones</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-800">{capsTotales}</span>
                  <span className="text-xs text-slate-500 font-medium">realizadas</span>
                </div>
              </div>
              {isRRHH && (
                <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Vencimientos</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${capsVencen > 0 ? "text-amber-500" : "text-slate-800"}`}>{capsVencen}</span>
                    <span className="text-xs text-slate-500 font-medium">en 30 días</span>
                  </div>
                </div>
              )}
            </div>

            {/* Snapshot */}
            <div className="rounded-2xl bg-white shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
              {/* Header Gradient */}
              <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <UserCircle size={18} className="text-white/80" />
                  Datos Clave
                </h3>
                <button onClick={copyAll} className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-lg" title="Copiar toda la tarjeta">
                  {copiedAll ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Contacto Empleado */}
                <div className="relative group">
                  <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-violet-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                      Contacto Directo
                    </h4>
                    <button onClick={copyEmpleado} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Copiar contacto">
                      {copiedEmp ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>

                  <div className="space-y-3 pl-1">
                    <div className="flex items-start gap-3">
                      <Mail size={16} className="text-slate-400 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-xs text-slate-500 block mb-0.5">Email</span>
                        <div className="text-sm font-medium text-slate-800 break-all">{emp.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone size={16} className="text-slate-400" />
                      <div className="flex-1">
                        <span className="text-xs text-slate-500 block mb-0.5">Celular</span>
                        <div className="text-sm font-medium text-slate-800">{emp.celular || "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 my-4" />

                {/* Identificación */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">DNI</span>
                    <div className="font-mono text-sm font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 inline-block w-full text-center">
                      {emp.dni}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">CUIL</span>
                    <div className="font-mono text-sm font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 inline-block w-full text-center">
                      {emp.cuil}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/50">
                  <Calendar size={16} className="text-blue-500" />
                  <div>
                    <span className="text-xs text-blue-400 block font-medium">Fecha de Ingreso</span>
                    <div className="text-sm font-bold text-blue-700">{emp.fechaIngreso ? String(emp.fechaIngreso).slice(0, 10) : "—"}</div>
                  </div>
                </div>

                <div className="border-t border-slate-100 my-4" />

                {/* Estructura & Referente */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Organización</h4>

                  <div className="flex items-start gap-3 mb-4">
                    <Building2 size={16} className="text-slate-400 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{emp?.area?.nombre || "—"}</div>
                      <div className="text-xs text-slate-500">{emp?.sector?.nombre || "—"}</div>
                    </div>
                  </div>

                  {emp?.area?.referentes?.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                          Referente
                        </span>
                        <button onClick={copyReferente} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Copiar datos">
                          {copiedRef ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                      {emp.area.referentes.map(ref => (
                        <div key={ref._id} className="text-sm space-y-1">
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold">
                              {ref.nombre[0]}{ref.apellido[0]}
                            </div>
                            {ref.nombre} {ref.apellido}
                          </div>
                          <div className="pl-7 space-y-0.5">
                            <div className="text-xs text-slate-500">{ref.email}</div>
                            <div className="text-xs text-slate-400">{ref.celular || "—"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>


          </aside>

          {/* PANEL CENTRAL: Tabs siempre arriba + contenido */}
          <section className="lg:col-span-8 space-y-6">
            {/* Tabs (sticky) */}
            <div className="sticky top-4 z-20">
              <div className="rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200/60 p-1.5 flex flex-wrap gap-1">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 min-w-[120px] px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${tab === t
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido por pestaña */}
            {/* Información básica */}
            {tab === "Informacion basica" && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800">Información básica</h3>
                  {!editBasic ? (
                    canEditBasic && (
                      <button
                        onClick={() => setEditBasic(true)}
                        className="text-xs font-semibold rounded-lg px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        Editar Información
                      </button>
                    )
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={onGuardarBasica}
                        className="text-xs font-semibold rounded-lg px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
                      >
                        Guardar cambios
                      </button>
                      <button
                        onClick={() => {
                          setEditBasic(false);
                          setBasicForm({
                            nombre: emp?.nombre ?? "",
                            apellido: emp?.apellido ?? "",
                            apodo: emp?.apodo ?? "",
                            email: emp?.email ?? "",
                            celular: emp?.celular ?? "",
                            domicilio: emp?.domicilio ?? "",
                            categoria: emp?.categoria ?? "",
                            puesto: emp?.puesto ?? "",
                            area: emp?.area?._id || emp?.area || "",
                            sector: emp?.sector?._id || emp?.sector || "",
                            fechaIngreso: emp?.fechaIngreso ? String(emp.fechaIngreso).slice(0, 10) : new Date().toISOString().slice(0, 10),
                            dni: emp?.dni ?? "",
                            cuil: emp?.cuil ?? "",
                          });
                        }}
                        className="text-xs rounded-md px-3 py-1.5 bg-muted hover:bg-muted/70"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {!editBasic ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Nombre" value={emp.nombre} />
                    <Field label="Apellido" value={emp.apellido} />
                    <Field label="Apodo" value={emp.apodo} />
                    <Field label="Email" value={emp.email || "—"} />
                    <Field label="Celular" value={emp.celular || "—"} />
                    <Field label="Domicilio" value={emp.domicilio || "—"} />
                    <Field label="Categoría" value={emp.categoria || "—"} />
                    <Field label="Puesto" value={emp.puesto || "—"} />
                    <Field label="Área" value={emp?.area?.nombre || "—"} />
                    <Field label="Sector" value={emp?.sector?.nombre || "—"} />
                    <Field label="Fecha de ingreso" value={emp?.fechaIngreso ? String(emp.fechaIngreso).slice(0, 10) : "—"} />
                    <Field label="DNI" value={emp?.dni || "—"} />
                    <Field label="CUIL" value={emp?.cuil || "—"} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FieldInput label="Nombre" value={basicForm.nombre} onChange={(v) => setBasicForm(s => ({ ...s, nombre: v }))} disabled={!isRRHH} />
                    <FieldInput label="Apellido" value={basicForm.apellido} onChange={(v) => setBasicForm(s => ({ ...s, apellido: v }))} disabled={!isRRHH} />
                    <FieldInput label="Apodo (Opcional)" value={basicForm.apodo} onChange={(v) => setBasicForm(s => ({ ...s, apodo: v }))} disabled={!canEditBasic} />
                    <FieldInput label="Email" type="email" value={basicForm.email} onChange={(v) => setBasicForm(s => ({ ...s, email: v }))} />
                    <FieldInput
                      label="Celular"
                      value={basicForm.celular}
                      onChange={(v) => {
                        const val = v.replace(/[^0-9]/g, "");
                        if (val.length <= 12) setBasicForm(s => ({ ...s, celular: val }));
                      }}
                      maxLength={12}
                      placeholder="2975123123"
                    />
                    <FieldInput label="Domicilio" value={basicForm.domicilio} onChange={(v) => setBasicForm(s => ({ ...s, domicilio: v }))} disabled={!isRRHH} />

                    <div>
                      <Label>Puesto</Label>
                      <select
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                        value={basicForm.puesto}
                        onChange={(e) => setBasicForm(s => ({ ...s, puesto: e.target.value }))}
                        disabled={!isRRHH}
                      >
                        <option value="">{puestos.length ? "Seleccionar puesto" : "Sin opciones"}</option>
                        {puestos.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <select
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                        value={basicForm.categoria}
                        onChange={(e) => setBasicForm(s => ({ ...s, categoria: e.target.value }))}
                        disabled={!isRRHH}
                      >
                        <option value="">Seleccionar categoría</option>
                        {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <Label>Área</Label>
                      <select
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                        value={basicForm.area}
                        onChange={(e) => {
                          const areaId = e.target.value;
                          setBasicForm(s => ({ ...s, area: areaId, sector: "" }));
                        }}
                        disabled={!isRRHH}
                      >
                        <option value="">{areas.length ? "Seleccione un área" : "No hay áreas"}</option>
                        {areas.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Sector</Label>
                      <select
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                        value={basicForm.sector}
                        onChange={(e) => setBasicForm(s => ({ ...s, sector: e.target.value }))}
                        disabled={!isRRHH || !basicForm.area || sectoresFiltrados.length === 0}
                      >
                        <option value="">
                          {!basicForm.area ? "Elegí un área primero" : (sectoresFiltrados.length ? "Seleccione un sector" : "Sin sectores")}
                        </option>
                        {sectoresFiltrados.map(s => <option key={s._id} value={s._id}>{s.nombre}</option>)}
                      </select>
                    </div>

                    <FieldInput label="Fecha de ingreso" type="date" value={basicForm.fechaIngreso} onChange={(v) => setBasicForm(s => ({ ...s, fechaIngreso: v }))} disabled={!isRRHH} />
                    <FieldInput
                      label="DNI"
                      value={basicForm.dni}
                      onChange={(v) => setBasicForm(s => ({ ...s, dni: v.replace(/[^0-9]/g, "") }))}
                      disabled={!isRRHH}
                    />
                    <FieldInput
                      label="CUIL"
                      value={basicForm.cuil}
                      onChange={(v) => setBasicForm(s => ({ ...s, cuil: v.replace(/[^0-9-]/g, "") }))}
                      disabled={!isRRHH}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Datos laborales */}
            {/* Datos laborales */}
            {tab === "Datos laborales" && (
              <>
                {isRRHH && (
                  <div className="rounded-xl bg-card ring-1 ring-border/60 p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Sueldo base</h3>
                    </div>

                    {/* ACTUAL */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 mb-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-xs text-muted-foreground">Sueldo actual</div>
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700 tracking-wider">Vigente</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800">
                          {fmtMoney(emp?.sueldoBase?.monto, emp?.sueldoBase?.moneda)}
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="text-xs text-slate-500 font-medium">
                            Desde: {emp?.sueldoBase?.vigenteDesde ? String(emp.sueldoBase.vigenteDesde).slice(0, 10) : "—"}
                          </div>
                          {emp?.sueldoBase?.comentario && (
                            <div className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-2 max-w-sm truncate" title={emp.sueldoBase.comentario}>
                              “{emp.sueldoBase.comentario}”
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* FORM ACTUALIZAR */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="relative">
                        <FieldInput
                          label="Nuevo Monto"
                          type="number"
                          value={sueldo.monto}
                          onChange={(v) => setSueldo((s) => ({ ...s, monto: v }))}
                          disabled={!isRRHH}
                        />
                        {/* Percentage Badge */}
                        {emp?.sueldoBase?.monto > 0 && sueldo.monto > 0 && sueldo.monto !== emp.sueldoBase.monto && (
                          <div className={`absolute right-0 top-0 text-xs font-bold px-2 py-1 rounded-bl-lg rounded-tr-lg ${sueldo.monto > emp.sueldoBase.monto ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}>
                            {sueldo.monto > emp.sueldoBase.monto ? "▲" : "▼"}
                            {Math.abs(((sueldo.monto - emp.sueldoBase.monto) / emp.sueldoBase.monto) * 100).toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Moneda</Label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                          value={sueldo.moneda}
                          onChange={(e) => setSueldo((s) => ({ ...s, moneda: e.target.value }))}
                          disabled={!isRRHH}
                        >
                          <option>ARS</option>
                          <option>USD</option>
                        </select>
                      </div>
                      <FieldInput
                        label="Vigente desde"
                        type="date"
                        value={sueldo.vigenteDesde}
                        onChange={(v) => setSueldo((s) => ({ ...s, vigenteDesde: v }))}
                        disabled={!isRRHH}
                      />
                      <div className="flex items-end">
                        <button
                          disabled={!isRRHH}
                          onClick={onGuardarSueldo}
                          className="w-full rounded-md px-3 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Actualizar sueldo
                        </button>
                      </div>
                      <div className="md:col-span-4">
                        <FieldInput
                          label="Motivo / Comentario (Opcional)"
                          value={sueldo.comentario}
                          onChange={(v) => setSueldo((s) => ({ ...s, comentario: v }))}
                          placeholder="Ej: Aumento anual por desempeño..."
                          disabled={!isRRHH}
                        />
                      </div>
                    </div>

                    {/* HISTÓRICO */}
                    <div className="mt-4">
                      <div className="text-[11px] text-muted-foreground mb-1">Histórico (no incluye el vigente)</div>
                      <div className="overflow-x-auto">
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60">
                          <table className="min-w-[560px] w-full text-sm table-auto">
                            <thead className="sticky top-0 bg-muted/40">
                              <tr className="text-[11px] uppercase text-muted-foreground">
                                <th className="text-left px-3 py-2">Fecha</th>
                                <th className="text-left px-3 py-2">Monto Ant.</th>
                                <th className="text-left px-3 py-2">Monto Nuevo</th>
                                <th className="text-left px-3 py-2">%</th>
                                <th className="text-left px-3 py-2">Moneda</th>
                                <th className="text-left px-3 py-2">Comentario</th>
                                <th className="px-3 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Combinar actual con histórico para mostrar toda la evolución
                                const current = {
                                  _id: "current",
                                  monto: emp?.sueldoBase?.monto,
                                  moneda: emp?.sueldoBase?.moneda,
                                  vigenteDesde: emp?.sueldoBase?.vigenteDesde,
                                  comentario: emp?.sueldoBase?.comentario,
                                  isCurrent: true
                                };

                                // Si no hay sueldo actual definido, mostrar solo histórico
                                const rawHist = historico || [];
                                const sortedHist = [...rawHist].sort((a, b) => new Date(b.desde) - new Date(a.desde));

                                // Si hay un monto actual, lo ponemos primero
                                const allSalaries = (current.monto)
                                  ? [current, ...sortedHist]
                                  : sortedHist;

                                if (!allSalaries.length) {
                                  return (
                                    <tr>
                                      <td className="px-3 py-2 text-sm text-muted-foreground" colSpan={7}>
                                        Sin registros.
                                      </td>
                                    </tr>
                                  );
                                }

                                return allSalaries.map((h, i, arr) => {
                                  const prevItem = arr[i + 1]; // El siguiente en la lista (más antiguo)
                                  const prevAmount = prevItem?.monto;

                                  const diffPercent = prevAmount
                                    ? ((h.monto - prevAmount) / prevAmount) * 100
                                    : null;

                                  const dateStr = h.isCurrent
                                    ? (h.vigenteDesde ? String(h.vigenteDesde).slice(0, 10) : "—")
                                    : (h.desde ? String(h.desde).slice(0, 10) : "—");

                                  return (
                                    <tr key={h._id || i} className={`border-t border-border/50 transition-colors group ${h.isCurrent ? "bg-emerald-50/50 hover:bg-emerald-50" : "odd:bg-background even:bg-muted/20 hover:bg-muted/40"}`}>
                                      <td className="px-3 py-2 font-medium">
                                        {dateStr}
                                        {h.isCurrent && <span className="ml-2 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Actual</span>}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground text-xs">
                                        {prevAmount ? fmtMoney(prevAmount, prevItem?.moneda) : "—"}
                                      </td>
                                      <td className="px-3 py-2 font-medium bg-slate-50/50">{fmtMoney(h?.monto, h?.moneda)}</td>
                                      <td className="px-3 py-2 font-mono text-xs">
                                        {diffPercent != null ? (
                                          <span className={diffPercent > 0 ? "text-emerald-600 font-bold" : diffPercent < 0 ? "text-red-600 font-bold" : "text-slate-400"}>
                                            {diffPercent > 0 ? "+" : ""}{diffPercent.toFixed(1)}%
                                          </span>
                                        ) : <span className="text-slate-300">—</span>}
                                      </td>
                                      <td className="px-3 py-2">{h?.moneda ?? "—"}</td>
                                      <td className="px-3 py-2 text-xs text-muted-foreground italic max-w-[150px] truncate" title={h?.comentario}>{h?.comentario || "—"}</td>
                                      <td className="px-3 py-2 text-right">
                                        {isRRHH && !h.isCurrent && (
                                          <button
                                            onClick={() => onEliminarSueldo(h._id)}
                                            className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                            title="Eliminar registro"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Carrera / Historial de puestos */}
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                  <h3 className="text-sm font-semibold mb-2">Desarrollo Profesional</h3>
                  <div className="overflow-x-auto">
                    <div className="min-w-0">
                      <CarreraTable empleadoId={id} canEdit={isRRHH} areas={areas} sectores={sectores} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Capacitaciones */}
            {tab === "Capacitaciones" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                <div className="overflow-x-auto">
                  <div className="min-w-0">
                    <CapacitacionesTable empleadoId={id} canEdit={isRRHH} />
                  </div>
                </div>
              </div>
            )}

            {/* Documentos */}
            {tab === "Documentos" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">CV del empleado</h3>
                  {emp?.cvUrl && (
                    <a
                      href={(() => {
                        const url = emp.cvUrl;
                        if (/^https?:\/\//i.test(url)) return url;
                        const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
                        return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
                      })()}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      Ver CV actual
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={cvInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleCvUpload}
                    disabled={!canEditBasic}
                  />
                  <button
                    disabled={!canEditBasic}
                    onClick={() => cvInputRef.current?.click()}
                    className="rounded-md px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Subir CV
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Formatos: PDF, DOC, DOCX. Máx 5 MB.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
