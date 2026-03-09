// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CompleteInvite from "@/components/CompleteInvite.jsx";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  // Forgot Password States
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const { login } = useAuth();

  const navigate = useNavigate();
  const from = "/"; // siempre redirigimos al home

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotMsg("");
    setForgotLoading(true);

    try {
      // Usamos fetch directo a la API ya que no estamos logueados ni usamos useAuth para esto
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5007/api'}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();

      if (!res.ok) {
        setForgotMsg(data.message || "Error al solicitar recuperar contraseña");
      } else {
        setForgotSuccess(true);
      }
    } catch (err) {
      setForgotMsg("Error de conexión con el servidor");
    } finally {
      setForgotLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      // Usamos el login centralizado del AuthContext
      await login(email, password);

      // si todo OK, navegar
      // siempre al home
      navigate("/", { replace: true });

      // fallback por si StrictMode retrasa el navigate
      setTimeout(() => {
        if (window.location.pathname === "/login") {
          window.location.assign("/");
        }
      }, 50);
    } catch (err) {
      // Si el backend respondió 409 => completar invitación (clave temporal)
      if (err?.status === 409 && err?.data?.code === "PASSWORD_CHANGE_REQUIRED") {
        setInviteEmail(email);
        setInviteOpen(true);
        setMsg("");
      } else if (err?.status === 401) {
        setMsg("Correo o contraseña incorrectos.");
      } else {
        setMsg(err?.data?.message || err?.message || "Error al ingresar.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <div className="w-[420px] rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1">Ingresar</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Usá tu correo corporativo y contraseña.
          </p>

          {msg && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {msg}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Correo */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground">
                Correo
              </label>
              <div className="relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring pr-9"
                  placeholder="tu.nombre@diagnos.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <span className="absolute inset-y-0 right-2 flex items-center text-muted-foreground pointer-events-none">
                  ✉️
                </span>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-muted-foreground">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring pr-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:opacity-95 disabled:opacity-70"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      </div>

      <CompleteInvite
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialEmail={inviteEmail}
        afterLoginRedirect="/"
      />

      {/* MODAL RECUPERAR CONTRASEÑA */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Recuperar Acceso</h2>

              {!forgotSuccess ? (
                <>
                  <p className="text-sm text-slate-500 mb-5">
                    Ingresá tu correo corporativo y te enviaremos una contraseña temporal de un solo uso.
                  </p>

                  {forgotMsg && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                      {forgotMsg}
                    </div>
                  )}

                  <form onSubmit={handleForgotPassword}>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Email</label>
                        <input
                          type="email"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="nombre@diagnos.com.ar"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setForgotOpen(false)}
                          disabled={forgotLoading}
                          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={forgotLoading}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-70 min-w-[100px]"
                        >
                          {forgotLoading ? 'Enviando...' : 'Enviar correo'}
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">¡Revisá tu bandeja!</h3>
                  <p className="text-sm text-slate-600 mb-6">
                    Si el correo existe en nuestra base de datos, te hemos enviado las instrucciones para entrar.
                  </p>
                  <button
                    onClick={() => {
                      setForgotOpen(false);
                      setForgotSuccess(false);
                      setForgotEmail("");
                    }}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
