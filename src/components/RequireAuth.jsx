// src/components/RequireAuth.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';


/**
 * Props:
 *  - children
 *  - allow: optional array of allowed roles (ej: ['superadmin','rrhh'])
 *  - allowReferente: optional boolean -> permite si user.referenteAreas o referenteSectors tiene items
 *
 * Behavior:
 *  - while loading -> muestra nada (o spinner)
 *  - si no autenticado -> redirect /login
 *  - si user.isSuper -> permite
 *  - si allow incluye el role del user -> permite
 *  - si allowReferente && user es referente -> permite
 */
export default function RequireAuth({ children, allow = null, allowReferente = false, allowCalidad = false }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    // podés renderizar un spinner si tenés uno. Sino null para no bloquear la UI.
    return null;
    // return <div className="p-6"><Spinner/></div>;
  }

  if (!user || user._id === 'anon') {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  // super siempre pasa
  if (user.isSuper) return children;

  // si no se pasó allow -> permitimos (control a nivel interno)
  if (!allow || !Array.isArray(allow) || allow.length === 0) {
    return children;
  }

  // si el rol del user está en allow -> pasa
  const userRole = String(user.rol || "").toLowerCase();
  if (allow.includes(userRole)) return children;

  // soporte para pasar 'capabilities' en el futuro: se podría chequear user.permisos
  if (allowCalidad && user.isCalidad) return children;

  // allowReferente: permitir si es referente de algo
  if (allowReferente) {
    const isRef = (Array.isArray(user.referenteAreas) && user.referenteAreas.length > 0)
      || (Array.isArray(user.referenteSectors) && user.referenteSectors.length > 0);
    if (isRef) return children;
  }

  // no autorizado
  return <Navigate to="/403" replace />;
}
