import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, ArrowLeft, Search } from "lucide-react";
import { api, API_ORIGIN } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// --- helpers ---
const nombreDe = (c) => {
  if (!c) return "Usuario";
  const full = [c.apellido, c.nombre].filter(Boolean).join(", ");
  return full || c.apodo || c.nombre || c.email || "Usuario";
};

const inicialesDe = (c) => {
  const n = (c?.nombre || c?.email || "?").trim();
  const a = (c?.apellido || "").trim();
  const x = (a[0] || n[0] || "?") + (n[0] || "");
  return x.slice(0, 2).toUpperCase();
};

const fotoUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
};

const horaCorta = (fecha) => {
  try {
    return new Date(fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

function Avatar({ contacto, size = 40 }) {
  const src = fotoUrl(contacto?.fotoUrl);
  const dim = { width: size, height: size };
  if (src) {
    return <img src={src} alt="" style={dim} className="rounded-full object-cover shrink-0 border border-slate-200" />;
  }
  return (
    <div
      style={dim}
      className="rounded-full shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold"
    >
      {inicialesDe(contacto)}
    </div>
  );
}

export default function ChatWidget() {
  const { user } = useAuth();
  const myId = user?._id ? String(user._id) : null;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list"); // "list" | "thread"
  const [activo, setActivo] = useState(null); // contacto activo
  const [conversaciones, setConversaciones] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState("");
  const [noLeidos, setNoLeidos] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [enviando, setEnviando] = useState(false);

  const endRef = useRef(null);
  const activoRef = useRef(null);
  activoRef.current = activo;
  const mensajesRef = useRef([]);
  mensajesRef.current = mensajes;

  // --- fetchers ---
  const fetchNoLeidos = useCallback(async () => {
    try {
      const r = await api("/chat/no-leidos");
      setNoLeidos(r?.total || 0);
    } catch { /* silencioso en polling */ }
  }, []);

  const fetchConversaciones = useCallback(async () => {
    try {
      const r = await api("/chat/conversaciones");
      setConversaciones(Array.isArray(r) ? r : []);
    } catch { /* silencioso */ }
  }, []);

  const fetchContactos = useCallback(async () => {
    try {
      const r = await api("/chat/contactos");
      setContactos(Array.isArray(r) ? r : []);
    } catch { /* silencioso */ }
  }, []);

  const abrirHilo = useCallback(async (contacto) => {
    setActivo(contacto);
    setView("thread");
    setBusqueda("");
    try {
      const r = await api(`/chat/mensajes/${contacto._id}`);
      setMensajes(Array.isArray(r) ? r : []);
      // al abrir se marcan leídos → refrescar badge y bandeja
      fetchNoLeidos();
      fetchConversaciones();
    } catch {
      setMensajes([]);
    }
  }, [fetchNoLeidos, fetchConversaciones]);

  const enviar = useCallback(async (e) => {
    e?.preventDefault?.();
    const texto = input.trim();
    const contacto = activoRef.current;
    if (!texto || !contacto || enviando) return;
    setEnviando(true);
    try {
      const msg = await api("/chat/mensajes", { method: "POST", body: { para: contacto._id, texto } });
      setMensajes((prev) => [...prev, msg]);
      setInput("");
      fetchConversaciones();
    } catch {
      // dejar el texto para reintentar
    } finally {
      setEnviando(false);
    }
  }, [input, enviando, fetchConversaciones]);

  // --- polling: badge de no leídos (siempre que haya sesión) ---
  useEffect(() => {
    if (!myId) return;
    fetchNoLeidos();
    const id = setInterval(() => {
      if (!document.hidden) fetchNoLeidos();
    }, 10000);
    return () => clearInterval(id);
  }, [myId, fetchNoLeidos]);

  // --- al abrir el widget: cargar bandeja + contactos ---
  useEffect(() => {
    if (open && myId) {
      fetchConversaciones();
      fetchContactos();
    }
  }, [open, myId, fetchConversaciones, fetchContactos]);

  // --- polling de la bandeja mientras está abierta en la lista ---
  useEffect(() => {
    if (!open || view !== "list") return;
    const id = setInterval(() => {
      if (!document.hidden) fetchConversaciones();
    }, 5000);
    return () => clearInterval(id);
  }, [open, view, fetchConversaciones]);

  // --- polling incremental del hilo abierto ---
  useEffect(() => {
    if (!open || view !== "thread" || !activo?._id) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      const contacto = activoRef.current;
      if (!contacto?._id) return;
      const ultimo = mensajesRef.current[mensajesRef.current.length - 1];
      const desde = ultimo?.createdAt ? `?desde=${encodeURIComponent(ultimo.createdAt)}` : "";
      try {
        const nuevos = await api(`/chat/mensajes/${contacto._id}${desde}`);
        if (Array.isArray(nuevos) && nuevos.length) {
          setMensajes((prev) => {
            const ids = new Set(prev.map((m) => m._id));
            const add = nuevos.filter((m) => !ids.has(m._id));
            return add.length ? [...prev, ...add] : prev;
          });
          fetchNoLeidos();
        }
      } catch { /* silencioso */ }
    }, 3000);
    return () => clearInterval(id);
  }, [open, view, activo, fetchNoLeidos]);

  // autoscroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, view, open]);

  if (!user || !myId) return null;

  // Contactos filtrados por búsqueda (para iniciar una conversación nueva)
  const contactosFiltrados = contactos.filter((c) => {
    if (!busqueda.trim()) return false; // solo mostramos el buscador de contactos cuando se escribe
    return nombreDe(c).toLowerCase().includes(busqueda.toLowerCase());
  });

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 font-sans antialiased">
      {/* VENTANA */}
      {open && (
        <div className="w-[350px] md:w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-300">
          {/* HEADER */}
          <div className="p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center shrink-0 text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              {view === "thread" ? (
                <>
                  <button onClick={() => { setView("list"); setActivo(null); }} className="p-1 rounded-full hover:bg-white/10 transition-colors shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <Avatar contacto={activo} size={32} />
                  <h3 className="font-bold text-sm leading-tight truncate">{nombreDe(activo)}</h3>
                </>
              ) : (
                <>
                  <div className="bg-white/20 p-1.5 rounded-lg"><MessageCircle className="w-5 h-5" /></div>
                  <h3 className="font-bold text-sm leading-tight">Mensajes</h3>
                </>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CUERPO */}
          {view === "list" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
              {/* buscador */}
              <div className="p-2.5 border-b border-slate-100 bg-white shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar persona para chatear…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Resultados de búsqueda de contactos */}
                {busqueda.trim() ? (
                  contactosFiltrados.length ? (
                    contactosFiltrados.map((c) => (
                      <button key={c._id} onClick={() => abrirHilo(c)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white transition-colors text-left border-b border-slate-100">
                        <Avatar contacto={c} size={40} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{nombreDe(c)}</div>
                          {c.puesto && <div className="text-xs text-slate-400 truncate">{c.puesto}</div>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-400">Sin resultados.</div>
                  )
                ) : conversaciones.length ? (
                  conversaciones.map((c) => (
                    <button key={c.contacto?._id} onClick={() => abrirHilo(c.contacto)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white transition-colors text-left border-b border-slate-100">
                      <Avatar contacto={c.contacto} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{nombreDe(c.contacto)}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{horaCorta(c.ultimaFecha)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs truncate ${c.noLeidos > 0 ? "text-slate-800 font-medium" : "text-slate-400"}`}>
                            {c.ultimoEsMio ? "Vos: " : ""}{c.ultimoMensaje}
                          </span>
                          {c.noLeidos > 0 && (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {c.noLeidos}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No tenés conversaciones todavía.<br />Buscá una persona arriba para empezar.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* HILO */
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
                {mensajes.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-400">No hay mensajes. ¡Escribí el primero!</div>
                )}
                {mensajes.map((m) => {
                  const mio = String(m.de) === myId;
                  return (
                    <div key={m._id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mio ? "bg-blue-600 text-white rounded-br-sm" : "bg-white text-slate-700 border border-slate-100 rounded-bl-sm"}`}>
                        <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                        <div className={`text-[10px] mt-0.5 text-right ${mio ? "text-blue-100" : "text-slate-400"}`}>{horaCorta(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form onSubmit={enviar} className="p-2.5 bg-white border-t border-slate-100 shrink-0 flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribí un mensaje…"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                <button type="submit" disabled={!input.trim() || enviando} className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all disabled:opacity-50 shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* BOTÓN FLOTANTE */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-blue-500/40 hover:-translate-y-1 transition-all duration-300"
          title="Mensajes internos"
        >
          <MessageCircle className="w-6 h-6 relative z-10" />
          {noLeidos > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-rose-500 border-2 border-white text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {noLeidos > 99 ? "99+" : noLeidos}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
