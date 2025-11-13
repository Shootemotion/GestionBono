// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CompleteInvite from "@/components/CompleteInvite.jsx";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("superadmin@diagnos.com");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const { login } = useAuth();

   const navigate = useNavigate();
  const from = "/"; // siempre redirigimos al home

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

            <div className="text-left">
              {/* Si querés volver a poner "¿Olvidaste tu contraseña?" lo agregamos aquí */}
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
      
    </>
  );
}
