// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken, getToken } from '@/lib/api';

const AuthCtx = createContext(null);

async function fetchWhoamiVariants() {
  // intenta los endpoints que tu backend podría exponer (compatibilidad)
  const tries = ['/auth/me', '/_whoami', '/auth/whoami'];
  for (const path of tries) {
    try {
      const me = await api(path);
      if (me) return me;
    } catch (err) {
      // si da 401/403/404, seguimos a la siguiente opción
      // no logueamos el error aquí para evitar spam en consola
    }
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // efecto inicial: si hay token, intentamos obtener user desde el servidor
  useEffect(() => {
    (async () => {
      try {
        const t = getToken();
        if (t) {
          const me = await fetchWhoamiVariants();
          setUser(me || null);
        } else {
          setUser(null);
        }
      } catch (e) {
        // token inválido u otro error: limpiamos
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    // llamamos al login "clásico"
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });

    // soportamos varias formas de token en la respuesta
    const token = data?.token ?? data?.accessToken ?? data?.jwt ?? data?.data?.token;
    if (token) {
      setToken(token);
    } else {
      // si no vino token, igual intentamos usar user devuelto por el endpoint
      const maybeUser = data?.user ?? data?.data?.user ?? null;
      if (maybeUser) {
        setUser(maybeUser);
        return maybeUser;
      }
      throw new Error('No se recibió token del servidor al loguear');
    }

    // con token guardado, pedimos whoami (prueba variantes)
    try {
      const me = await fetchWhoamiVariants();
      // si no responde whoami, intentar reconstruir user desde login response
      const u = me || data?.user || data?.data?.user || null;
      setUser(u);
      return u;
    } catch (err) {
      // si falla, limpiar token y propagar
      clearToken();
      setUser(null);
      throw err;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
    sessionStorage.removeItem('adminUser');
  }

  function impersonateUser(targetUser) {
    if (!user?.isSuper && user?.rol !== 'superadmin') return;
    // Guardar el admin real si no estamos ya enmascarando
    if (!sessionStorage.getItem('adminUser')) {
      sessionStorage.setItem('adminUser', JSON.stringify(user));
    }
    setUser(targetUser);
  }

  function stopImpersonating() {
    const adminStr = sessionStorage.getItem('adminUser');
    if (adminStr) {
      const admin = JSON.parse(adminStr);
      setUser(admin);
      sessionStorage.removeItem('adminUser');
    }
  }

  const isImpersonating = !!sessionStorage.getItem('adminUser');

  const value = { user, loading, login, logout, isAuth: !!user, setUser, impersonateUser, stopImpersonating, isImpersonating };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    console.warn('useAuth: AuthProvider no encontrado. Usando fallback seguro.');
    return {
      user: null,
      loading: false,
      login: async () => { throw new Error('No AuthProvider'); },
      logout: () => {},
      isAuth: false,
      setUser: () => {},
    };
  }
  return ctx;
}
