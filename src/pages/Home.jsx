import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Target,
  BarChart3,
  Calculator,
  Users,
  TrendingUp,
  CalendarDays,
  Shield,
  UserCircle2,
  FileText,
  Briefcase,
  LayoutDashboard,
  CheckCircle,
  DollarSign,
  Building2,
  Megaphone,
  HelpCircle,
  FileCheck2,
  MessageSquarePlus
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import useCan, { useHasRole } from "@/hooks/useCan";

import { useTour } from "@/hooks/useTour";
import { API_ORIGIN } from "@/lib/api";
import AppFeedbackModal from "@/components/AppFeedbackModal";

function quarterLabel(d = new Date()) {
  const month = d.getMonth();
  const year = d.getFullYear();

  // Fiscal Year starts in September (Month 8)
  const fyMonth = (month + 4) % 12;
  const fiscalQ = Math.floor(fyMonth / 3) + 1;

  const fiscalYear = (month >= 8) ? year : year - 1;
  const nextYearShort = String(fiscalYear + 1).slice(-2);

  return `Q${fiscalQ}-${fiscalYear}/${nextYearShort}`;
}

function initialsFromUser(user) {
  const base =
    user?.fullName ||
    (user?.apellido ? `${user.apellido} ${user.nombre ?? ""}` : user?.email) ||
    "";
  return (
    base
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "US"
  );
}

function fotoSrc(empleado) {
  const url = empleado?.fotoUrl;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base =
    typeof API_ORIGIN === "string" && API_ORIGIN
      ? API_ORIGIN
      : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
}

const rolePretty = {
  superadmin: "Superadmin",
  rrhh: "RR.HH.",
  jefe_area: "Jefe de Área",
  jefe_sector: "Jefe de Sector",
  directivo: "Directivo",
  empleado: "Colaborador",
  visor: "Visor",
};

export default function Home() {
  const { user } = useAuth();
  const periodo = quarterLabel();

  // TOUR STEPS
  const tourSteps = useMemo(() => [
    { element: '#tour-hero', popover: { title: 'Bienvenido a GestionBono', description: 'Este es tu panel principal donde podrás ver tu información y navegar por las distintas secciones.' } },
    { element: '#tour-period', popover: { title: 'Periodo Actual', description: 'Aquí indicamos el trimestre fiscal en curso y su correspondiente año. Todas las evaluaciones se rigen por este calendario.' } },
    { element: '#tour-group-0', popover: { title: 'Mi Espacio', description: 'Accedé a tu autoevaluación, resultados personales y legajo.' } },
    { element: '#tour-group-1', popover: { title: 'Gestión & Seguimiento', description: 'Herramientas para líderes y RRHH: Seguimiento de equipos y gestión de procesos.' } },
    { element: '#tour-group-2', popover: { title: 'Estructura', description: 'Visualizá la organización de la empresa y los equipos.' } },
    { element: '#tour-group-3', popover: { title: 'Resultados', description: 'Tableros ejecutivos y configuración de métricas de bono.' } }
  ], []);

  const { startTour } = useTour(tourSteps);

  const { ok: canViewEstructura } = useCan("estructura:ver");
  const { ok: canViewNomina } = useCan("nomina:ver");
  const { ok: canViewEjecutivo } = useCan("seguimiento-ejecutivo:ver");
  const { ok: hasRoleRRHH } = useHasRole(["rrhh", "jefe_area", "jefe_sector"]);
  const { ok: hasRoleDirectivo } = useHasRole(["directivo"]);

  // Explicit check to be 100% sure we exclude managers (Same logic as Navbar)
  const userRole = String(user?.rol || "").toLowerCase();
  const isRealRRHH = userRole === 'rrhh' || user?.isRRHH === true;

  const hasReferente = !!(
    user &&
    ((Array.isArray(user.referenteAreas) && user.referenteAreas.length > 0) ||
      (Array.isArray(user.referenteSectors) &&
        user.referenteSectors.length > 0))
  );

  const avatarSrc = useMemo(
    () => fotoSrc(user?.empleado),
    [user?.empleado?.fotoUrl]
  );

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const prettyRol =
    rolePretty[user?.rol] ||
    (user?.isRRHH
      ? "RR.HH."
      : user?.isJefeArea
        ? "Jefe de Área"
        : user?.isJefeSector
          ? "Jefe de Sector"
          : "Usuario");

  const displayName =
    user?.fullName ||
    (user?.apellido ? `${user.apellido}, ${user.nombre ?? ""}` : user?.email) ||
    "Usuario";

  const puesto = user?.empleado?.puesto || "—";

  const GROUPS = [
    {
      title: "Mi Espacio",
      items: [
        {
          key: "mi-desempeno",
          title: "Mi Desempeño",
          desc: "Visualizá tus objetivos, feedback y evolución.",
          icon: UserCircle2,
          to: "/mi-desempeno",
          allow: !!user,
          color: "text-blue-600",
          bg: "bg-blue-50"
        },
        {
          key: "mi-legajo",
          title: "Mi Legajo",
          desc: "Consultá tu información personal y laboral.",
          icon: FileText,
          to: user?.empleado?._id ? `/nomina/legajo/${user.empleado._id}` : "#",
          allow: !!user?.empleado?._id,
          color: "text-emerald-600",
          bg: "bg-emerald-50"
        }
      ]
    },
    {
      title: "Gestión",
      items: [
        {
          key: "objetivos",
          title: "Gestión de Objetivos",
          desc: "Administrar plantillas y asignaciones.",
          icon: Target,
          to: "/plantillas",
          allow: hasRoleRRHH || hasRoleDirectivo,
          color: "text-slate-700",
          bg: "bg-slate-100"
        },
        {
          key: "avisos",
          title: "Gestión de Avisos",
          desc: "Comunicados globales y alertas.",
          icon: Megaphone,
          to: "/gestion-avisos",
          allow: isRealRRHH || hasRoleDirectivo,
          color: "text-rose-600",
          bg: "bg-rose-50"
        },
        {
          key: "gestion-iso",
          title: "Gestión ISO 9001",
          desc: "Administración de procesos y objetivos ISO 9001.",
          icon: FileCheck2,
          to: "/gestion-iso",
          allow: isRealRRHH || hasRoleDirectivo,
          color: "text-teal-600",
          bg: "bg-teal-50"
        }
      ]
    },
    {
      title: "Seguimiento",
      items: [
        {
          key: "seguimiento",
          title: "Seguimiento Objetivos",
          desc: "Monitoreo de avance por áreas y sectores.",
          icon: TrendingUp,
          to: "/seguimiento",
          allow: hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente,
          color: "text-orange-500",
          bg: "bg-orange-50"
        },
        {
          key: "cierres",
          title: "Cierre de Evaluaciones",
          desc: "Gestión de cierres y estados.",
          icon: CheckCircle,
          to: "/rrhh-evaluaciones",
          allow: isRealRRHH || hasRoleDirectivo,
          color: "text-emerald-600",
          bg: "bg-emerald-50"
        }
      ]
    },
    {
      title: "Estructura & Organización",
      items: [
        {
          key: "estructura",
          title: "Nómina",
          desc: "Estructura y organigrama del equipo.",
          icon: Users,
          to: "/gestion-estructura",
          allow: canViewEstructura && (hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector),
          color: "text-blue-600",
          bg: "bg-blue-50"
        },
        {
          key: "departamentos",
          title: "Departamentos",
          desc: "Administración de departamentos y reportes.",
          icon: Building2,
          to: "/gestion-departamentos",
          allow: canViewEstructura && (hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector), // Using same logic roughly
          color: "text-indigo-600",
          bg: "bg-indigo-50"
        },
        {
          key: "admin-web", // Only for SuperAdmin usually
          title: "Administración Web",
          desc: "Administración de usuarios y roles.",
          icon: Users,
          to: "/sistemas",
          allow: user?.isSuper || user?.rol === 'superadmin',
          color: "text-slate-600",
          bg: "bg-slate-100"
        }
      ]
    },
    {
      title: "Resultados & Estrategia",
      items: [
        {
          key: "seguimiento-ejecutivo",
          title: "Tablero Ejecutivo",
          desc: "Indicadores clave de alto nivel.",
          icon: LayoutDashboard,
          to: "/seguimiento-ejecutivo",
          allow: canViewEjecutivo && (hasRoleRRHH || hasRoleDirectivo),
          color: "text-pink-600",
          bg: "bg-pink-50"
        },
        {
          key: "config-bono",
          title: "Configuración Bono",
          desc: "Ajustes y parámetros de bonos.",
          icon: DollarSign,
          to: "/configuracion-bono",
          allow: isRealRRHH || hasRoleDirectivo,
          color: "text-amber-500",
          bg: "bg-amber-50"
        },
        {
          key: "resultados",
          title: "Resultados",
          desc: "Visualización de resultados finales.",
          icon: BarChart3,
          to: "/resultados-bono",
          allow: isRealRRHH || hasRoleDirectivo,
          color: "text-violet-600",
          bg: "bg-violet-50"
        },
        {
          key: "simulador",
          title: "Simulador Objetivos",
          desc: "Proyección de cumplimiento.",
          icon: Calculator,
          to: "/simulador",
          allow: hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector,
          color: "text-cyan-600",
          bg: "bg-cyan-50"
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero Section */}
      <div className="relative bg-[#0f172a] text-white pb-4 pt-6 px-6 lg:px-8 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl mix-blend-screen" />
          <div className="absolute top-[10%] right-[-5%] w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-3xl mix-blend-screen" />
        </div>

        <div id="tour-hero" className="relative max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 z-10">
          <div className="flex items-center gap-5">
            {/* Avatar with Gradient Ring */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative h-20 w-20 rounded-full overflow-hidden border-4 border-[#1e293b] bg-[#1e293b]">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-slate-400 bg-slate-800">
                    {initialsFromUser(user)}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-1.5 flex items-center gap-3">
                <span>
                  Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                    {user?.empleado?.apodo ? user.empleado.apodo : (user?.empleado?.nombre || user?.nombre || displayName.split(" ")[0])}!
                  </span>
                </span>
                <button
                  onClick={startTour}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white rounded-full transition-colors"
                  title="Iniciar Tutorial"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/50 backdrop-blur-sm">
                  <Shield className="h-3.5 w-3.5 text-blue-400" />
                  {prettyRol}
                </span>
                <span className="hidden md:inline text-slate-600">•</span>
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/50 backdrop-blur-sm">
                  <Briefcase className="h-3.5 w-3.5 text-purple-400" />
                  {puesto}
                </span>
              </div>
            </div>
          </div>

          <div id="tour-period" className="flex items-center gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-md">
            <div className="p-2.5 bg-blue-500/20 rounded-xl">
              <CalendarDays className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Período Actual</div>
              <div className="text-xl font-bold text-white tracking-tight">{periodo}</div>
            </div>
          </div>
        </div>

        {/* Panel de Navegación Subtitle - RESTORED */}
        <div className="max-w-7xl mx-auto mt-2 border-t border-slate-700/50 pt-2 flex items-center gap-2">
          <div className="p-1 bg-blue-500/10 rounded-lg">
            <LayoutDashboard className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-200 tracking-wide">
            Panel de Navegación
          </h2>
        </div>
      </div>

      {/* Main Content - Centered Flex Layout */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 mt-4 pb-12 relative z-20">

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6 items-start">
          {GROUPS.map((group) => {
            // Show ALL items, handled visibly by permissions later
            const allItems = group.items;

            if (allItems.length === 0) return null;

            return (
              <div id={`tour-group-${GROUPS.indexOf(group)}`} key={group.title} className="flex flex-col gap-3">
                {/* Column Header - Fixed height for alignment */}
                <div className="flex items-center justify-center gap-3 mb-1 px-1 border-b border-slate-200 pb-1.5 min-h-[2.5rem]">
                  <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide leading-tight text-center">
                    {group.title}
                  </h2>
                </div>

                {/* Vertical Stack of Cards */}
                <div className="flex flex-col gap-3">
                  {allItems.map((item) => {
                    const Icon = item.icon;
                    const isAllowed = item.allow;

                    if (isAllowed) {
                      return (
                        <Link
                          to={item.to}
                          key={item.key}
                          className="group bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 transition-all duration-200 flex flex-col items-center text-center justify-between min-h-[170px]"
                        >
                          <div className={`h-11 w-11 shrink-0 rounded-lg ${item.bg} flex items-center justify-center group-hover:scale-110 transition-transform mb-2`}>
                            <Icon className={`h-6 w-6 ${item.color}`} />
                          </div>

                          <div className="w-full px-1 flex flex-col items-center gap-1.5 flex-1 justify-center">
                            <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight" title={item.title}>
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-500 leading-snug line-clamp-3" title={item.desc}>
                              {item.desc}
                            </p>
                          </div>
                        </Link>
                      );
                    } else {
                      // Restricted Item
                      return (
                        <div
                          key={item.key}
                          onClick={() => toast.info("Debe solicitar acceso al área de sistemas")}
                          className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col items-center text-center justify-between min-h-[170px] cursor-not-allowed opacity-60 grayscale transition-all"
                        >
                          <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-200 flex items-center justify-center mb-2">
                            <Icon className="h-6 w-6 text-slate-400" />
                          </div>

                          <div className="w-full px-1 flex flex-col items-center gap-1.5 flex-1 justify-center">
                            <h3 className="text-sm font-bold text-slate-500 line-clamp-2 leading-tight" title={item.title}>
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-400 leading-snug line-clamp-3" title={item.desc}>
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            );
          })}
        </div>


      </div>

      {/* Floating Feedback Button */}
      <button
        onClick={() => setIsFeedbackModalOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-full shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:scale-105 hover:shadow-xl transition-all group"
      >
        <MessageSquarePlus className="w-5 h-5" />
        <span className="text-sm font-semibold pr-1">Experiencia del Usuario</span>
      </button>

      {/* Feedback Modal */}
      <AppFeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />
    </div>
  );
}
