import { Link } from "react-router-dom";
import { useMemo } from "react";
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
  LayoutDashboard
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import useCan, { useHasRole } from "@/hooks/useCan";
import { API_ORIGIN } from "@/lib/api";

function quarterLabel(d = new Date()) {
  const month = d.getMonth();
  const year = d.getFullYear();

  // Fiscal Year starts in September (Month 8)
  // Shift so Sep (8) -> 0, Oct (9) -> 1 ... Aug (7) -> 11
  const fyMonth = (month + 4) % 12;
  const fiscalQ = Math.floor(fyMonth / 3) + 1;

  // Year: Sep-Dec use current year. Jan-Aug use previous year (relative to calendar).
  // e.g. Sep 2025 -> Q1-2025. Jan 2026 -> Q2-2025.
  const fiscalYear = (month >= 8) ? year : year - 1;

  return `Q${fiscalQ}-${fiscalYear}`;
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

  const { ok: canViewEstructura } = useCan("estructura:ver");
  const { ok: canViewNomina } = useCan("nomina:ver");
  const { ok: canViewEjecutivo } = useCan("seguimiento-ejecutivo:ver");
  const { ok: hasRoleRRHH } = useHasRole(["rrhh", "jefe_area", "jefe_sector"]);
  const { ok: hasRoleDirectivo } = useHasRole(["directivo"]);

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

  const CARDS = [
    {
      key: "mi-desempeno",
      title: "Mi Desempeño",
      desc: "Visualizá tus objetivos, feedback y evolución.",
      icon: UserCircle2,
      to: "/mi-desempeno",
      allow: !!user,
      gradient: "from-blue-600 to-indigo-600",
      textColor: "text-blue-50",
    },
    {
      key: "mi-legajo",
      title: "Mi Legajo",
      desc: "Consultá tu información personal y laboral.",
      icon: FileText,
      to: user?.empleado?._id ? `/nomina/legajo/${user.empleado._id}` : "#",
      allow: !!user?.empleado?._id,
      gradient: "from-emerald-600 to-teal-600",
      textColor: "text-emerald-50",
    },
    {
      key: "simulador",
      title: "Simulador de Objetivos",
      desc: "Proyectá el cumplimiento de metas y bonos.",
      icon: Calculator,
      to: "/simulador",
      allow: hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector,
      gradient: "from-violet-600 to-purple-600",
      textColor: "text-violet-50",
    },
    {
      key: "objetivos",
      title: "Gestión de Objetivos",
      desc: "Administrar plantillas y asignaciones.",
      icon: Target,
      to: "/plantillas",
      allow: hasRoleRRHH || hasRoleDirectivo,
      gradient: "from-slate-700 to-slate-800",
      textColor: "text-slate-50",
    },
    {
      key: "seguimiento",
      title: "Seguimiento",
      desc: "Monitoreo de avance por áreas y sectores.",
      icon: TrendingUp,
      to: "/seguimiento",
      allow: hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente,
      gradient: "from-orange-500 to-red-500",
      textColor: "text-orange-50",
    },
    {
      key: "estructura",
      title: "Gestión de Equipo",
      desc: "Nómina, estructura y organigrama.",
      icon: Users,
      to: "/gestion-estructura",
      allow: canViewEstructura && (hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector),
      gradient: "from-cyan-600 to-blue-600",
      textColor: "text-cyan-50",
    },
    {
      key: "seguimiento-ejecutivo",
      title: "Tablero Ejecutivo",
      desc: "Indicadores clave de alto nivel.",
      icon: LayoutDashboard,
      to: "/seguimiento-ejecutivo",
      allow: canViewEjecutivo,
      gradient: "from-pink-600 to-rose-600",
      textColor: "text-pink-50",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero Section with Gradient */}
      <div className="relative bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] text-white pb-32 pt-12 px-6 lg:px-8 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-3xl mix-blend-screen animate-pulse"></div>
          <div className="absolute top-1/2 right-0 w-64 h-64 bg-purple-500 rounded-full blur-3xl mix-blend-screen opacity-60"></div>
        </div>

        <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-full opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 blur"></div>
              <div className="relative h-24 w-24 rounded-full overflow-hidden border-4 border-[#1e293b] bg-[#1e293b] shadow-2xl">
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
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
                Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">{displayName.split(" ")[0]}</span>
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  {prettyRol}
                </span>
                <span className="hidden md:inline text-slate-500">•</span>
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                  <Briefcase className="h-3.5 w-3.5 text-blue-400" />
                  {puesto}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl shadow-xl">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <CalendarDays className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Período Actual</div>
                <div className="text-lg font-bold text-white tracking-tight">{periodo}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Cards Grid */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 -mt-24 relative z-10 pb-12">
        <h2 className="text-lg font-semibold text-white/90 mb-6 flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          Panel de Control
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {CARDS.map(({ key, title, desc, icon: Icon, to, allow, gradient, textColor }) => {
            if (!allow) return null;

            return (
              <Link
                to={to}
                key={key}
                className="group relative bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-100 overflow-hidden"
              >
                <div className={`absolute top-0 right-0 p-24 bg-gradient-to-br ${gradient} opacity-[0.03] rounded-bl-full group-hover:scale-110 transition-transform duration-500`}></div>

                <div className="relative z-10">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`h-6 w-6 text-white`} />
                  </div>

                  <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                    {title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {desc}
                  </p>
                </div>

                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-2 group-hover:translate-x-0">
                  <div className={`p-2 rounded-full bg-slate-50 text-slate-400`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
