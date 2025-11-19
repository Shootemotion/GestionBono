// src/hooks/useCan.js
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

// Hook principal: recibe una capability string o array y devuelve { ok: boolean }
export default function useCan(cap) {
  const { user } = useAuth();

  const caps = useMemo(() => {
    if (!user) return [];
    // user.permisos puede tener '*' o permisos puntuales
    return user.permisos || [];
  }, [user]);

 const ok = useMemo(() => {
  if (!user) return false;

  const rol = String(user.rol || "").toLowerCase();
  const isSuperLike =
    rol === "superadmin" ||
    rol === "directivo" ||      // 👈 director por rol
    user.isSuper === true ||
    user.isDirectivo === true;  // 👈 director por flag

  // 🎩 Super / Director: todo permitido
  if (isSuperLike) return true;

  // si no piden cap explícita, permito (control a nivel de rutas)
  if (!cap) return true;

  if (Array.isArray(cap)) {
    return cap.some((c) => caps.includes(c) || c === "*");
  }
  return caps.includes(cap) || caps.includes("*");
}, [user, caps, cap]);
  return { ok };
}


export function useHasRole(roles = []) {
  const { user } = useAuth();
  const ok = useMemo(() => {
    if (!user) return false;
    const rol = String(user.rol || "").toLowerCase();
    if (rol === "superadmin" || rol === "directivo" || user.isSuper === true || user.isDirectivo === true) {
      return true; // 👈 director también pasa todos los checks de rol
    }
    if (!roles || roles.length === 0) return false;
    return roles.includes(user.rol);
  }, [user, roles]);
  return { ok };
}
