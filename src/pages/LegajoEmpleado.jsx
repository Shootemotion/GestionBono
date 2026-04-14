import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Home, Copy, Check, Trophy, FileText, Calendar, HelpCircle, Eye, EyeOff } from "lucide-react";
import { api, API_ORIGIN } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTour } from "@/hooks/useTour";
import CarreraTable from "@/components/CarreraTable.jsx";
import CapacitacionesTable from "@/components/CapacitacionesTable.jsx";
import IncidenciasTable from "@/components/IncidenciasTable.jsx";
import { ReporteFinal } from "@/components/ReporteFinal";
import { dashEmpleado } from "@/lib/dashboard";

function CertificateIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  );
}

/* ---------- UI helpers ---------- */

const EstadoTag = ({ estado = "ACTIVO" }) => {
  const map = {
    ACTIVO: "bg-emerald-500/10 text-emerald-700 border border-emerald-200",
    SUSPENDIDO: "bg-amber-500/10 text-amber-700 border border-amber-200",
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
/* ---------- Pestañas ---------- */
const TABS = ["Informacion basica", "Datos laborales", "Capacitaciones", "Incidencias", "Documentos", "Desempeño"];

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

  const isRRHH = !!(user?.isSuper || user?.isRRHH || user?.role === "ADMIN" || user?.role === "RRHH" || user?.role === "DIRECTIVO" || user?.caps?.includes?.("nomina:editar"));
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
      "incidencias": TABS[3],
      "documentos": TABS[4],
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
    comentario: "",
  });
  const [showSueldos, setShowSueldos] = useState(false);

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
  const [docs, setDocs] = useState([]);
  const [docForm, setDocForm] = useState({ nombre: "", archivo: null });

  // Estados para Desempeño
  const [feedbacks, setFeedbacks] = useState([]);
  const [selectedReportData, setSelectedReportData] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedReportYear, setSelectedReportYear] = useState(null);

  // TOUR STEPS
  const tourSteps = useMemo(() => [
    { element: '#tour-legajo-header', popover: { title: 'Encabezado del Legajo', description: 'Aquí ves la información principal del empleado, su foto y acciones rápidas.' } },
    { element: '#tour-legajo-sidebar', popover: { title: 'Resumen y Contacto', description: 'En esta barra lateral encontrás datos clave, historial de puestos y formas de contacto.' } },
    { element: '#tour-legajo-tabs', popover: { title: 'Navegación', description: 'Usá estas pestañas para ver el detalle de cada sección: Datos, Capacitaciones, Documentos, etc.' } },
    { element: '#tour-legajo-content', popover: { title: 'Contenido Detallado', description: 'Aquí se mostrará la información correspondiente a la pestaña seleccionada.' } }
  ], []);

  const { startTour } = useTour(tourSteps);

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
          comentario: e?.sueldoBase?.comentario ?? "",
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
  // Comentado para evitar errores 404 en consola
  // useEffect(() => {
  //   (async () => {
  //     try {
  //       const p = await api(`/puestos`).catch(() => null);
  //       if (Array.isArray(p) && p.length) {
  //         const nombres = p.map((x) => x?.nombre).filter(Boolean);
  //         if (nombres.length) setPuestos(nombres);
  //       }
  //     } catch {/* noop */ }
  //   })();
  // }, []);

  const loadCapacitacionesResumen = async () => {
    try {
      const c = await api(`/empleados/${id}/capacitaciones/resumen`).catch(() => null);
      if (c) setResumeCaps({
        total: Number(c?.total || 0),
        totalPendientes: Number(c?.totalPendientes || 0),
        totalPorRealizar: Number(c?.totalPorRealizar || 0),
        vencen30: Number(c?.vencen30 || 0)
      });
    } catch { }
  };

  // Resúmenes opcionales
  useEffect(() => {
    (async () => {
      try {
        const r = await api(`/empleados/${id}/carrera/resumen`).catch(() => null);
        if (r) setResumeCarrera({ ultimoPuesto: r?.ultimoPuesto || null, desde: r?.desde || null });
      } catch { }
      await loadCapacitacionesResumen();
    })();
  }, [id]);

  // Cargar documentos al entrar a la tab
  useEffect(() => {
    if (tab === "Documentos" && id) {
      api(`/empleados/${id}/documentos`)
        .then(d => setDocs(d || []))
        .catch(err => console.error("Error cargando docs", err));
    }
  }, [tab, id]);

  // Cargar feedbacks al entrar a la tab "Desempeño"
  useEffect(() => {
    if (tab === "Desempeño" && id) {
      api(`/feedbacks/empleado/${id}`)
        .then(res => {
          const list = Array.isArray(res) ? res : [];
          // Filtramos solo los FINAL que estén cerrados o listos
          const finales = list.filter(f => f.periodo === "FINAL");
          // Ordenar por año desc
          finales.sort((a, b) => b.year - a.year);
          setFeedbacks(finales);
        })
        .catch(err => console.error("Error cargando feedbacks", err));
    }
  }, [tab, id]);

  const handleOpenReport = async (feedback) => {
    try {
      setLoadingReport(true);
      // Fetch data dashboard del año específico del reporte
      const data = await dashEmpleado(id, feedback.year);

      if (data) {
        // Extract evolution data from feedbacks (Q1-4, SEM, Final), ignoring monthly if present
        const evData = (data.feedbacks || [])
          .filter(f => /Q\d|SEM\d|A\d|FINAL/.test(f.periodo))
          .sort((a, b) => {
            const order = ["Q1", "Q2", "SEM1", "Q3", "SEM2", "Q4", "FINAL"];
            return order.indexOf(a.periodo) - order.indexOf(b.periodo);
          })
          .map(f => ({
            name: f.periodo === "FINAL" ? "Fin" : f.periodo,
            global: f.scores?.global ?? 0
          }));

        setSelectedReportData({ ...data, evolutionData: evData });
        setSelectedReportYear(feedback.year);
        setReportModalOpen(true);
      } else {
        toast.error("No se encontraron datos detallados para este reporte.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al abrir el reporte.");
    } finally {
      setLoadingReport(false);
    }
  };

  // Persistir tab en URL
  useEffect(() => {
    const key =
      tab === TABS[0]
        ? "informacion-basica"
        : tab === TABS[1]
          ? "datos-laborales"
          : tab === TABS[2]
            ? "capacitaciones"
            : tab === "Incidencias"
              ? "incidencias"
              : tab === "Desempeño"
                ? "desempeno"
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
      toast.error(e.message || "No se pudo actualizar el estado.");
    }
  };

  const onGuardarBasica = async () => {
    try {
      const payload = { ...basicForm };

      // Validate email domain
      if (payload.email) {
        const allowedDomains = ["@diagnos.com.ar", "@diagnoslab.com.ar", "@gmail.com", "@hotmail.com"];
        const isValidDomain = allowedDomains.some(domain => payload.email.endsWith(domain));
        if (!isValidDomain) {
          return toast.error("El email debe ser del dominio @diagnos.com.ar o @diagnoslab.com.ar");
        }
      }
      if (payload.area && payload.area._id) payload.area = payload.area._id;
      if (payload.sector && payload.sector._id) payload.sector = payload.sector._id;

      // Sanitize empty strings
      if (payload.sector === "") payload.sector = null;
      if (payload.area === "") payload.area = null;

      const resp = await api(`/empleados/${id}`, { method: "PATCH", body: payload });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      setEditBasic(false);
      toast.success("Información básica actualizada.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo actualizar la información básica.");
    }
  };

  const onGuardarSueldo = async () => {
    try {
      const payload = {
        monto: Number(sueldo.monto),
        moneda: sueldo.moneda || "ARS",
        vigenteDesde: sueldo.vigenteDesde ? new Date(sueldo.vigenteDesde) : new Date(),
        comentario: sueldo.comentario || "",
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
        comentario: updEmp?.sueldoBase?.comentario || "",
      });
      toast.success("Sueldo actualizado y registrado en histórico.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo actualizar el sueldo.");
    }
  };

  const onEliminarSueldo = async (subId) => {
    if (!confirm("¿Seguro de eliminar este registro histórico?")) return;
    try {
      const resp = await api(`/empleados/${id}/sueldo/${subId}`, { method: "DELETE" });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      toast.success("Registro eliminado.");
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo eliminar.");
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
      toast.error(e.message || "No se pudo subir el CV.");
    } finally {
      if (cvInputRef.current) cvInputRef.current.value = "";
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
    } catch (e) {
      console.error(e);
      toast.error(e.message || "No se pudo subir la foto.");
    }
  };

  const [copied, setCopied] = useState(false);
  const copyReferente = async () => {
    const ref = emp?.area?.referentes?.[0];
    if (!ref) return;
    const text = `Referente: ${ref.nombre} ${ref.apellido}\nEmail: ${ref.email}\nCel: ${ref.celular || "—"}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        textArea.style.opacity = "0";
        textArea.style.zIndex = "-1";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          const success = document.execCommand('copy');
          if (!success) throw new Error("execCommand failed");
        } catch (err) {
          console.error('Fallback copy failed', err);
          throw new Error('No se pudo copiar');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Datos del referente copiados.");
    } catch (err) {
      toast.error("Error al copiar");
    }
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
        {/* Header Moderno con Gradiente Oscuro */}
        <div id="tour-legajo-header" className="relative overflow-hidden rounded-3xl bg-white shadow-sm border border-slate-200 group/header">
          {/* Cover */}
          <div className="relative h-32 w-full bg-slate-900 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-900" />
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
          </div>

          <div className="relative px-8 pb-8">
            <div className="flex flex-col md:flex-row items-end -mt-20 gap-6">
              {/* Avatar con borde grueso */}
              <div className="h-40 w-40 rounded-full p-1.5 bg-white shadow-2xl shadow-indigo-500/30 ring-4 ring-white/50 relative shrink-0">
                <div className="h-full w-full rounded-full overflow-hidden bg-slate-100 relative group">
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
                {/* Status Dot integrado al avatar */}
                <div className="absolute bottom-2 right-2 rounded-full bg-white p-1 shadow-sm" title={emp?.estadoLaboral || "ACTIVO"}>
                  <span className="relative flex h-3.5 w-3.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${emp?.estadoLaboral === 'DESVINCULADO' ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white ${emp?.estadoLaboral === 'DESVINCULADO' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                  </span>
                </div>
              </div>

              {/* Info Principal */}
              <div className="flex-1 pb-2 text-center md:text-left">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center justify-center md:justify-start gap-3">
                  {emp.nombre} {emp.apellido}
                  <button
                    onClick={startTour}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-indigo-600 rounded-full transition-colors"
                    title="Iniciar Tutorial"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                </h1>

                <div className="flex flex-col md:flex-row items-center gap-x-6 gap-y-1 mt-1 text-slate-500 text-sm font-medium">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="bg-slate-100 p-1 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></svg></span>
                    {emp.puesto || "Sin puesto definido"}
                  </div>
                  {(emp.area || emp.sector) && (
                    <div className="flex items-center gap-1.5">
                      <span className="bg-slate-50 p-1 rounded-md text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2" /></svg></span>
                      <span>{emp.area?.nombre} <span className="text-slate-300 mx-1">/</span> {emp.sector?.nombre || "-"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Botones de Acción (Mantener lógica RRHH) */}
              <div className="flex items-center gap-3 pb-2">
                {isRRHH && (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-1 border border-slate-100 shadow-sm">
                    <select
                      className="bg-transparent text-xs font-bold text-slate-600 px-3 py-1.5 outline-none cursor-pointer hover:text-slate-900 transition-colors"
                      value={estadoLaboral}
                      onChange={(e) => setEstadoLaboral(e.target.value)}
                    >
                      <option value="VINCULADO">VINCULADO</option>
                      <option value="DESVINCULADO">DESVINCULADO</option>
                    </select>
                    <button
                      onClick={onGuardarEstado}
                      className="h-7 w-7 flex items-center justify-center bg-white rounded-lg text-slate-400 shadow-sm border border-slate-200 hover:text-emerald-600 hover:border-emerald-200 transition-all"
                      title="Guardar estado"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                )}
                <button
                  onClick={onBack}
                  className="h-10 px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-md shadow-slate-900/10 hover:bg-slate-800 hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Home size={16} /> <span className="hidden sm:inline">Volver</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar IZQUIERDO */}
          <aside id="tour-legajo-sidebar" className="lg:col-span-4 space-y-6">
            {/* Chips resumen */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Puesto Actual</div>
                </div>
                <div className="mt-2 text-sm font-bold text-slate-800 leading-tight">{ultimoPuesto}</div>
                <div className="mt-1 text-[10px] text-slate-500 font-medium">
                  {(() => {
                    const start = resumeCarrera?.desde ? new Date(resumeCarrera.desde) : (emp.fechaIngreso ? new Date(emp.fechaIngreso) : null);
                    if (!start) return "—";
                    const diffTime = Math.abs(new Date() - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const years = Math.floor(diffDays / 365);
                    const months = Math.floor((diffDays % 365) / 30);
                    const days = (diffDays % 365) % 30;

                    let txt = "";
                    if (years > 0) txt += `${years} año${years > 1 ? "s" : ""} `;
                    if (months > 0) txt += `${months} mes${months > 1 ? "es" : ""} `;
                    if (!txt && days > 0) txt += `${days} día${days > 1 ? "s" : ""}`;
                    return txt ? `En el puesto hace ${txt}` : "Recién iniciado";
                  })()}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Capacitaciones</div>
                <div className="mt-2 text-sm">
                  <div className="flex justify-between items-center bg-emerald-50/50 rounded p-1 mb-1">
                    <span className="text-xs text-emerald-700 font-medium tracking-tight">Validadas</span>
                    <span className="text-sm font-bold text-emerald-600">{resumeCaps?.total || 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-amber-50/50 rounded p-1 mb-1">
                    <span className="text-xs text-amber-700 font-medium tracking-tight">Pendientes</span>
                    <span className="text-sm font-bold text-amber-600">{resumeCaps?.totalPendientes || 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50/50 rounded p-1">
                    <span className="text-xs text-blue-700 font-medium tracking-tight">A Realizar</span>
                    <span className="text-sm font-bold text-blue-600">{resumeCaps?.totalPorRealizar || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Snapshot (Datos Clave) */}
            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
              {/* Header Púrpura */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <div className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" /></svg>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Datos Clave</h3>
                </div>

                {/* Botón copiar TODO */}
                <button
                  onClick={async () => {
                    const ref = emp?.area?.referentes?.[0];
                    const refText = ref ? `\n\nREFERENTE:\n${ref.nombre} ${ref.apellido}\nEmail: ${ref.email}\nCel: ${ref.celular || "—"}` : "";
                    const text = `EMPLEADO:\n${emp.nombre} ${emp.apellido}\nDNI: ${emp.dni}\nCUIL: ${emp.cuil}\nEmail: ${emp.email}\nCel: ${emp.celular}\nDomicilio: ${emp.domicilio}${refText}`;

                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                      } else {
                        // Fallback http: visible but transparent to avoid security block
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        textArea.style.position = "fixed";
                        textArea.style.top = "0";
                        textArea.style.left = "0";
                        textArea.style.width = "2em";
                        textArea.style.height = "2em";
                        textArea.style.padding = "0";
                        textArea.style.border = "none";
                        textArea.style.outline = "none";
                        textArea.style.boxShadow = "none";
                        textArea.style.background = "transparent";
                        textArea.style.opacity = "0";
                        textArea.style.zIndex = "-1";

                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        try {
                          const success = document.execCommand('copy');
                          if (!success) throw new Error("execCommand failed");
                        } catch (err) {
                          console.error('Fallback copy failed', err);
                          throw new Error('No se pudo copiar');
                        } finally {
                          document.body.removeChild(textArea);
                        }
                      }
                      toast.success("Todos los datos copiados");
                    } catch (err) {
                      toast.error("Error al copiar al portapapeles");
                    }
                  }}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
                  title="Copiar ficha completa"
                >
                  <Copy size={16} />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* Contacto Directo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Contacto Directo</span>
                    <button
                      onClick={() => {
                        const text = `${emp.nombre} ${emp.apellido}\nEmail: ${emp.email}\nCel: ${emp.celular || "—"}\nDomicilio: ${emp.domicilio || "—"}`;
                        navigator.clipboard.writeText(text);
                        toast.success("Contacto copiado");
                      }}
                      className="text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Copiar contacto"
                    >
                      <Copy size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-3 items-start group">
                      <div className="mt-0.5 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg></div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-medium mb-0.5">Email</span>
                        <span className="text-sm font-medium text-slate-700 break-all">{emp.email || "—"}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start group">
                      <div className="mt-0.5 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg></div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-medium mb-0.5">Celular</span>
                        <span className="text-sm font-medium text-slate-700">{emp.celular || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DNI / CUIL Pills */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-bold mb-1">DNI</span>
                    <span className="text-sm font-bold text-slate-700 tracking-wide font-mono">{emp.dni}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-bold mb-1">CUIL</span>
                    <span className="text-sm font-bold text-slate-700 tracking-wide font-mono">{emp.cuil}</span>
                  </div>
                </div>

                {/* Ingreso Highlight */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                  </div>
                  <div>
                    <span className="block text-[10px] text-blue-600 font-bold uppercase">Fecha de Ingreso</span>
                    <span className="text-sm font-bold text-blue-900">{emp.fechaIngreso ? String(emp.fechaIngreso).slice(0, 10) : "—"}</span>
                  </div>
                </div>

                {/* Organización */}
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Organización</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="mt-1 text-slate-300"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="18" x="3" y="3" rx="1" /><path d="M7 8v.01" /><path d="M7 12v.01" /><path d="M7 16v.01" /><rect width="8" height="10" x="13" y="11" rx="1" /><path d="M17 16v.01" /></svg></div>
                    <div>
                      <div className="font-bold text-sm text-slate-800">{emp?.area?.nombre || "—"}</div>
                      <div className="text-xs text-slate-500 font-medium">{emp?.sector?.nombre || "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Referente Card */}
                {emp?.area?.referentes?.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 mt-2">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200/60">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Referente</h4>
                      <button onClick={copyReferente} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Copiar datos referente">
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                    {emp.area.referentes.map(ref => (
                      <div key={ref._id} className="flex gap-3 items-center">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold ring-2 ring-white">
                          {(ref.nombre?.[0] || "") + (ref.apellido?.[0] || "")}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">{ref.nombre} {ref.apellido}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{ref.email}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{ref.celular || "Sin celular"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>


          </aside>

          {/* PANEL CENTRAL: Tabs siempre arriba + contenido */}
          <section id="tour-legajo-content" className="lg:col-span-8 space-y-6">
            {/* Tabs (sticky) */}
            <div className="sticky top-4 z-20">
              <div id="tour-legajo-tabs" className="rounded-2xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-200/60 p-1.5 flex flex-wrap gap-1">
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
                        onChange={(e) => setBasicForm(s => ({ ...s, sector: e.target.value }))}
                        disabled={!isRRHH || !basicForm.area || sectoresFiltrados.length === 0}

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
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        Sueldo base
                        <button 
                          onClick={() => setShowSueldos(!showSueldos)}
                          className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
                          title={showSueldos ? "Ocultar montos" : "Mostrar montos"}
                        >
                          {showSueldos ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </h3>
                    </div>

                    {/* ACTUAL */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">Sueldo actual</div>
                        <div className="text-xl font-semibold font-mono tracking-tight">
                          {showSueldos ? fmtMoney(emp?.sueldoBase?.monto, emp?.sueldoBase?.moneda) : "••••••••"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Vigente desde {emp?.sueldoBase?.vigenteDesde ? String(emp.sueldoBase.vigenteDesde).slice(0, 10) : "—"}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">Vigente</span>
                    </div>

                    {/* FORM ACTUALIZAR */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-3">
                        <FieldInput
                          label="Monto"
                          type="number"
                          value={sueldo.monto}
                          onChange={(v) => setSueldo((s) => ({ ...s, monto: v }))}
                          disabled={!isRRHH}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Moneda</Label>
                        <select
                          className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                          value={sueldo.moneda}
                          onChange={(e) => setSueldo((s) => ({ ...s, moneda: e.target.value }))}
                          disabled={!isRRHH}
                        >
                          <option>ARS</option>
                          <option>USD</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <FieldInput
                          label="Vigente desde"
                          type="date"
                          value={sueldo.vigenteDesde}
                          onChange={(v) => setSueldo((s) => ({ ...s, vigenteDesde: v }))}
                          disabled={!isRRHH}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <FieldInput
                          label="Comentario (opcional)"
                          placeholder="Ej: Ajuste inflacionario"
                          value={sueldo.comentario || ""}
                          onChange={(v) => setSueldo((s) => ({ ...s, comentario: v }))}
                          disabled={!isRRHH}
                        />
                      </div>
                      <div className="md:col-span-12 flex justify-end mt-2">
                        <button
                          disabled={!isRRHH}
                          onClick={onGuardarSueldo}
                          className="rounded-lg px-4 py-2 text-sm bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
                        >
                          Actualizar sueldo
                        </button>
                      </div>
                    </div>

                    {/* HISTÓRICO COMPLETO (Incluye vigente para ver evolución) */}
                    <div className="mt-6">
                      <div className="text-[11px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">Historial de Actualizaciones</div>
                      <div className="overflow-x-auto rounded-xl border border-border/60 shadow-sm bg-white">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-border/60">
                            <tr>
                              <th className="px-4 py-3">Vigencia</th>
                              <th className="px-4 py-3 text-right">Sueldo Ant.</th>
                              <th className="px-4 py-3 text-right">Sueldo Act.</th>
                              <th className="px-4 py-3 text-center">% Ajuste</th>
                              <th className="px-4 py-3">Comentario</th>
                              {isRRHH && <th className="px-4 py-3 w-10"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {(() => {
                              // 1. Construir lista unificada (Actual + Histórico)
                              const actual = {
                                monto: emp?.sueldoBase?.monto,
                                moneda: emp?.sueldoBase?.moneda,
                                desde: emp?.sueldoBase?.vigenteDesde,
                                hasta: null,
                                comentario: emp?.sueldoBase?.comentario,
                                isCurrent: true
                              };
                              const hist = (emp?.sueldoBase?.historico || []).slice().sort((a, b) => new Date(b.desde) - new Date(a.desde));
                              const fullList = [actual, ...hist];

                              return fullList.map((item, i) => {
                                // Calcular métricas contra el anterior (el siguiente en la lista ordenada desc)
                                const prev = fullList[i + 1];
                                const anterior = prev?.monto || 0;
                                const hasPrev = !!prev;
                                const diff = hasPrev ? (item.monto - anterior) : 0;
                                const pct = (hasPrev && anterior > 0) ? (diff / anterior) * 100 : 0;

                                const isPositive = pct > 0;

                                // Identificamos subdocumentos reales para poder borrarlos
                                const canDelete = !item.isCurrent && item._id && isRRHH;

                                return (
                                  <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${item.isCurrent ? "bg-blue-50/30" : ""}`}>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-slate-700">
                                        {item.desde ? new Date(item.desde).toLocaleDateString() : "—"}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {item.hasta ? new Date(item.hasta).toLocaleDateString() : "Actualidad"}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-500">
                                      {hasPrev ? (showSueldos ? fmtMoney(anterior, prev?.moneda) : "••••••••") : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-700 font-mono">
                                      {showSueldos ? fmtMoney(item.monto, item.moneda) : "••••••••"}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {hasPrev && (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isPositive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                          {isPositive ? "+" : ""}{pct.toFixed(1)}%
                                        </span>
                                      )}
                                      {!hasPrev && <span className="text-slate-300 text-[10px]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 max-w-[200px]">
                                      {item.comentario ? (
                                        <div className="truncate text-slate-600" title={item.comentario}>{item.comentario}</div>
                                      ) : (
                                        <span className="text-slate-300 italic text-[10px]">Sin comentarios</span>
                                      )}
                                      {item.isCurrent && <span className="text-[9px] uppercase tracking-wide font-bold text-blue-500 block mt-0.5">Vigente</span>}
                                    </td>
                                    {isRRHH && (
                                      <td className="px-4 py-3 text-right">
                                        {canDelete && (
                                          <button
                                            onClick={() => onEliminarSueldo(item._id)}
                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                            title="Eliminar registro histórico"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                            })()}
                            {(!emp?.sueldoBase?.monto && !emp?.sueldoBase?.historico?.length) && (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-slate-400 italic">No hay registros de sueldo.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Carrera / Historial de puestos */}
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                  <h3 className="text-sm font-semibold mb-2">Desarrollo Profesional</h3>
                  <div className="overflow-x-auto">
                    <div className="min-w-0">
                      <CarreraTable
                        empleadoId={id}
                        canEdit={isRRHH}
                        areas={areas}
                        sectores={sectores}
                        autoOpen={searchParams.get("action") === "new-position"}
                        initialData={{
                          puesto: searchParams.get("puesto"),
                          area: searchParams.get("area"),
                          sector: searchParams.get("sector")
                        }}
                        onAutoOpenComplete={() => {
                          setSearchParams(prev => {
                            const p = new URLSearchParams(prev);
                            p.delete("action");
                            p.delete("puesto");
                            p.delete("area");
                            p.delete("sector");
                            return p;
                          }, { replace: true });
                        }}
                      />
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
                    <CapacitacionesTable empleadoId={id} canEdit={isRRHH} onChange={loadCapacitacionesResumen} />
                  </div>
                </div>
              </div>
            )}

            {/* Incidencias */}
            {tab === "Incidencias" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                <div className="overflow-x-auto">
                  <div className="min-w-0">
                    <IncidenciasTable empleadoId={id} canEdit={isRRHH} />
                  </div>
                </div>
              </div>
            )}

            {/* Documentos */}
            {tab === "Documentos" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Documentación del Empleado</h3>
                </div>

                {/* Formulario de Carga */}
                {canEditBasic && (
                  <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-3 ml-1">Nuevo Documento</h4>
                    <div className="flex flex-col md:flex-row gap-3 items-end">
                      <div className="flex-1 w-full">
                        <Label>Nombre / Título</Label>
                        <input
                          type="text"
                          placeholder="Ej: CV 2024, Certificado Médico..."
                          className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 transition-all"
                          value={docForm.nombre}
                          onChange={(e) => setDocForm(s => ({ ...s, nombre: e.target.value }))}
                        />
                      </div>
                      <div className="flex-1 w-full">
                        <Label>Archivo</Label>
                        <input
                          type="file"
                          className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          onChange={(e) => setDocForm(s => ({ ...s, archivo: e.target.files?.[0] || null }))}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!docForm.nombre || !docForm.archivo) return toast.error("Completá nombre y archivo");
                          try {
                            const fd = new FormData();
                            fd.append("nombre", docForm.nombre);
                            fd.append("archivo", docForm.archivo);

                            const resp = await api(`/empleados/${id}/documentos`, { method: "POST", body: fd });
                            // recargar docs
                            const list = await api(`/empleados/${id}/documentos`);
                            setDocs(list || []);
                            setDocForm({ nombre: "", archivo: null });
                            toast.success("Documento subido.");
                          } catch (e) {
                            console.error(e);
                            toast.error("Error al subir documento.");
                          }
                        }}
                        className="h-10 px-5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        Subir
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Documentos */}
                <div className="overflow-hidden rounded-xl border border-border/60">
                  {/* Cargar lista al entrar */}
                  {/* Cargar lista al entrar */}

                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3 w-24 text-center">Tipo</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(docs && docs.length > 0) ? (
                        docs.map((doc) => (
                          <tr key={doc._id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-4 py-3 font-medium text-slate-700">
                              <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                                {doc.nombre}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(() => {
                                const ext = (doc.archivoUrl || doc.nombre || "").split('.').pop().toLowerCase();
                                let bg = "bg-slate-100 text-slate-500";
                                if (['pdf'].includes(ext)) bg = "bg-rose-100 text-rose-700 border-rose-200";
                                if (['doc', 'docx'].includes(ext)) bg = "bg-blue-100 text-blue-700 border-blue-200";
                                if (['xls', 'xlsx'].includes(ext)) bg = "bg-emerald-100 text-emerald-700 border-emerald-200";
                                if (['jpg', 'jpeg', 'png'].includes(ext)) bg = "bg-purple-100 text-purple-700 border-purple-200";

                                return (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${bg}`}>
                                    {ext.slice(0, 4)}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {new Date(doc.fechaSubida || doc.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a
                                  href={(() => {
                                    const url = doc.archivoUrl || "";
                                    if (/^https?:\/\//i.test(url)) return url;
                                    const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
                                    return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
                                  })()}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Ver / Descargar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                </a>
                                {canEditBasic && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm("¿Eliminar este documento?")) return;
                                      try {
                                        await api(`/empleados/${id}/documentos/${doc._id}`, { method: "DELETE" });
                                        setDocs(prev => prev.filter(d => d._id !== doc._id));
                                        toast.success("Eliminado");
                                      } catch (e) { toast.error("Error al eliminar"); }
                                    }}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                    title="Eliminar"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-slate-400">
                            No hay documentos cargados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Desempeño */}
            {tab === "Desempeño" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-5">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/60">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <Trophy size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Historial de Desempeño</h3>
                </div>

                {feedbacks.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <CertificateIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No hay reportes de cierre registrados.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {feedbacks.map((item) => (
                      <div key={item._id} className="group bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all hover:border-purple-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Trophy className="w-16 h-16 text-purple-600 transform rotate-12" />
                        </div>

                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-bold font-mono tracking-tight">
                              CICLO {item.year}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${['CLOSED', 'SENT'].includes(item.estado) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                              {item.estado === 'CLOSED' ? 'Finalizado' : (item.estado === 'SENT' ? 'Cerrado' : item.estado)}
                            </span>
                          </div>

                          <div className="mb-6">
                            <h4 className="text-base font-bold text-slate-700 leading-tight">Reporte Anual Final</h4>
                            <p className="text-xs text-slate-400 mt-1">Cierre de ciclo lectivo y evaluación global.</p>
                          </div>

                          <button
                            onClick={() => handleOpenReport(item)}
                            className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-sm hover:shadow active:scale-95 transition-all flex items-center justify-center gap-2"
                            disabled={loadingReport}
                          >
                            {loadingReport ? 'Cargando...' : <><FileText size={14} /> Ver Reporte Completo</>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      {/* Modal Reporte Final */}
      <ReporteFinal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        data={selectedReportData}
        empleado={emp}
        anio={selectedReportYear}
        evolutionData={selectedReportData?.evolutionData}
      />
    </div>
  );
}
