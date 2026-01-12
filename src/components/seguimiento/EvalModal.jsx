// src/components/EvalModal.jsx
import Modal from "@/components/Modal.jsx";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import TraceabilityCard from "@/components/seguimiento/TraceabilityCard.jsx";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { evaluarCumple, calcularResultadoGlobal } from "@/lib/evaluarCumple";

export default function EvalModal({
  isOpen,
  onClose,
  itemSeleccionado,
  localHito,
  setLocalHito,
  empleadosDelItem,
  applyToAll,
  setApplyToAll,
  selectedEmpleados,
  setSelectedEmpleados,
  comentarioManager,
  setComentarioManager,
  anio,
  evalActual,
  empleadoId,
}) {
  const [tab, setTab] = useState("detalle");
  const [saving, setSaving] = useState(false);
  const [empleadosEstados, setEmpleadosEstados] = useState([]);
  const [estadoTab, setEstadoTab] = useState("NO_ENVIADOS");
  const isAptitud = (itemSeleccionado?._tipo === "aptitud") || (itemSeleccionado?.tipo === "aptitud");
  const scaleOptions = [
    { value: 1, label: "1 - Insatisfactorio / No cumple" },
    { value: 2, label: "2 - Necesita mejorar / A veces cumple" },
    { value: 3, label: "3 - Cumple con las expectativas" },
    { value: 4, label: "4 - Supera las expectativas" },
    { value: 5, label: "5 - Sobresaliente" },
  ];
  const scaleToPercent = (v) => (v ? v * 20 : null);
  const editable = localHito?.estado === "MANAGER_DRAFT" || !localHito?.estado;

  // 🔹 recalcular automáticamente resultado global (SOLO objetivos con metas)
  useEffect(() => {
    if (!isAptitud && localHito?.metas && localHito.metas.length > 0) {
      const global = calcularResultadoGlobal(localHito.metas);
      setLocalHito((prev) => ({ ...prev, actual: global }));
    }
  }, [isAptitud, localHito?.metas, setLocalHito]);

  // 🔹 merge empleados con evaluaciones existentes
  useEffect(() => {
    const fetchEstados = async () => {
      if (!itemSeleccionado || !localHito?.periodo) return;
      try {
        const evals = await api(
          `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}`
        );
        const merged = (empleadosDelItem || []).map((emp) => {
          const ev = evals.find((e) => String(e.empleado) === String(emp._id));
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
      } catch (err) {
        console.error("❌ Error mergeando empleados/evaluaciones:", err);
      }
    };
    fetchEstados();
  }, [itemSeleccionado, localHito?.periodo, empleadosDelItem]);
  // 🔹 refrescar metas y comentarios al seleccionar empleado
  useEffect(() => {
    if (selectedEmpleados.length === 1) {
      const empId = selectedEmpleados[0];
      const empEval = empleadosEstados.find((e) => e._id === empId);

      if (empEval && empEval.evaluacionId) {
        setLocalHito((prev) => ({
          ...prev,
          estado: empEval.estado,
          metas: empEval.metasResultados?.length ? empEval.metasResultados : prev.metas,
          comentario: empEval.comentario ?? "",
          actual: empEval.actual ?? prev.actual,
          escala: empEval.escala ?? prev.escala ?? null,
        }));
        setComentarioManager(empEval.comentarioManager ?? "");
      }
    } else {
      // No tiene evaluación previa → reset a borrador editable
      setLocalHito((prev) => ({
        ...prev,
        estado: "MANAGER_DRAFT",
        metas: itemSeleccionado?.metas || [],
        comentario: "",
        actual: null,
      }));
      setComentarioManager("");
    }
  }, [selectedEmpleados, empleadosEstados, itemSeleccionado]);






  const persistAndFlow = async (action) => {
    if (!itemSeleccionado || !localHito) return;

    // ¿Estoy evaluando una APTITUD?
    const isAptitud =
      (itemSeleccionado?._tipo === "aptitud") || (itemSeleccionado?.tipo === "aptitud");

    // ────────────────────────────────────────────────────────────────────────────
    // 1) Calcular 'actual'
    //    - Aptitud: escala (1..5) -> porcentaje (20..100)
    //    - Objetivo: desde metas
    // ────────────────────────────────────────────────────────────────────────────
    let actualToSend = 0;
    if (isAptitud) {
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

    console.debug(
      "[persistAndFlow]",
      { isAptitud, actualToSend, metas: localHito?.metas?.length ?? 0, escala: localHito?.escala }
    );

    setLocalHito((prev) => ({ ...prev, actual: actualToSend }));

    // ────────────────────────────────────────────────────────────────────────────
    // 2) Validaciones de selección
    // ────────────────────────────────────────────────────────────────────────────
    const empleados = applyToAll ? (empleadosDelItem || []).map((e) => e._id) : (selectedEmpleados || []);
    if (empleados.length === 0) {
      toast.error("⚠ Debes seleccionar al menos un empleado o usar 'Enviar a todos'");
      return;
    }

    try {
      setSaving(true);

      // ──────────────────────────────────────────────────────────────────────────
      // 3) Persistencia (POST + PUT) por empleado
      // ──────────────────────────────────────────────────────────────────────────
      for (const empId of empleados) {
        const baseBody = {
          empleado: empId,
          plantillaId: itemSeleccionado._id,
          year: Number(String(localHito?.periodo || "").slice(0, 4)),
          periodo: localHito.periodo,
          actual: actualToSend,
          comentario: localHito.comentario ?? "",
          comentarioManager: comentarioManager ?? "",
          ...(isAptitud
            ? { escala: Number(localHito?.escala ?? 0), metasResultados: [] }
            : { metasResultados: Array.isArray(localHito.metas) ? localHito.metas : [] }),
          estado: "MANAGER_DRAFT",
        };

        console.debug("[POST body]", baseBody);
        await api("/evaluaciones", { method: "POST", body: baseBody });

        console.debug("[PUT body]", baseBody);
        await api(
          `/evaluaciones/${empId}/${itemSeleccionado._id}/${localHito.periodo}`,
          { method: "PUT", body: baseBody }
        );
      }

      console.debug(">> actualToSend", actualToSend, "metas", localHito.metas);

      // ──────────────────────────────────────────────────────────────────────────
      // 4) Flujo (submit, RRHH, cerrar, borrador)
      // ──────────────────────────────────────────────────────────────────────────
      if (action === "toEmployee") {
        const evals = await api(
          `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}`
        );

        const targetEvals = evals.filter((e) =>
          applyToAll ? true : empleados.includes(String(e.empleado))
        );

        for (const ev of targetEvals) {
          await api(`/evaluaciones/${ev._id}/submit-to-employee`, { method: "POST" });
        }
        toast.success("Enviado al empleado(s)");
      } else if (action === "toHR") {
        if (empleados.length === 1) {
          const evals = await api(
            `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}&empleado=${empleados[0]}`
          );
          if (evals[0]) {
            await api(`/evaluaciones/${evals[0]._id}/submit-to-hr`, { method: "POST" });
          }
        }
        toast.success("Elevado a RRHH");
      } else if (action === "close") {
        if (empleados.length === 1) {
          const evals = await api(
            `/evaluaciones?plantillaId=${itemSeleccionado._id}&periodo=${localHito.periodo}&empleado=${empleados[0]}`
          );
          if (evals[0]) {
            await api(`/evaluaciones/${evals[0]._id}/close`, { method: "POST" });
          }
        }
        toast.success("Evaluación cerrada");
      } else if (action === "draft") {
        toast.success("Borrador guardado");
      }

      onClose();
    } catch (err) {
      console.error("persistAndFlow error", err);
      toast.error("Error procesando la evaluación");
    } finally {
      setSaving(false);
    }
  };


  // 🚫 Si algún seleccionado no está en NO_ENVIADOS => bloqueo
  const invalidSelection = selectedEmpleados.some((id) => {
    const emp = empleadosEstados.find((e) => e._id === id);
    return emp && emp.estado !== "NO_ENVIADOS";
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Evaluación del período">
      <div className="space-y-6">
        {console.debug("[Modal Render] actual en UI:", localHito?.actual, "metas:", localHito?.metas)}
        {/* Header con nombre + resultado global */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{itemSeleccionado?.nombre}</h2>
          <div className="text-2xl font-bold text-primary">
            {localHito?.actual != null ? `${localHito.actual.toFixed(1)}%` : "—"}
          </div>
        </div>

        {/* 🔹 Estado global / trazabilidad */}
        {itemSeleccionado && (
          <TraceabilityCard
            objetivo={itemSeleccionado}
            trazabilidad={[
              { estado: localHito?.estado?.toLowerCase() || "borrador", fecha: localHito?.fecha, usuario: "Jefe X" },
              ...(localHito?.comentario
                ? [{ estado: "feedback", fecha: new Date(), comentario: localHito.comentario }]
                : []),
            ]}
            resultadoGlobal={localHito?.actual}
          />
        )}

        {/* 🔹 Tabs de empleados por estado */}
        <div>
          <div className="flex gap-2 border-b pb-2 text-sm mb-2">
            {["NO_ENVIADOS", "PENDING_EMPLOYEE", "PENDING_HR", "CLOSED"].map((t) => (
              <button
                key={t}
                className={`px-3 py-1 rounded-md transition ${estadoTab === t
                    ? "bg-primary text-primary-foreground shadow"
                    : "hover:bg-muted"
                  }`}
                onClick={() => setEstadoTab(t)}
              >
                {t === "NO_ENVIADOS"
                  ? "No enviados"
                  : t === "PENDING_EMPLOYEE"
                    ? "Enviados"
                    : t === "PENDING_HR"
                      ? "En RRHH"
                      : "Cerrados"}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto border p-2 rounded">
            {empleadosEstados
              .filter((e) => e.estado === estadoTab)
              .map((emp) => (
                <label key={emp._id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEmpleados.includes(emp._id)}

                    onChange={(ev) => {
                      if (ev.target.checked) {
                        setSelectedEmpleados((prev) => [...prev, emp._id]);

                        // 🔹 Si ya tiene evaluación → hidratar todo el hito
                        if (emp.evaluacionId) {
                          setLocalHito((prev) => ({
                            ...prev,
                            metas: emp.metasResultados?.length > 0 ? emp.metasResultados : prev.metas,
                            comentario: emp.comentario ?? prev.comentario ?? "",
                            actual: emp.actual ?? prev.actual,
                            estado: emp.estado ?? prev.estado, // ahora se carga el flujo real
                          }));
                          if (emp.comentarioManager) {
                            setComentarioManager(emp.comentarioManager);
                          }
                        }





                      } else {
                        setSelectedEmpleados((prev) => prev.filter((id) => id !== emp._id));
                      }
                    }}




                  />

                  {emp.nombre} {emp.apellido} –{" "}
                  <span className="italic text-gray-500">{emp.estado}</span>
                  {emp.actual != null && (
                    <span className="ml-2 text-xs font-medium text-primary">
                      {emp.actual.toFixed(1)}%
                    </span>
                  )}

                </label>
              ))}
            {empleadosEstados.filter((e) => e.estado === estadoTab).length === 0 && (
              <p className="text-xs text-muted-foreground">No hay empleados en este estado.</p>
            )}
          </div>
        </div>

        {/* 🔹 Tabs: en aptitudes no mostramos "metas" */}
        <div className="flex gap-2 border-b pb-2 text-sm">
          {(isAptitud ? ["detalle", "flujo"] : ["detalle", "metas", "flujo"]).map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded-md transition ${tab === t ? "bg-primary text-primary-foreground shadow" : "hover:bg-muted"
                }`}
              onClick={() => setTab(t)}
            >
              {t === "detalle" ? "📄 Detalle" : t === "metas" ? "🎯 Metas" : "🔄 Flujo"}
            </button>
          ))}
        </div>

        {/* DETALLE */}
        {tab === "detalle" && (
          <div className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              <h4 className="font-semibold text-lg mb-1">{itemSeleccionado?.nombre ?? "—"}</h4>
              <p className="text-sm text-gray-600">{itemSeleccionado?.descripcion ?? "Sin descripción"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(itemSeleccionado?.pesoBase != null || itemSeleccionado?.peso != null) && (
                <div className="border rounded-md p-4 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Peso base</p>
                  <p className="font-medium">{itemSeleccionado?.pesoBase ?? itemSeleccionado?.peso}%</p>
                </div>
              )}
              <div className="border rounded-md p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground">Fecha límite</p>
                <p className="font-medium">
                  {itemSeleccionado?.fechaLimite ? itemSeleccionado.fechaLimite.slice(0, 10) : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* METAS (solo objetivos) */}
        {!isAptitud && tab === "metas" && (
          <div className="grid gap-3">
            {(localHito.metas || []).map((m, idx) => (
              <div key={`${m.nombre}-${idx}`} className="border rounded-md p-3 bg-background shadow-sm">
                <p className="text-sm font-semibold">{m.nombre}</p>
                <p className="text-xs text-gray-500">
                  Esperado: {m.operador || ">="} {m.esperado} {m.unidad}
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
                          const metas = [...(prev.metas || [])];
                          metas[idx] = { ...metas[idx], resultado: val, cumple: val };
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
                        const valor = e.target.value === "" ? null : Number(e.target.value);
                        setLocalHito((prev) => {
                          const metas = [...(prev.metas || [])];
                          metas[idx] = {
                            ...metas[idx],
                            resultado: valor,
                            cumple: evaluarCumple(valor, metas[idx].esperado, metas[idx].operador, metas[idx].unidad),
                          };
                          return { ...prev, metas };
                        });
                      }}
                    />
                    {m.resultado !== null && (
                      <p
                        className={`text-xs mt-1 font-medium ${evaluarCumple(m.resultado, m.esperado, m.operador, m.unidad)
                            ? "text-green-600"
                            : "text-red-600"
                          }`}
                      >
                        {evaluarCumple(m.resultado, m.esperado, m.operador, m.unidad)
                          ? "✔ Cumplido"
                          : "✘ No cumplido"}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {/* ESCALA (solo aptitudes) */}
        {isAptitud && tab === "detalle" && (
          <div className="grid gap-3">
            <div className="border rounded-md p-3 bg-background shadow-sm">
              <label className="text-xs text-muted-foreground">Escala de evaluación</label>
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                disabled={!editable}
                value={localHito?.escala ?? ""}
                onChange={(e) =>
                  setLocalHito((prev) => ({
                    ...prev,
                    escala: Number(e.target.value || 0),
                    actual: scaleToPercent(Number(e.target.value || 0)),
                  }))
                }
              >
                <option value="">Seleccionar…</option>
                {scaleOptions.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                Resultado global:{" "}
                <b>
                  {localHito?.escala ? `${scaleToPercent(localHito.escala)}%` : "—"}
                </b>
              </p>
            </div>
          </div>
        )}
        {/* FLUJO */}
        {tab === "flujo" && (
          <div className="space-y-4">
            <div className="border rounded-md p-4">
              <label className="text-sm font-medium">Comentario del período</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                value={localHito?.comentario ?? ""}
                disabled={!editable}
                onChange={(e) => setLocalHito((p) => ({ ...p, comentario: e.target.value }))}
              />
            </div>
            <div className="border rounded-md p-4">
              <label className="text-sm font-medium">Comentario del manager (flujo)</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                placeholder="Este comentario se verá al enviar al empleado / RRHH"
                value={comentarioManager ?? ""}
                onChange={(e) => setComentarioManager(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => persistAndFlow("draft")} disabled={saving}>
                Guardar borrador
              </Button>
              <Button
                onClick={() => {
                  if (invalidSelection) {
                    toast.error("⚠ No puedes reenviar a un empleado con flujo ya iniciado");
                    return;
                  }
                  persistAndFlow("toEmployee");
                }}
                disabled={saving || invalidSelection}
                className={`${invalidSelection ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
                  } text-white`}
              >
                Enviar al empleado
              </Button>
              <Button
                onClick={() => persistAndFlow("toHR")}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Elevar a RRHH
              </Button>
              <Button
                onClick={() => persistAndFlow("close")}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
