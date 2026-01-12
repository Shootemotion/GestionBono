import { useEffect, useMemo, useState } from "react";
import {
  listEvaluaciones,
  ensureDraft,
  submitToEmployee,
  employeeAck,
  employeeContest,
  submitToHR,
  closeEvaluacion,
  reopenEvaluacion,
  getEvaluacion,
} from "@/lib/evaluaciones";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EstadoBadge = ({ estado }) => {
  const map = {
    MANAGER_DRAFT: { cls: "bg-amber-100 text-amber-700 ring-amber-200", label: "Borrador de jefe" },
    PENDING_EMPLOYEE: { cls: "bg-indigo-100 text-indigo-700 ring-indigo-200", label: "Pendiente del empleado" },
    PENDING_HR: { cls: "bg-blue-100 text-blue-700 ring-blue-200", label: "Pendiente RRHH" },
    CLOSED: { cls: "bg-emerald-100 text-emerald-700 ring-emerald-200", label: "Cerrada" },
  };
  const meta = map[estado] || { cls: "bg-muted text-foreground ring-border/60", label: estado || "—" };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs ring-1 ${meta.cls}`}>
      {meta.label}
    </span>
  );
};

export default function EvaluacionFlow({
  empleadoId,
  plantilla,
  year,
  defaultPeriodo,
  user,
}) {
  const [loading, setLoading] = useState(false);
  const [ev, setEv] = useState(null);
  const [contestText, setContestText] = useState("");

  const periodo = defaultPeriodo || `${year}ANUAL`;

  const roles = useMemo(() => ({
    manager: user?.isJefeSector || user?.isJefeArea || user?.isDirectivo || user?.isRRHH || user?.isSuper,
    employee: true,
    hr: user?.isRRHH || user?.isSuper,
  }), [user]);

  const can = useMemo(() => {
    const estado = ev?.estado;
    return {
      submitToEmployee: roles.manager && estado === "MANAGER_DRAFT",
      employeeAck: roles.employee && estado === "PENDING_EMPLOYEE",
      employeeContest: roles.employee && estado === "PENDING_EMPLOYEE",
      submitToHR: roles.manager && estado === "PENDING_EMPLOYEE",
      close: roles.hr && estado === "PENDING_HR",
      reopen: roles.hr && estado === "CLOSED",
    };
  }, [ev?.estado, roles]);

  const reload = async () => {
    if (!empleadoId || !plantilla?._id) return;
    setLoading(true);
    try {
      const list = await listEvaluaciones({
        empleado: empleadoId,
        year,
        plantillaId: plantilla._id,
        periodo,
      });
      if (Array.isArray(list) && list.length) {
        setEv(list[0]);
      } else {
        // ✅ ahora usamos ensureDraft en vez de createEvaluacion
        const created = await ensureDraft({
          empleadoId,
          plantillaId: plantilla._id,
          year,
          periodo: periodo || `${year}ANUAL`,
        });
        setEv(created);
      }
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cargar la evaluación");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [empleadoId, plantilla?._id, year, periodo]);

  const run = async (fn, okMsg) => {
    try {
      setLoading(true);
      await fn(ev._id, contestText);
      const fresh = await getEvaluacion(ev._id);
      setEv(fresh);
      toast.success(okMsg);
    } catch (e) {
      console.error(e);
      toast.error("Operación no disponible");
    } finally {
      setLoading(false);
    }
  };

  if (!plantilla) return null;

  return (
    <div className="rounded-xl border bg-card ring-1 ring-border/60">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <EstadoBadge estado={ev?.estado} />
          <span className="text-xs text-muted-foreground">Periodo: <b>{periodo}</b></span>
        </div>
        <div className="flex items-center gap-2">
          {can.reopen && (
            <Button size="sm" variant="outline" onClick={() => run(reopenEvaluacion, "Reabierta")}>
              Reabrir
            </Button>
          )}
          {can.close && (
            <Button size="sm" onClick={() => run(closeEvaluacion, "Cerrada")}>
              Cerrar
            </Button>
          )}
          {can.submitToHR && (
            <Button size="sm" onClick={() => run(submitToHR, "Enviado a RRHH")}>
              Enviar a RRHH
            </Button>
          )}
          {can.submitToEmployee && (
            <Button size="sm" onClick={() => run(submitToEmployee, "Enviado al empleado")}>
              Enviar al empleado
            </Button>
          )}
          {can.employeeAck && (
            <Button size="sm" onClick={() => run(employeeAck, "Acuse registrado")}>
              Acepto
            </Button>
          )}
        </div>
      </div>

      {can.employeeContest && (
        <div className="p-3 border-b">
          <label className="text-xs text-muted-foreground">Comentario / Descargo</label>
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            rows={3}
            placeholder="Escribí tu comentario si no estás de acuerdo…"
            value={contestText}
            onChange={(e) => setContestText(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!contestText.trim() || loading}
              onClick={() => run((id) => employeeContest(id, contestText.trim()), "Contestación enviada")}
            >
              No estoy de acuerdo
            </Button>
          </div>
        </div>
      )}

      <div className="p-3 grid md:grid-cols-3 gap-3">
        <div className="rounded-md bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground mb-1">Comentario del jefe</div>
          <div className="text-sm">{ev?.comentarioManager || ev?.comentario || "—"}</div>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground mb-1">Comentario del empleado</div>
          <div className="text-sm">{ev?.comentarioEmpleado || "—"}</div>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground mb-1">Comentario RRHH</div>
          <div className="text-sm">{ev?.comentarioRRHH || "—"}</div>
        </div>
      </div>
    </div>
  );
}
