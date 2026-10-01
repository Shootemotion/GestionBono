// src/lib/api.js
const RAW = import.meta.env.VITE_API_URL;
// Si no hay VITE_API_URL, cae al backend clásico en 5007 (tu caso actual)
const BASE = RAW || "http://localhost:5007/api";


// Origin robusto a partir de BASE (evita "http://uploads/...")
export const API_ORIGIN = new URL(BASE, window.location.origin).origin;

const TOKEN_KEY = "auth:token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// (opcionales)
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem("auth:user") || "null"); }
  catch { return null; }
};
export const setUser = (u) => localStorage.setItem("auth:user", JSON.stringify(u));
export const clearUser = () => localStorage.removeItem("auth:user");

export async function api(path, { method = 'GET', headers = {}, body, ...rest } = {}) {
  const token = getToken();
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;

  const isFormData = body instanceof FormData;
  if (!isFormData) h['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      ...rest,
    });
  } catch {
    const e = new Error('No pude conectar con la API');
    e.status = 'NETWORK';
    throw e;
  }

  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (res.status === 204) return null;

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { message: raw || 'Respuesta no JSON' };
  }

  if (!res.ok) {
    const e = new Error(data?.message || `Request error (${res.status})`);
    e.status = res.status;
    e.data = data;
    e.raw = raw;
    throw e;
  }

  return data;
}

/**
 * Descarga un archivo binario de la API (Excel, PDF) y dispara el "Guardar
 * como" del navegador. `api()` no sirve para esto porque siempre lee la
 * respuesta como texto y la intenta parsear como JSON, lo que corrompe el
 * binario.
 *
 * Respeta el nombre de archivo que manda el servidor en Content-Disposition.
 */
export async function apiDownload(path, { nombrePorDefecto = 'descarga' } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    // El backend contesta JSON cuando falla, aunque se haya pedido un archivo.
    let mensaje = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) mensaje = data.message;
    } catch { /* respuesta no JSON: nos quedamos con el status */ }
    const e = new Error(mensaje);
    e.status = res.status;
    throw e;
  }

  const disp = res.headers.get('content-disposition') || '';
  const nombre = (disp.match(/filename="?([^"]+)"?/) || [])[1] || nombrePorDefecto;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin el timeout, Safari cancela la descarga al revocar la URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { nombre, size: blob.size };
}
