// src/components/Navbar.jsx
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useMemo, useRef, useState, useEffect } from 'react';
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
  ChevronDown,
  UserCircle2,
  TrendingUp,
  Calculator,
  Home
} from 'lucide-react';

// --- Subcomponentes para Dropdowns ---
// Ahora controlado por props para evitar que queden abiertos varios a la vez
const DropdownGroup = ({ title, icon, items = [], isOpen, onMouseEnter, onMouseLeave, closeMenu }) => {
  const location = useLocation();

  // Si algún hijo está activo, marcamos el grupo como visualmente activo
  const isActiveGroup = items.some(item => location.pathname.startsWith(item.to));

  // Filtramos los permitidos
  const visibleItems = items.filter(i => i.allowed);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
        ${isActiveGroup || isOpen ? 'text-blue-600 bg-blue-50/50' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'}
        `}
      >
        <span>{title}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 opacity-50 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menú Flotante */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl ring-1 ring-black/5 p-1 z-[60] animate-in fade-in zoom-in-95 duration-100">
          {visibleItems.map((sub, idx) => (
            <Link
              key={idx}
              to={sub.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${location.pathname === sub.to ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
              `}
              onClick={closeMenu} // cerrar al click
            >
              <div className={`p-1.5 rounded-md ${location.pathname === sub.to ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}>
                {sub.icon}
              </div>
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const MobileLink = ({ to, label, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`
    }
  >
    {label}
  </NavLink>
);

function Navbar({ showDisabledInsteadOfHiding = false }) {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  // Estados para manejo coordinado de menús
  const [activeMenu, setActiveMenu] = useState(null);
  const closeTimeoutRef = useRef(null);

  const handleMenuEnter = (menuName) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveMenu(menuName);
  };

  const handleMenuLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  };

  const closeMenu = () => {
    setActiveMenu(null);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };


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
  const { ok: canViewEjecutivo } = useCan('seguimiento-ejecutivo:ver');
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
          <div className="flex-shrink-0 flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="bg-blue-600 rounded-lg p-1.5 group-hover:bg-blue-700 transition-colors">
                <img src={logo} alt="Diagnos" className="h-6 w-auto filter brightness-0 invert" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500 hidden md:block tracking-tight">
                Diagnos
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex flex-1 justify-center items-center px-4">
            {location.pathname !== '/' && (
              <div className="flex items-center gap-1">
                {/* Home Icon */}
                <NavLink to="/" className={linkClass}>
                  <span className="w-5 h-5"><Home /></span>
                  <span className="leading-none text-center">Home</span>
                </NavLink>
                {isNormalUser ? (
                  <>
                    {renderNavItem('/seguimiento', 'Seguimiento', <LayoutDashboard />, true)}
                    {user && renderNavItem('/mi-desempeno', 'Mi Desempeño', <Target />, true)}
                    {user?.empleado?._id && renderNavItem(`/nomina/legajo/${user.empleado._id}`, 'Mi Legajo', <UserCircle />, true)}
                  </>
                ) : (
                  <>
                    {/* --- Mi Espacio --- */}
                    <DropdownGroup
                      title="Mi Espacio"
                      icon={<UserCircle2 className="w-4 h-4" />}
                      items={[
                        { to: '/mi-desempeno', label: 'Mi Desempeño', icon: <Target className="w-4 h-4" />, allowed: true },
                        { to: user?.empleado?._id ? `/nomina/legajo/${user.empleado._id}` : '#', label: 'Mi Legajo', icon: <UserCircle className="w-4 h-4" />, allowed: !!user?.empleado?._id }
                      ]}
                      isOpen={activeMenu === 'Mi Espacio'}
                      onMouseEnter={() => handleMenuEnter('Mi Espacio')}
                      onMouseLeave={handleMenuLeave}
                      closeMenu={closeMenu}
                    />

                    {/* --- Gestión & Seguimiento --- */}
                    <DropdownGroup
                      title="Gestión"
                      icon={<Target className="w-4 h-4" />}
                      items={[
                        { to: '/plantillas', label: 'Objetivos', icon: <Target className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo },
                        { to: '/seguimiento', label: 'Seguimiento', icon: <TrendingUp className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente },
                        { to: '/rrhh-evaluaciones', label: 'Cierre Eval.', icon: <CheckCircle className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo },
                        { to: '/asignaciones', label: 'Asignaciones', icon: <UserPlus className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo }
                      ]}
                      isOpen={activeMenu === 'Gestión'}
                      onMouseEnter={() => handleMenuEnter('Gestión')}
                      onMouseLeave={handleMenuLeave}
                      closeMenu={closeMenu}
                    />

                    {/* --- Estructura & Organización --- */}
                    <DropdownGroup
                      title="Estructura"
                      icon={<Building2 className="w-4 h-4" />}
                      items={[
                        { to: '/gestion-estructura', label: 'Equipo / Nómina', icon: <Users className="w-4 h-4" />, allowed: canViewEstructura },
                        { to: '/gestion-departamentos', label: 'Departamentos', icon: <Building2 className="w-4 h-4" />, allowed: canViewEstructuraFinal },
                        { to: '/usuarios', label: 'Usuarios', icon: <Users className="w-4 h-4" />, allowed: isSuperAdmin }
                      ]}
                      isOpen={activeMenu === 'Estructura'}
                      onMouseEnter={() => handleMenuEnter('Estructura')}
                      onMouseLeave={handleMenuLeave}
                      closeMenu={closeMenu}
                    />

                    {/* --- Resultados & Estrategia --- */}
                    <DropdownGroup
                      title="Resultados"
                      icon={<BarChart3 className="w-4 h-4" />}
                      items={[
                        { to: '/seguimiento-ejecutivo', label: 'Tablero Ejec.', icon: <LayoutDashboard className="w-4 h-4" />, allowed: canViewEjecutivo },
                        { to: '/configuracion-bono', label: 'Config. Bonos', icon: <DollarSign className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo },
                        { to: '/resultados-bono', label: 'Resultados', icon: <BarChart3 className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo },
                        { to: '/simulador', label: 'Simulador', icon: <Calculator className="w-4 h-4" />, allowed: hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector }
                      ]}
                      isOpen={activeMenu === 'Resultados'}
                      onMouseEnter={() => handleMenuEnter('Resultados')}
                      onMouseLeave={handleMenuLeave}
                      closeMenu={closeMenu}
                    />
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
        <div className="xl:hidden bg-white border-t border-slate-200 h-[calc(100vh-3.5rem)] overflow-y-auto">
          {location.pathname !== '/' && (
            <div className="px-4 pt-4 pb-8 space-y-6">
              {/* Simplified mobile menu - just showing all links under headers */}
              {isNormalUser ? (
                <div className="space-y-2">
                  <NavLink to="/seguimiento" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Seguimiento</NavLink>
                  <NavLink to="/mi-desempeno" className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-50">Mi Desempeño</NavLink>
                </div>
              ) : (
                <>
                  {/* Mi Espacio */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mi Espacio</h3>
                    <div className="space-y-1">
                      <MobileLink to="/mi-desempeno" label="Mi Desempeño" />
                      {user?.empleado?._id && <MobileLink to={`/nomina/legajo/${user.empleado._id}`} label="Mi Legajo" />}
                    </div>
                  </div>

                  {/* Gestión */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Gestión</h3>
                    <div className="space-y-1">
                      {(hasRoleRRHH || hasRoleDirectivo) && <MobileLink to="/plantillas" label="Objetivos" />}
                      {(hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente) && <MobileLink to="/seguimiento" label="Seguimiento" />}
                      {(hasRoleRRHH || hasRoleDirectivo) && <MobileLink to="/asignaciones" label="Asignaciones" />}
                      {(hasRoleRRHH || hasRoleDirectivo) && <MobileLink to="/rrhh-evaluaciones" label="Cierres" />}
                    </div>
                  </div>

                  {/* Estructura */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Estructura</h3>
                    <div className="space-y-1">
                      {canViewEstructura && <MobileLink to="/gestion-estructura" label="Nómina / Equipo" />}
                      {canViewEstructuraFinal && <MobileLink to="/gestion-departamentos" label="Departamentos" />}
                      {isSuperAdmin && <MobileLink to="/usuarios" label="Usuarios" />}
                    </div>
                  </div>

                  {/* Resultados */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Resultados</h3>
                    <div className="space-y-1">
                      {(canViewEjecutivo && (hasRoleRRHH || hasRoleDirectivo)) && <MobileLink to="/seguimiento-ejecutivo" label="Tablero Ejecutivo" />}
                      {(hasRoleRRHH || hasRoleDirectivo) && <MobileLink to="/configuracion-bono" label="Config. Bonos" />}
                      {(hasRoleRRHH || hasRoleDirectivo) && <MobileLink to="/resultados-bono" label="Resultados Finales" />}
                      {(hasRoleRRHH || hasRoleDirectivo || user?.isJefeArea || user?.isJefeSector) && <MobileLink to="/simulador" label="Simulador" />}
                    </div>
                  </div>
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
