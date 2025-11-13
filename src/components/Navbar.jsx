// src/components/Navbar.jsx
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import logo from '@/assets/DiagnosLogo.png';
import { Button } from '@/components/ui/button';
import useCan, { useHasRole } from '@/hooks/useCan';
import { API_ORIGIN, api } from "@/lib/api";

function Navbar({ showDisabledInsteadOfHiding = false }) {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();

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
  const { ok: canManageUsuarios } = useCan('usuarios:manage');
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

  function handleLogout() {
    logout();
    nav('/login', { replace: true });
  }

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'text-foreground bg-muted' : 'text-white/90 hover:text-white hover:bg-white/10'
    }`;

  const renderNavItem = (to, label, allowed) => {
    if (allowed) return <NavLink to={to} className={linkClass}>{label}</NavLink>;
    if (!showDisabledInsteadOfHiding) return null;
    return (
      <span className="px-3 py-2 rounded-md text-sm text-white/40 cursor-not-allowed" title="No tiene permisos">
        {label}
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-700 bg-[var(--color-1)] text-white">
      <nav className="flex items-center h-16 justify-between">
        {/* Logo */}
        <div className="flex items-center h-full">
          <Link to="/" className="h-full flex items-center px-6 bg-white hover:bg-gray-200 transition-colors">
            <img src={logo} alt="Diagnos" className="h-9 w-auto filter invert(1)" />
          </Link>
        </div>

        {/* LINKS */}
        <div className="flex-1 flex justify-center items-center">
          <div className="flex items-center gap-3">
            {isNormalUser ? (
              <>
                {/* 🚩 VISOR puro → solo Seguimiento y Mi desempeño */}
                {renderNavItem('/seguimiento', 'Seguimiento', true)}
                {user && renderNavItem('/mi-desempeno', 'Mi desempeño', true)}
              </>
            ) : (
              <>
                {/* Nómina */}
                {renderNavItem('/gestion-estructura', 'Nomina', canViewEstructura)}

                {/* Departamentos */}
                {renderNavItem('/gestion-departamentos', 'Departamentos', canViewEstructuraFinal)}

                {/* Seguimiento Ejecutivo */}
                {renderNavItem('/seguimiento-ejecutivo', 'Seguimiento Ejecutivo', true)}

                {/* Objetivos (solo RRHH o Directivos) */}
               {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/plantillas', 'Objetivos', true)}
                {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/rrhh-evaluaciones', 'Cierre RRHH', true)}
                {/* Asignaciones (solo RRHH o Directivos) */}
                {(hasRoleRRHH || hasRoleDirectivo) && renderNavItem('/asignaciones', 'Asignaciones', true)}

                {/* Seguimiento (RRHH/Directivos/Nómina/Referentes) */}
                {(hasRoleRRHH || hasRoleDirectivo || canViewNomina || hasReferente) &&
                  renderNavItem('/seguimiento', 'Seguimiento', true)}

                {/* Mi desempeño (todos logueados) */}
                {user && renderNavItem('/mi-desempeno', 'Mi desempeño', true)}

                {/* Usuarios (solo admins de usuarios) */}
                {canManageUsuarios && renderNavItem('/usuarios', 'Usuarios', true)}
              </>
            )}
          </div>
        </div>

        {/* Usuario */}
        <div className="flex items-center gap-3 px-6 relative">
          {user ? (
            <>
              {/* Avatar con menú */}
              <div className="relative">
                <button
                  type="button"
                  className="group h-12 w-12 rounded-full overflow-hidden border-2 border-white/30 shadow-md focus:outline-none focus:ring-2 focus:ring-white/40"
                  onClick={() => setMenuAbierto((v) => !v)}
                  title="Abrir menú de usuario"
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={user?.fullName || user?.email || 'Usuario'}
                      className={`h-full w-full object-cover transition-opacity ${subiendo ? 'opacity-60' : 'opacity-100'}`}
                    />
                  ) : (
                    <div className="h-full w-full bg-white/20 flex items-center justify-center text-sm font-medium">
                      {(user?.fullName || user?.email || "?")[0]}
                    </div>
                  )}
                </button>

                {/* Menú flotante */}
                {menuAbierto && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-md bg-white text-gray-900 shadow-lg ring-1 ring-black/10 overflow-hidden z-50"
                    onMouseLeave={() => setMenuAbierto(false)}
                  >
                    <div className="px-4 py-3 border-b">
                      <div className="text-sm font-medium truncate">
                        {user?.fullName || (user?.apellido ? `${user.apellido}, ${user.nombre}` : user?.email)}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{user?.empleado?.puesto || "—"}</div>
                    </div>

                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-60"
                      onClick={handlePick}
                      disabled={subiendo || !user?.empleado?._id}
                    >
                      {subiendo ? 'Subiendo foto…' : 'Cambiar foto'}
                    </button>

                    <div className="border-t" />

                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      onClick={() => nav('/mi-desempeno')}
                    >
                      Mi desempeño
                    </button>

                    <button
                      className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
                      onClick={handleLogout}
                    >
                      Salir
                    </button>
                  </div>
                )}
              </div>

              {/* Input file oculto */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />

              {/* Info usuario */}
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-medium opacity-90">
                  {user?.fullName || (user?.apellido ? `${user.apellido}, ${user.nombre}` : user?.email)}
                </span>
                <span className="text-xs text-gray-200">
                  {user?.empleado?.puesto || "—"}
                </span>
                <span className="text-xs text-gray-400">
                  {user?.rol}
                </span>
              </div>

              {/* Logout */}
              <Button
                variant="outline"
                className="bg-white/10 hover:bg白/20 text-white border-white/20"
                onClick={handleLogout}
              >
                Salir
              </Button>
            </>
          ) : (
            <Link to="/login" className="text-sm underline">Ingresar</Link>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
