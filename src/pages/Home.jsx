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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import useCan, { useHasRole } from "@/hooks/useCan";
import { API_ORIGIN } from "@/lib/api";

function quarterLabel(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q}-${d.getFullYear()}`;
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
      key: "objetivos",
      title: "Definir Objetivos",
      desc: "Crear y administrar plantillas de objetivos y aptitudes.",
      icon: Target,
      to: "/plantillas",
      allow: hasRoleRRHH || hasRoleDirectivo,
      color: "bg-teal-900/90",
    },
    {
      key: "seguimiento-ejecutivo",
      title: "Seguimiento Ejecutivo",
      desc: "Vista global de indicadores clave de la organización.",
      icon: BarChart3,
      to: "/seguimiento-ejecutivo",
      allow: canViewEjecutivo,
      color: "bg-sky-900/90",
    },
    {
      key: "bonos",
      title: "Cálculo de Bonos",
      desc: "Gestión y simulación de bonificaciones anuales.",
      icon: Calculator,
      to: "/seguimiento",
      allow: hasRoleRRHH || hasRoleDirectivo,
      color: "bg-emerald-900/90",
    },
    {
      key: "estructura",
      title: "Gestión de Equipo",
      desc: "Administrar nómina, áreas y sectores.",
      icon: Users,
      to: "/gestion-estructura",
      // 🔐 ahora se alinea con el permiso real
      allow: canViewEstructura,
      color: "bg-cyan-900/90",
    },
    {
      key: "seguimiento",
      title: "Seguimiento Organizacional",
      desc: "Monitorear avance de objetivos por área, sector y referentes.",
      icon: TrendingUp,
      to: "/seguimiento",
      allow:
        hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente,
      color: "bg-indigo-900/90",
    },
    {
      key: "mi-desempeno",
      title: "Mi Desempeño",
      desc: "Ver tus objetivos, avances y feedback individual.",
      icon: UserCircle2,
      to: "/mi-desempeno",
      allow: !!user,
      color: "bg-slate-900/90",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full flex justify-center bg-muted/20">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="rounded-xl overflow-hidden shadow-sm border border-border bg-card">
          <div className="bg-[#075C66] text-white px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-white/40 shadow-md bg-white/10 flex items-center justify-center text-2xl font-semibold">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initialsFromUser(user)}</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                  Bienvenido, {displayName.split(" ")[0] || "Usuario"}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                    <Shield className="h-4 w-4" />
                    {prettyRol}
                  </span>
                  <span className="opacity-80">·</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                    {puesto}
                  </span>
                  <span className="opacity-80">·</span>
                  <span className="opacity-90">
                    Portal de Desempeño Diagnos
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 self-start md:self-auto">
              <CalendarDays className="h-5 w-5" />
              <div className="text-sm">
                <div className="opacity-80">Período actual</div>
                <div className="font-semibold">{periodo}</div>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold">Navegación del sistema</h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CARDS.map(({ key, title, desc, icon: Icon, to, allow, color }) => {
            const badge = allow ? "Acceso completo" : "Sin acceso";
            const cardBody = (
              <div
                className={[
                  "group rounded-xl border border-border bg-card hover:shadow-md transition overflow-hidden",
                  !allow ? "opacity-55 pointer-events-none" : "",
                ].join(" ")}
              >
                <div
                  className={`h-16 ${color} text-white flex items-center justify-between px-4`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 grid place-items-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-lg font-semibold">{title}</div>
                  </div>
                  <span className="text-[11px] tracking-wide rounded-full bg-white/10 px-2 py-0.5">
                    {badge}
                  </span>
                </div>
                <div className="p-4 text-sm text-muted-foreground">{desc}</div>
              </div>
            );

            return allow ? (
              <Link
                to={to}
                key={key}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                {cardBody}
              </Link>
            ) : (
              <div key={key}>{cardBody}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
