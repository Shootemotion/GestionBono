// src/pages/EvaluacionFlujo.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import TraceabilityCard from "@/components/seguimiento/TraceabilityCard";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { evaluarCumple, calcularResultadoGlobal } from "@/lib/evaluarCumple";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { dashEmpleado } from "@/lib/dashboard";

const ESTADOS = [
  {
    code: "NO_ENVIADOS",
    label: "No enviados",
    color: "bg-slate-100 text-slate-700",
    ring: "ring-slate-300",
  },
  {
    code: "PENDING_EMPLOYEE",
    label: "Enviados",
    color: "bg-amber-100 text-amber-800",
    ring: "ring-amber-300",
  },
  {
    code: "PENDING_HR",
    label: "En RRHH",
    color: "bg-blue-100 text-blue-800",
    ring: "ring-blue-300",
  },
  {
    code: "CLOSED",
    label: "Cerrados",
    color: "bg-emerald-100 text-emerald-800",
    ring: "ring-emerald-300",
  },
];

const ProgressBar = ({ value = 0 }) => (
  <div className="w-full h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
    <div
      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-[width] duration-300"
      style={{
        width: `${Math.max(0, Math.min(100, Math.round(value)))}%`,
      }}
    />
  </div>
);

function buildResumenEmpleado(data) {
  if (!data) return null;

  let objetivos = [];
  let aptitudes = [];

  if (Array.isArray(data.objetivos)) {
    objetivos = data.objetivos;
  } else if (Array.isArray(data.objetivos?.items)) {
    objetivos = data.objetivos.items;
  }

  if (Array.isArray(data.aptitudes)) {
    aptitudes = data.aptitudes;
  } else if (Array.isArray(data.aptitudes?.items)) {
    aptitudes = data.aptitudes.items;
  }

  const pesos = objetivos.map((o) => Number(o.peso ?? o.pesoBase ?? 0));
  const prog = objetivos.map((o) => Number(o.progreso ?? 0));
  const totalPeso = pesos.reduce((a, b) => a + b, 0) || 0;

  const scoreObj =
    totalPeso > 0
      ? pesos.reduce((acc, p, i) => acc + p * (prog[i] || 0), 0) / totalPeso
      : prog.length
      ? prog.reduce((a, b) => a + b, 0) / prog.length
      : 0;

  const punt = aptitudes.map((a) => Number(a.puntuacion ?? a.score ?? 0));
  const scoreApt = punt.length
    ? punt.reduce((a, b) => a + b, 0) / punt.length
    : 0;

  const global = (scoreObj + scoreApt) / 2;

  return {
    objetivos: { cantidad: objetivos.length, peso: totalPeso, score: scoreObj },
    aptitudes: { cantidad: aptitudes.length, score: scoreApt },
    global,
  };
}

// --- deduplicador robusto por _id o (nombre+unidad) ---
function dedupeMetas(arr = []) {
  const seen = new Set();
  const out = [];
  for (const m of arr) {
    const key = m?._id ? `id:${m._id}` : `nu:${m?.nombre}__${m?.unidad}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function deepCloneMetas(metas = []) {
  const cloned = metas.map((m) => ({
    _id: m._id,
    nombre: m.nombre,
    esperado: m.esperado,
    unidad: m.unidad,
    operador: m.operador || ">=",
    resultado: m.resultado ?? null,
    cumple: !!m.cumple && m.resultado != null ? !!m.cumple : false,
    peso: m.peso ?? m.pesoBase ?? null,
  }));
  return dedupeMetas(cloned);
}

export default function EvaluacionFlujo() {
  const { plantillaId, periodo, empleadoId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ===== Roles y acceso =====
  const esReferente = Boolean(
    (Array.isArray(user?.referenteAreas) && user.referenteAreas.length > 0) ||
      (Array.isArray(user?.referenteSectors) && user.referenteSectors.length > 0)
  );
  const esDirector = user?.rol === "directivo" || user?.isRRHH === true;
  const esSuperAdmin = user?.rol === "superadmin";
  const esVisor = user?.rol === "visor";
  const puedeVer = esReferente || esDirector || esSuperAdmin || esVisor;

  // ===== Estado =====
  const [anio] = useState(
    state?.anio ??
      Number(String(periodo || new Date().getFullYear()).slice(0, 4))
  );
  const [itemSeleccionado, setItemSeleccionado] = useState(
    state?.itemSeleccionado ?? null
  );
  const [empleadosDelItem, setEmpleadosDelItem] = useState(
    state?.empleadosDelItem ?? []
  );
  const [localHito, setLocalHito] = useState(
    state?.hito
      ? {
          periodo: state.hito.periodo,
          fecha: state.hito.fecha,
          metas: deepCloneMetas(state.hito.metas ?? []),
          estado: "MANAGER_DRAFT",
          actual: state.hito.actual ?? null,
          comentario: state.hito.comentario ?? "",
          escala: state.hito.escala ?? null,
        }
      : null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState(
    empleadoId
      ? empleadoId
      : state?.empleadosDelItem?.[0]?._id
      ? state.empleadosDelItem[0]._id
      : null
  );
  const [comentarioManager, setComentarioManager] = useState("");
  const [empleadosEstados, setEmpleadosEstados] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tabEstado, setTabEstado] = useState("NO_ENVIADOS");
  const [dashEmpleadoData, setDashEmpleadoData] = useState(null);

  const isAptitud =
    itemSeleccionado?._tipo === "aptitud" ||
    itemSeleccionado?.tipo === "aptitud";
  const scaleToPercent = (v) => (v ? v * 20 : null);
  const editable =
    localHito?.estado === "MANAGER_DRAFT" || !localHito?.estado;

  function buildBlankLocalHito(basePlantilla, periodoStr) {
    const baseMetas = Array.isArray(basePlantilla?.metas)
      ? basePlantilla.metas
      : [];
    return {
      periodo: periodoStr,
      fecha: null,
      estado: "MANAGER_DRAFT",
      metas: dedupeMetas(
        deepCloneMetas(baseMetas).map((m) => ({
          ...m,
          resultado: null,
          cumple: false,
        }))
      ),
      actual: null,
      comentario: "",
      escala: null,
    };
  }

  function hydrateFromEmpEval(empEval) {
    if (!empEval) return;

    const metas = dedupeMetas(
      Array.isArray(empEval.metasResultados) &&
        empEval.metasResultados.length > 0
        ? deepCloneMetas(empEval.metasResultados)
        : deepCloneMetas(itemSeleccionado?.metas ?? [])
    );

    setLocalHito({
      periodo,
      fecha: empEval.fecha ?? null,
      estado: empEval.estado ?? "MANAGER_DRAFT",
      metas,
      actual:
        empEval.actual ??
        (metas.length ? calcularResultadoGlobal(metas) : null),
      comentario: empEval.comentario ?? "",
      escala: empEval.escala ?? null,
    });
    setComentarioManager(empEval.comentarioManager ?? "");
  }

  function resetToBlank() {
    setLocalHito(buildBlankLocalHito(itemSeleccionado, periodo));
    setComentarioManager("");
  }

  // ===== Fallback fetch si falta data por deep-link =====
  useEffect(() => {
    (async () => {
      if (!puedeVer) return;
      try {
        if (!itemSeleccionado && plantillaId) {
          const p = await api(`/plantillas/${plantillaId}`);
          setItemSeleccionado(p);
        }
        if (!localHito && itemSeleccionado) {
          setLocalHito(buildBlankLocalHito(itemSeleccionado, periodo));
        }
        if (empleadosDelItem.length === 0 && empleadoId) {
          const emp = await api(`/empleados/${empleadoId}`);
          setEmpleadosDelItem([emp]);
        }
      } catch (e) {
        console.error(e);
        toast.error("No se pudo cargar la evaluación");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer, plantillaId, periodo, empleadoId, itemSeleccionado]);

  // Recalcula “actual” cuando hay metas (objetivos)
  useEffect(() => {
    if (!isAptitud && localHito?.metas?.length) {
      const global = calcularResultadoGlobal(localHito.metas);
      setLocalHito((prev) => ({ ...prev, actual: global }));
    }
  }, [isAptitud, localHito?.metas]);

  // Merge estados existentes
  const fetchEstados = async () => {
    if (
      !itemSeleccionado ||
      !localHito?.periodo ||
      (empleadosDelItem || []).length === 0
    )
      return;
    try {
      const evals = await api(
        `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}`
      );
      const merged = (empleadosDelItem || []).map((emp) => {
        const ev = evals.find(
          (e) => String(e.empleado) === String(emp._id)
        );
        return {
          ...emp,
          estado: ev?.estado || "NO_ENVIADOS",
          actual: ev?.actual ?? null,
          escala: ev?.escala ?? null,
          comentario: ev?.comentario ?? "",
          comentarioManager: ev?.comentarioManager ?? "",
          metasResultados: ev?.metasResultados ?? [],
          evaluacionId: ev?._id || null,
        };
      });
      setEmpleadosEstados(merged);

      if (selectedEmpleadoId) {
        const empEval = merged.find(
          (e) => String(e._id) === String(selectedEmpleadoId)
        );
        if (empEval?.evaluacionId) {
          hydrateFromEmpEval(empEval);
        } else {
          resetToBlank();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEstados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSeleccionado, localHito?.periodo, empleadosDelItem]);

  // Si llegaron empleados y no hay seleccionado, seleccionar el primero
  useEffect(() => {
    if (
      !selectedEmpleadoId &&
      Array.isArray(empleadosDelItem) &&
      empleadosDelItem.length > 0
    ) {
      setSelectedEmpleadoId(empleadosDelItem[0]._id);
    }
  }, [empleadosDelItem, selectedEmpleadoId]);

  // Cuando cambia el empleado seleccionado, rehidratar
  useEffect(() => {
    if (!selectedEmpleadoId) return;
    const empEval = empleadosEstados.find(
      (e) => String(e._id) === String(selectedEmpleadoId)
    );
    if (empEval?.evaluacionId) {
      hydrateFromEmpEval(empEval);
    } else if (itemSeleccionado) {
      resetToBlank();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpleadoId, empleadosEstados]);

  // Dashboard del empleado (modo MiDesempeño, pero visto por el jefe)
  useEffect(() => {
    (async () => {
      if (!selectedEmpleadoId) {
        setDashEmpleadoData(null);
        return;
      }
      try {
        const res = await dashEmpleado(selectedEmpleadoId, anio);
        if (!res) {
          setDashEmpleadoData(null);
          return;
        }
        const normalized = { ...res };
        if (
          normalized.objetivos?.items &&
          !Array.isArray(normalized.objetivos)
        ) {
          normalized.objetivos = normalized.objetivos.items;
        }
        if (
          normalized.aptitudes?.items &&
          !Array.isArray(normalized.aptitudes)
        ) {
          normalized.aptitudes = normalized.aptitudes.items;
        }
        setDashEmpleadoData(normalized);
      } catch (e) {
        console.error("dashEmpleado error:", e);
        setDashEmpleadoData(null);
      }
    })();
  }, [selectedEmpleadoId, anio]);

  // Cambios de tab de estado
  useEffect(() => {
    const inTab = empleadosEstados.filter((e) => e.estado === tabEstado);
    const currentIsInTab = inTab.some(
      (e) => String(e._id) === String(selectedEmpleadoId)
    );
    if (!currentIsInTab) {
      const first = inTab[0];
      if (first) {
        setSelectedEmpleadoId(first._id);
      } else {
        setSelectedEmpleadoId(null);
        if (itemSeleccionado) resetToBlank();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabEstado, empleadosEstados]);

  if (!puedeVer) {
    return (
      <div className="container-app p-6">
        <div className="max-w-3xl mx-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6 text-center">
          <h2 className="text-lg font-semibold mb-1">Acceso restringido</h2>
          <p className="text-sm text-slate-600">
            No tenés permisos para ver esta evaluación.
          </p>
        </div>
      </div>
    );
  }

  const countsPorEstado = useMemo(() => {
    const c = {
      NO_ENVIADOS: 0,
      PENDING_EMPLOYEE: 0,
      PENDING_HR: 0,
      CLOSED: 0,
    };
    for (const e of empleadosEstados) {
      c[e.estado] = (c[e.estado] || 0) + 1;
    }
    return c;
  }, [empleadosEstados]);

  const persistAndFlow = async (action) => {
    if (!itemSeleccionado || !localHito) return;

    if (!selectedEmpleadoId) {
      toast.error("Seleccioná un empleado.");
      return;
    }

    const isApt = isAptitud;
    let actualToSend = 0;

    if (isApt) {
      const escalaNum = Number(localHito?.escala ?? 0);
      if (!escalaNum || escalaNum < 1 || escalaNum > 5) {
        toast.error("Seleccioná una escala (1 a 5) antes de enviar.");
        return;
      }
      actualToSend = Number((escalaNum * 20).toFixed(1));
    } else {
      const raw = calcularResultadoGlobal(localHito.metas ?? []);
      actualToSend = Number.isFinite(raw) ? Number(raw.toFixed(1)) : 0;
    }

    setLocalHito((prev) => ({ ...prev, actual: actualToSend }));

    try {
      setSaving(true);

      const body = {
        empleado: selectedEmpleadoId,
        plantillaId: itemSeleccionado._id,
        year: Number(
          String(localHito?.periodo || "").slice(0, 4)
        ),
        periodo: localHito.periodo,
        actual: actualToSend,
        comentario: localHito.comentario ?? "",
        comentarioManager: comentarioManager ?? "",
        ...(isApt
          ? { escala: Number(localHito?.escala ?? 0), metasResultados: [] }
          : {
              metasResultados: Array.isArray(localHito.metas)
                ? dedupeMetas(localHito.metas)
                : [],
            }),
        estado: "MANAGER_DRAFT",
      };

      await api("/evaluaciones", { method: "POST", body });
      await api(
        `/evaluaciones/${selectedEmpleadoId}/${itemSeleccionado._id}/${localHito.periodo}`,
        { method: "PUT", body }
      );

      if (action === "toEmployee") {
        const evals = await api(
          `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}`
        );
        const target = evals.find(
          (e) => String(e.empleado) === String(selectedEmpleadoId)
        );
        if (target) {
          if (target.estado !== "MANAGER_DRAFT") {
            await api(`/evaluaciones/${target._id}/reopen`, {
              method: "POST",
            });
          }
          await api(
            `/evaluaciones/${target._id}/submit-to-employee`,
            { method: "POST" }
          );
        }
        toast.success("Enviado al empleado");
        await fetchEstados();
        setTabEstado("PENDING_EMPLOYEE");
      } else if (action === "draft") {
        toast.success("Borrador guardado");
        await fetchEstados();
      }
    } catch (e) {
      console.error(e);
      const msg = e?.message || "Error procesando la evaluación";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({ children }) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-slate-200 bg-slate-50">
      {children}
    </span>
  );

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate("/seguimiento");
              }}
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted"
            >
              ← Volver
            </button>
            <div>
              <h1 className="text-lg font-semibold">
                {itemSeleccionado?.nombre ?? "Evaluación"} — {periodo}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Chip>{isAptitud ? "Aptitud" : "Objetivo"}</Chip>
                {itemSeleccionado?.fechaLimite && (
                  <Chip>
                    Vence: {itemSeleccionado.fechaLimite.slice(0, 10)}
                  </Chip>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-primary mr-2">
              {localHito?.actual != null
                ? `${Number(localHito.actual).toFixed(1)}%`
                : "—"}
            </div>
            <Button
              variant="outline"
              onClick={() => persistAndFlow("draft")}
              disabled={saving}
            >
              Guardar borrador
            </Button>

            <Button
              disabled={saving}
              onClick={() => setConfirmOpen(true)}
            >
              Enviar al empleado
            </Button>
            <AlertDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
            >
              <AlertDialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:max-w-md sm:rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    ¿Confirmás el envío?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Una vez enviado, el empleado podrá ver la evaluación y
                    continuar con su parte del flujo. No podrás modificar
                    las metas ni los valores. ¿Querés continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setConfirmOpen(false);
                      persistAndFlow("toEmployee");
                    }}
                  >
                    Sí, enviar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* GRID 3 columnas */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* IZQUIERDA (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Detalle */}
          {itemSeleccionado && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="font-medium">Detalle</h3>
              <p className="text-sm text-slate-600 mt-1">
                {itemSeleccionado?.descripcion ?? "Sin descripción"}
              </p>
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                {(itemSeleccionado?.pesoBase != null ||
                  itemSeleccionado?.peso != null) && (
                  <div className="rounded-md border p-3 bg-slate-50">
                    <span className="text-xs text-slate-500">Peso</span>
                    <div className="font-semibold">
                      {itemSeleccionado?.pesoBase ??
                        itemSeleccionado?.peso}
                      %
                    </div>
                  </div>
                )}
                <div className="rounded-md border p-3 bg-slate-50">
                  <span className="text-xs text-slate-500">Periodo</span>
                  <div className="font-semibold">{periodo}</div>
                </div>
              </div>
            </div>
          )}

          {/* Lista empleados por estado */}
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2 mb-3">
              {ESTADOS.map((s) => (
                <button
                  key={s.code}
                  onClick={() => setTabEstado(s.code)}
                  className={`px-3 py-1.5 rounded-md text-sm ring-1 transition ${
                    tabEstado === s.code
                      ? `bg-white ring-2 ${s.ring} shadow-sm`
                      : "bg-slate-50 hover:bg-slate-100 ring-slate-200"
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-2 ${s.color.replace(
                      "bg-",
                      "text-"
                    )}`}
                  >
                    {s.label}
                    <span
                      className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[11px] ${s.color}`}
                    >
                      {countsPorEstado[s.code] || 0}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[56vh] overflow-y-auto pr-1">
              {empleadosEstados
                .filter((e) => e.estado === tabEstado)
                .map((emp) => {
                  const selected =
                    String(emp._id) === String(selectedEmpleadoId);
                  return (
                    <div
                      key={emp._id}
                      onClick={() => setSelectedEmpleadoId(emp._id)}
                      className={`cursor-pointer rounded-lg border p-3 transition shadow-sm ${
                        selected
                          ? "bg-white ring-2 ring-primary/50 shadow"
                          : "bg-slate-50 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          {emp.apellido}, {emp.nombre}
                        </div>
                        {emp.actual != null && (
                          <div className="text-xs font-semibold text-primary">
                            {emp.actual.toFixed(1)}%
                          </div>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 italic">
                          {
                            ESTADOS.find(
                              (s) => s.code === emp.estado
                            )?.label
                          }
                        </span>
                      </div>
                    </div>
                  );
                })}
              {empleadosEstados.filter((e) => e.estado === tabEstado)
                .length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No hay empleados en este estado.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* CENTRO (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Comentarios */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="font-medium mb-3">📝 Comentarios</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Comentario del período (para historial)
                </label>
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                  value={localHito?.comentario ?? ""}
                  disabled={!editable}
                  onChange={(e) =>
                    setLocalHito((p) => ({
                      ...p,
                      comentario: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Comentario del manager (para empleado)
                </label>
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                  placeholder="Este comentario se verá al enviar al empleado / RRHH"
                  value={comentarioManager ?? ""}
                  onChange={(e) => setComentarioManager(e.target.value)}
                  disabled={!editable}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Metas */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="font-medium mb-3">🎯 Metas</h3>
            {isAptitud ? (
              <div className="grid gap-3">
                <div className="border rounded-md p-3 bg-background shadow-sm">
                  <label className="text-xs text-muted-foreground">
                    Escala de evaluación
                  </label>
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                    disabled={!editable}
                    value={localHito?.escala ?? ""}
                    onChange={(e) =>
                      setLocalHito((prev) => ({
                        ...prev,
                        escala: Number(e.target.value || 0),
                        actual: scaleToPercent(
                          Number(e.target.value || 0)
                        ),
                      }))
                    }
                  >
                    <option value="">Seleccionar…</option>
                    <option value={1}>
                      1 - Insatisfactorio / No cumple
                    </option>
                    <option value={2}>
                      2 - Necesita mejorar / A veces cumple
                    </option>
                    <option value={3}>
                      3 - Cumple con las expectativas
                    </option>
                    <option value={4}>
                      4 - Supera las expectativas
                    </option>
                    <option value={5}>5 - Sobresaliente</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Resultado global:{" "}
                    <b>
                      {localHito?.escala
                        ? `${scaleToPercent(
                            localHito.escala
                          )}%`
                        : "—"}
                    </b>
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {dedupeMetas(localHito?.metas || []).map(
                  (m, idx) => (
                    <div
                      key={`${m._id ?? m.nombre}-${idx}`}
                      className="border rounded-md p-3 bg-background shadow-sm"
                    >
                      <p className="text-sm font-semibold">
                        {m.nombre}
                      </p>
                      <p className="text-xs text-gray-500">
                        Esperado: {m.operador || ">="} {m.esperado}{" "}
                        {m.unidad}
                      </p>

                      {m.unidad === "Cumple/No Cumple" ? (
                        <label className="flex items-center gap-2 mt-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!m.resultado}
                            disabled={!editable}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setLocalHito((prev) => {
                                const metas = dedupeMetas([
                                  ...(prev.metas || []),
                                ]);
                                metas[idx] = {
                                  ...metas[idx],
                                  resultado: val,
                                  cumple: val,
                                };
                                return { ...prev, metas };
                              });
                            }}
                          />
                          Cumplido
                        </label>
                      ) : (
                        <>
                          <input
                            type="number"
                            className="w-full rounded-md border px-2 py-1 text-sm mt-2 focus:ring-2 focus:ring-primary/40 outline-none"
                            placeholder="Resultado alcanzado"
                            value={m.resultado ?? ""}
                            disabled={!editable}
                            onChange={(e) => {
                              const valor =
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value);
                              setLocalHito((prev) => {
                                const metas = dedupeMetas([
                                  ...(prev.metas || []),
                                ]);
                                metas[idx] = {
                                  ...metas[idx],
                                  resultado: valor,
                                  cumple: evaluarCumple(
                                    valor,
                                    metas[idx].esperado,
                                    metas[idx].operador,
                                    metas[idx].unidad
                                  ),
                                };
                                return { ...prev, metas };
                              });
                            }}
                          />
                          {m.resultado !== null &&
                            m.resultado !== undefined && (
                              <p
                                className={`text-xs mt-1 font-medium ${
                                  evaluarCumple(
                                    m.resultado,
                                    m.esperado,
                                    m.operador,
                                    m.unidad
                                  )
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {evaluarCumple(
                                  m.resultado,
                                  m.esperado,
                                  m.operador,
                                  m.unidad
                                )
                                  ? "✔ Cumplido"
                                  : "✘ No cumplido"}
                              </p>
                            )}
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* DERECHA (lg:col-span-3) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Resumen global del empleado (mini MiDesempeño) */}
          {selectedEmpleadoId &&
            dashEmpleadoData &&
            (() => {
              const resumen = buildResumenEmpleado(dashEmpleadoData);
              if (!resumen) return null;
              return (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500 mb-1">
                    Resultado anual del empleado
                  </div>
                  <div className="text-lg font-semibold mb-2">
                    Global: {Math.round(resumen.global)}%
                  </div>
                  <ProgressBar value={resumen.global} />
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <div className="flex justify-between mb-1 text-xs text-slate-500">
                        <span>🎯 Objetivos</span>
                        <span>
                          {Math.round(
                            resumen.objetivos.score
                          )}
                          %{" "}
                          {resumen.objetivos.peso
                            ? `(peso total ${resumen.objetivos.peso}%)`
                            : ""}
                        </span>
                      </div>
                      <ProgressBar value={resumen.objetivos.score} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1 text-xs text-slate-500">
                        <span>💡 Aptitudes</span>
                        <span>
                          {Math.round(
                            resumen.aptitudes.score
                          )}
                          %
                        </span>
                      </div>
                      <ProgressBar value={resumen.aptitudes.score} />
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Trazabilidad del ítem actual */}
          {itemSeleccionado && (
            <TraceabilityCard
              objetivo={itemSeleccionado}
              trazabilidad={[
                {
                  estado:
                    localHito?.estado?.toLowerCase() || "borrador",
                  fecha: localHito?.fecha,
                  usuario: "Jefe X",
                },
                ...(localHito?.comentario
                  ? [
                      {
                        estado: "feedback",
                        fecha: new Date(),
                        comentario: localHito.comentario,
                      },
                    ]
                  : []),
              ]}
              resultadoGlobal={localHito?.actual}
            />
          )}
        </div>
      </div>
    </div>
  );
}
