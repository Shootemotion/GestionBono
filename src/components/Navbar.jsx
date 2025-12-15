// src/components/Navbar.jsx
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import logo from '@/assets/DiagnosLogo.png';
import { Button } from '@/components/ui/button';
import useCan, { useHasRole } from '@/hooks/useCan';
import { API_ORIGIN, api } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  CheckCircle,
  UserPlus,
  DollarSign,
  BarChart3,
  UserCircle,
  LogOut,
  Camera,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';

function Navbar({ showDisabledInsteadOfHiding = false }) {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  // ====== Avatar (misma lógica que EmpleadoCard) ======
  const fotoSrc = (empleado) => {
    const url = empleado?.fotoUrl;
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url; // ya absoluta
    const base = (typeof API_ORIGIN === 'string' && API_ORIGIN) ? API_ORIGIN : window.location.origin;
    return `${base.replace(/\/+$/, '')}/${String(url).replace(/^\/+/, '')}`;
  };
  const avatarSrc = useMemo(() => fotoSrc(user?.empleado), [user?.empleado?.fotoUrl]);
  // ====================================================

  // ====== Upload Foto (Navbar) ======
  const fileRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handlePick = () => {
    if (!user?.empleado?._id) return;
    fileRef.current?.click();
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user?.empleado?._id) return;
    try {
      setSubiendo(true);
      const fd = new FormData();
      fd.append('foto', file);

      // Ojo: api() debe soportar FormData (no setear Content-Type manual)
      const resp = await api(`/empleados/${user.empleado._id}/foto`, {
        method: 'POST',
        body: fd,
      });

      const empleadoActualizado = resp?.empleado || resp;
      if (empleadoActualizado?.fotoUrl) {
        // refresco en AuthContext sin romper el resto
        setUser((u) => ({
          ...u,
          empleado: {
            ...u?.empleado,
            fotoUrl: empleadoActualizado.fotoUrl,
            // por si backend también devuelve nombre/puesto actualizados:
            nombre: empleadoActualizado.nombre ?? u?.empleado?.nombre,
            apellido: empleadoActualizado.apellido ?? u?.empleado?.apellido,
            puesto: empleadoActualizado.puesto ?? u?.empleado?.puesto,
          },
        }));
      }
    } catch (err) {
      console.error(err);
      // Si tenés toast global, podés usarlo. Mantengo silencio para no meter dependencia acá.
      // toast.error("No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      // limpio el input para permitir re-subir el mismo archivo si quiere
      if (fileRef.current) fileRef.current.value = '';
      setMenuAbierto(false);
    }
  };
  // ===================================

  // Permisos / roles
  const { ok: canViewEstructura } = useCan('estructura:ver');
  const { ok: canViewNomina } = useCan('nomina:ver');
  const { ok: hasRoleRRHH } = useHasRole(['rrhh', 'jefe_area', 'jefe_sector']);
  const { ok: hasRoleDirectivo } = useHasRole(['directivo']);

  // Si es referente (aunque sea visor)
  const hasReferente = !!(
    user &&
    (
      (Array.isArray(user.referenteAreas) && user.referenteAreas.length > 0) ||
      (Array.isArray(user.referenteSectors) && user.referenteSectors.length > 0)
    )
  );

  // Estructura visible si tiene permiso directo, es referente o tiene rol jerárquico
  const canViewEstructuraFinal = useMemo(() => {
    return Boolean(
      canViewEstructura ||
      hasReferente ||
      user?.isJefeArea ||
      user?.isJefeSector ||
      user?.isRRHH ||
      user?.isSuper ||
      user?.rol === 'directivo'
    );
  }, [canViewEstructura, hasReferente, user]);

  // 🚩 Caso especial: VISOR puro (no referente)
  const isNormalUser = user?.rol === 'visor' && !hasReferente;

  // 🔒 Superadmin check for Users page
  const isSuperAdmin = user?.isSuper === true || user?.rol === 'superadmin';

  function handleLogout() {
    logout();
    nav('/login', { replace: true });
  }

  const linkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 min-w-[70px] ${isActive
      ? 'text-blue-600 bg-blue-50 shadow-sm ring-1 ring-blue-100'
      : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
    }`;

  const renderNavItem = (to, label, icon, allowed) => {
    if (allowed) return (
      <NavLink to={to} className={linkClass}>
        {icon && <span className="w-5 h-5">{icon}</span>}
        <span className="leading-none text-center">{label}</span>
      </NavLink>
    );
    if (!showDisabledInsteadOfHiding) return null;
    return (
      <span className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] text-slate-300 cursor-not-allowed min-w-[70px]" title="No tiene permisos">
        {icon && <span className="w-5 h-5">{icon}</span>}
        <span className="leading-none text-center">{label}</span>
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <nav className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="bg-blue-600 rounded-lg p-1 group-hover:bg-blue-700 transition-colors">
                <img src={logo} alt="Diagnos" className="h-5 w-auto filter brightness-0 invert" />
              </div>
              <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500 hidden md:block">
                Diagnos
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex flex-1 justify-center items-center px-4">
            {location.pathname !== '/' && (
              <div className="flex items-center gap-1">
                {isNormalUser ? (
                  <>
                    {/* 🚩 VISOR puro → solo Seguimiento y Mi desempeño */}
                    {renderNavItem('/seguimiento', 'Seguimiento', <LayoutDashboard />, true)}
                    {user && renderNavItem('/mi-desempeno', 'Mi Desempeño', <Target />, true)}
                    {user?.empleado?._id && renderNavItem(`/nomina/legajo/${user.empleado._id}`, 'Mi Legajo', <UserCircle />, true)}
                  </>
                ) : (
                  <>
                    {/* Nómina */}
                    {renderNavItem('/gestion-estructura', 'Nómina', <Users />, canViewEstructura)}

                    {/* Departamentos */}
                    {renderNavItem('/gestion-departamentos', 'Departamentos', <Building2 />, canViewEstructuraFinal)}

                    {/* Seguimiento Ejecutivo */}
                    {renderNavItem('/seguimiento-ejecutivo', 'Tablero', <BarChart3 />, true)}

                    {/* Objetivos (solo RRHH o Directivos) */}
                    {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/plantillas', 'Objetivos', <Target />, true)}
                    {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/rrhh-evaluaciones', 'Cierre', <CheckCircle />, true)}

                    {/* Asignaciones (solo RRHH o Directivos) */}
                    {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/asignaciones', 'Asignaciones', <UserPlus />, true)}

                    {/* Bonos (solo RRHH o Directivos) */}
                    {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/configuracion-bono', 'Config. Bonos', <DollarSign />, true)}
                    {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/resultados-bono', 'Resultados', <BarChart3 />, true)}

                    {/* Seguimiento (RRHH/Directivos/Nómina/Referentes) */}
                    {(hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente) &&
                      renderNavItem('/seguimiento', 'Seguimiento', <LayoutDashboard />, true)}

                    {/* Mi desempeño (todos logueados) */}
                    {user && renderNavItem('/mi-desempeno', 'Mi Desempeño', <Target />, true)}
                    {user?.empleado?._id && renderNavItem(`/nomina/legajo/${user.empleado._id}`, 'Mi Legajo', <UserCircle />, true)}

                    {/* Usuarios (solo SUPERADMIN) */}
                    {isSuperAdmin && renderNavItem('/usuarios', 'Usuarios', <Users />, true)}
                  </>
                )}
              </div>
            )}
          </div>

          {/* User Menu & Mobile Toggle */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                {/* User Dropdown */}
                <div className="relative ml-3">
                  <button
                    type="button"
                    className="flex items-center gap-3 max-w-xs rounded-full focus:outline-none group"
                    onClick={() => setMenuAbierto((v) => !v)}
                  >
                    <div className="flex flex-col items-end hidden md:flex">
                      <span className="text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                        {user?.fullName || (user?.apellido ? `${user.nombre} ${user.apellido}` : user?.email)}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {user?.empleado?.puesto || user?.rol || "Usuario"}
                      </span>
                    </div>
                    <div className="relative h-10 w-10 rounded-full overflow-hidden ring-2 ring-slate-100 group-hover:ring-blue-100 transition-all">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt=""
                          className={`h-full w-full object-cover ${subiendo ? 'opacity-60' : ''}`}
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                          {(user?.fullName || user?.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${menuAbierto ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {menuAbierto && (
                    <div
                      className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-lg ring-1 ring-black/5 py-1 z-50 transform opacity-100 scale-100 transition-all duration-200 origin-top-right"
                      onMouseLeave={() => setMenuAbierto(false)}
                    >
                      <div className="px-4 py-3 border-b border-slate-50 md:hidden">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {user?.fullName || user?.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {user?.empleado?.puesto || user?.rol}
                        </p>
                      </div>

                      <div className="py-1">
                        <button
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={handlePick}
                          disabled={subiendo || !user?.empleado?._id}
                        >
                          <Camera size={16} className="text-slate-400" />
                          {subiendo ? 'Subiendo...' : 'Cambiar foto'}
                        </button>

                        <button
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            nav('/mi-desempeno');
                            setMenuAbierto(false);
                          }}
                        >
                          <Target size={16} className="text-slate-400" />
                          Mi Desempeño
                        </button>
                      </div>

                      <div className="border-t border-slate-50 my-1" />

                      <button
                        className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                        onClick={handleLogout}
                      >
                        <LogOut size={16} />
                        Cerrar Sesión
                      </button>
                    </div>
                  )}
                </div>

                {/* Input file hidden */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFileChange}
                />
              </>
            ) : (
              <Button onClick={() => nav('/login')} variant="ghost" className="text-slate-600 hover:text-blue-600">
                Ingresar
              </Button>
            )}

            {/* Mobile menu button */}
            <div className="flex xl:hidden">
              <button
                type="button"
                className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span className="sr-only">Abrir menú</span>
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-white border-t border-slate-200">
          {location.pathname !== '/' && (
            <div className="px-2 pt-2 pb-3 space-y-1">
              {/* Mobile links here - simplified for brevity, ideally reuse renderNavItem logic adapted for mobile */}
              {isNormalUser ? (
                <>
                  <NavLink to="/seguimiento" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Seguimiento</NavLink>
                  <NavLink to="/mi-desempeno" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Mi Desempeño</NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/gestion-estructura" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Nómina</NavLink>
                  <NavLink to="/gestion-departamentos" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Departamentos</NavLink>
                  <NavLink to="/seguimiento-ejecutivo" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Tablero</NavLink>
                  {(hasRoleRRHH || hasRoleDirectivo) && <NavLink to="/plantillas" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Objetivos</NavLink>}
                  {(hasRoleRRHH || hasRoleDirectivo) && <NavLink to="/resultados-bono" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Bonos</NavLink>}
                  {isSuperAdmin && <NavLink to="/usuarios" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Usuarios</NavLink>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export default Navbar;
