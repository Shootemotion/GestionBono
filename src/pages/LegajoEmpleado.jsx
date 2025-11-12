// src/pages/LegajoEmpleado.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";

/* ---------- UI helpers ---------- */
const EstadoTag = ({ estado = "ACTIVO" }) => {
  const map = {
    ACTIVO: "bg-emerald-100 text-emerald-700",
    SUSPENDIDO: "bg-amber-100 text-amber-800",
    DESVINCULADO: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] ${map[estado] || "bg-slate-100 text-slate-700"}`}>
      {estado}
    </span>
  );
};

const Field = ({ label, value }) => (
  <div>
    <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-sm">{value ?? "—"}</div>
  </div>
);

const FieldInput = ({ label, type = "text", value, onChange, disabled }) => (
  <div>
    <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
    <input
      type={type}
      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  </div>
);

/* ---------- Pestañas ---------- */
const TABS = ["Informacion basica", "Datos laborales", "Capacitaciones", "Documentos"];

export default function LegajoEmpleado() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);

  const isRRHH = !!(user?.isSuper || user?.isRRHH || user?.caps?.includes?.("nomina:editar"));

  // Tab desde URL (?tab=datos-laborales)
  const initialTab = (() => {
    const q = (searchParams.get("tab") || "").toLowerCase();
    const map = {
      "informacion-basica": TABS[0],
      "datos-laborales": TABS[1],
      "capacitaciones": TABS[2],
      "documentos": TABS[3],
    };
    return map[q] || TABS[0];
  })();
  const [tab, setTab] = useState(initialTab);

  // Formularios
  const [estadoLaboral, setEstadoLaboral] = useState("ACTIVO");
  const [cvFile, setCvFile] = useState(null);
  const [sueldo, setSueldo] = useState({
    monto: "",
    moneda: "ARS",
    vigenteDesde: new Date().toISOString().slice(0, 10),
  });

  // Carga inicial
  useEffect(() => {
    (async () => {
      try {
        const e = await api(`/empleados/${id}`);
        setEmp(e);
        setEstadoLaboral(e?.estadoLaboral || "ACTIVO");
        setSueldo({
          monto: e?.sueldoBase?.monto ?? "",
          moneda: e?.sueldoBase?.moneda ?? "ARS",
          vigenteDesde: e?.sueldoBase?.vigenteDesde
            ? String(e.sueldoBase.vigenteDesde).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        });
      } catch (err) {
        console.error(err);
        toast.error("No se pudo cargar el legajo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Persistir tab en URL
  useEffect(() => {
    const key =
      tab === TABS[0]
        ? "informacion-basica"
        : tab === TABS[1]
        ? "datos-laborales"
        : tab === TABS[2]
        ? "capacitaciones"
        : "documentos";
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", key);
      return p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const historico = useMemo(() => {
    const h = emp?.sueldoBase?.historico || [];
    return h.slice().sort((a, b) => new Date(b?.desde || 0) - new Date(a?.desde || 0));
  }, [emp]);

  /* ---------- Acciones ---------- */
  const onGuardarEstado = async () => {
    try {
      const resp = await api(`/empleados/${id}`, { method: "PATCH", body: { estadoLaboral } });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      toast.success("Estado laboral actualizado.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el estado.");
    }
  };

  const onGuardarSueldo = async () => {
    try {
      const payload = {
        monto: Number(sueldo.monto),
        moneda: sueldo.moneda || "ARS",
        vigenteDesde: sueldo.vigenteDesde ? new Date(sueldo.vigenteDesde) : new Date(),
      };
      if (!payload.monto || payload.monto <= 0) return toast.error("Ingresá un monto válido.");
      const resp = await api(`/empleados/${id}/sueldo`, { method: "POST", body: payload });
      const updEmp = resp?.empleado || resp; // ← el controller devuelve {success, empleado}
      setEmp(updEmp);
      setSueldo({
        monto: updEmp?.sueldoBase?.monto ?? "",
        moneda: updEmp?.sueldoBase?.moneda ?? "ARS",
        vigenteDesde: updEmp?.sueldoBase?.vigenteDesde
          ? String(updEmp.sueldoBase.vigenteDesde).slice(0, 10)
          : sueldo.vigenteDesde,
      });
      toast.success("Sueldo actualizado y registrado en histórico.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el sueldo.");
    }
  };

  const onSubirCV = async () => {
    if (!cvFile) return toast.info("Seleccioná un archivo .pdf/.docx primero.");
    try {
      const fd = new FormData();
      fd.append("cv", cvFile);
      const resp = await api(`/empleados/${id}/cv`, { method: "POST", body: fd });
      const upd = resp?.empleado || resp;
      setEmp(upd);
      setCvFile(null);
      toast.success("CV subido.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo subir el CV.");
    }
  };

  if (loading) return <div className="p-6">Cargando…</div>;
  if (!emp) return <div className="p-6 text-sm text-muted-foreground">Empleado no encontrado.</div>;

  return (
    <div className="min-h-screen bg-[#f5f9fc]">
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Legajo de {emp.apellido}, {emp.nombre}</h1>
            <p className="text-sm text-muted-foreground">Gestión integral del legajo.</p>
          </div>
          <div className="flex items-center gap-2">
            <EstadoTag estado={emp?.estadoLaboral || "ACTIVO"} />
            <button onClick={() => navigate(-1)} className="text-sm px-3 py-2 rounded-md bg-muted hover:bg-muted/70">
              Volver
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm ring-1 ring-border/60 ${
                tab === t ? "bg-background shadow-sm" : "bg-muted hover:bg-muted/70 text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Col 1: Snapshot */}
          <aside className="lg:col-span-1 rounded-xl bg-card ring-1 ring-border/60 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={
                  emp.fotoUrl
                    ? `/${emp.fotoUrl}`
                    : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        `${emp.nombre} ${emp.apellido}`
                      )}`
                }
                alt="foto"
                className="h-14 w-14 rounded-full ring-1 ring-border/60 object-cover"
              />
              <div>
                <div className="font-semibold">
                  {emp.apellido}, {emp.nombre}
                </div>
                <div className="text-xs text-muted-foreground">{emp.puesto || "—"}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              DNI: <b className="text-foreground">{emp.dni}</b>
              <br />
              CUIL: <b className="text-foreground">{emp.cuil}</b>
              <br />
              Ingreso:{" "}
              <b className="text-foreground">
                {emp.fechaIngreso ? String(emp.fechaIngreso).slice(0, 10) : "—"}
              </b>
              <br />
              Área: <b className="text-foreground">{emp?.area?.nombre || "—"}</b>
              <br />
              Sector: <b className="text-foreground">{emp?.sector?.nombre || "—"}</b>
            </div>
          </aside>

          {/* Col 2-3: Contenido por pestaña */}
          <section className="lg:col-span-2 space-y-6">
            {/* Informacion basica */}
            {tab === "Informacion basica" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4 space-y-3">
                <h3 className="text-sm font-semibold mb-2">Información básica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Nombre" value={emp.nombre} />
                  <Field label="Apellido" value={emp.apellido} />
                  <Field label="Email" value={emp.email || "—"} />
                  <Field label="Celular" value={emp.celular || "—"} />
                  <Field label="Domicilio" value={emp.domicilio || "—"} />
                  <Field label="Categoría" value={emp.categoria || "—"} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  La edición rápida sigue en la lista principal (botón “Editar”).
                </p>
              </div>
            )}

            {/* Datos laborales */}
            {tab === "Datos laborales" && (
              <>
                {/* Estado laboral */}
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Estado laboral</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      disabled={!isRRHH}
                      className="rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={estadoLaboral}
                      onChange={(e) => setEstadoLaboral(e.target.value)}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="SUSPENDIDO">SUSPENDIDO</option>
                      <option value="DESVINCULADO">DESVINCULADO</option>
                    </select>
                    <button
                      disabled={!isRRHH}
                      onClick={onGuardarEstado}
                      className="rounded-md px-3 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Guardar estado
                    </button>
                  </div>
                </div>

                {/* Sueldo */}
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Sueldo base</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <FieldInput
                      label="Monto"
                      type="number"
                      value={sueldo.monto}
                      onChange={(v) => setSueldo((s) => ({ ...s, monto: v }))}
                      disabled={!isRRHH}
                    />
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Moneda</div>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                        value={sueldo.moneda}
                        onChange={(e) =>
                          setSueldo((s) => ({ ...s, moneda: e.target.value }))
                        }
                        disabled={!isRRHH}
                      >
                        <option>ARS</option>
                        <option>USD</option>
                      </select>
                    </div>
                    <FieldInput
                      label="Vigente desde"
                      type="date"
                      value={sueldo.vigenteDesde}
                      onChange={(v) => setSueldo((s) => ({ ...s, vigenteDesde: v }))}
                      disabled={!isRRHH}
                    />
                    <div className="flex items-end">
                      <button
                        disabled={!isRRHH}
                        onClick={onGuardarSueldo}
                        className="w-full rounded-md px-3 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Actualizar sueldo
                      </button>
                    </div>
                  </div>

                  {/* Histórico */}
                  <div className="mt-4">
                    <div className="text-[11px] text-muted-foreground mb-1">Histórico</div>
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                            <th className="text-left px-3 py-2">Desde</th>
                            <th className="text-left px-3 py-2">Hasta</th>
                            <th className="text-left px-3 py-2">Monto</th>
                            <th className="text-left px-3 py-2">Moneda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historico.length ? (
                            historico.map((h, i) => (
                              <tr
                                key={i}
                                className="border-t border-border/50 odd:bg-background even:bg-muted/20"
                              >
                                <td className="px-3 py-2">
                                  {h?.desde ? String(h.desde).slice(0, 10) : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {h?.hasta ? String(h.hasta).slice(0, 10) : "—"}
                                </td>
                                <td className="px-3 py-2">{h?.monto ?? "—"}</td>
                                <td className="px-3 py-2">{h?.moneda ?? "—"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                className="px-3 py-2 text-sm text-muted-foreground"
                                colSpan={4}
                              >
                                Sin registros previos.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Carrera (placeholder para historial de puestos) */}
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                  <h3 className="text-sm font-semibold mb-2">Carrera / Historial de puestos</h3>
                  <p className="text-sm text-muted-foreground">
                    Próximo: registrar períodos “desde/hasta” por puesto. (endpoints sugeridos:{" "}
                    <code>GET/POST /empleados/:id/carrera</code>)
                  </p>
                </div>
              </>
            )}

            {/* Capacitaciones */}
            {tab === "Capacitaciones" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                <h3 className="text-sm font-semibold mb-2">Capacitaciones</h3>
                <p className="text-sm text-muted-foreground">
                  Listado de cursos, horas, certificaciones, vencimientos.
                  (endpoints sugeridos: <code>GET/POST /empleados/:id/capacitaciones</code>)
                </p>
              </div>
            )}

            {/* Documentos */}
            {tab === "Documentos" && (
              <div className="rounded-xl bg-card ring-1 ring-border/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">CV del empleado</h3>
                  {emp?.cvUrl && (
                    <a
                      href={`/${emp.cvUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      Ver CV actual
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                    disabled={!isRRHH}
                  />
                  <button
                    disabled={!isRRHH}
                    onClick={onSubirCV}
                    className="rounded-md px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Subir CV
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Formatos: PDF, DOC, DOCX. Máx 5 MB.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
