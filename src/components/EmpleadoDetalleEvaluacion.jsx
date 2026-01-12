import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import GanttEvaluaciones from "@/components/GanttEvaluaciones";

export default function EmpleadoDetalleEvaluacion({ empleado, onClose }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (plantillaId, payload) => {
    try {
      setSaving(true);
      await api(`/evaluaciones/${empleado.empleado._id}/${plantillaId}`, {
        method: "PUT",
        body: {
          year: new Date().getFullYear(),
          actual: payload.actual,
          escala: payload.escala,
          comentario: payload.comentario,
        },
      });
      toast.success("Evaluación guardada ✅");
    } catch (err) {
      console.error(err);
      toast.error("Error guardando evaluación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">
        Evaluaciones de {empleado.empleado.apellido}, {empleado.empleado.nombre}
      </h2>

      {/* 🔹 Diagrama de Gantt con objetivos y aptitudes */}
      <GanttEvaluaciones
        objetivos={Array.isArray(empleado.objetivos?.items) ? empleado.objetivos.items : []}
        aptitudes={Array.isArray(empleado.aptitudes?.items) ? empleado.aptitudes.items : []}
        onSelectHito={(plantilla) => {
          console.log("Seleccionado", plantilla);
        }}
      />


      {/* 🔹 Evaluación manual clásica debajo */}
      <section>
        <h3 className="font-semibold mb-2">Objetivos</h3>
        <div className="grid gap-3">
          {empleado.objetivos.items.map((o) => (
            <div key={o._id} className="border rounded-md p-3">
              <div className="font-medium">{o.nombre}</div>
              <div className="text-xs text-muted-foreground mb-2">
                {o.descripcion}
              </div>
              {o.metodo === "cuantitativo" ? (
                <input
                  type="number"
                  defaultValue={o.actual ?? ""}
                  placeholder={`Meta: ${o.target}`}
                  className="w-32 border rounded px-2 py-1 text-sm"
                  onBlur={(e) =>
                    handleSave(o._id, { actual: Number(e.target.value) })
                  }
                />
              ) : (
                <select
                  defaultValue={o.escala ?? ""}
                  className="w-48 border rounded px-2 py-1 text-sm"
                  onBlur={(e) =>
                    handleSave(o._id, { escala: Number(e.target.value) })
                  }
                >
                  <option value="">Seleccionar…</option>
                  <option value={0}>No cumple (0%)</option>
                  <option value={50}>Cumple parcial (50%)</option>
                  <option value={75}>Cumple con pendientes (75%)</option>
                  <option value={100}>Cumple totalmente (100%)</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Aptitudes</h3>
        <div className="grid gap-3">
          {empleado.aptitudes.items.map((a) => (
            <div key={a._id} className="border rounded-md p-3">
              <div className="font-medium">{a.nombre}</div>
              <div className="text-xs text-muted-foreground mb-2">
                {a.descripcion}
              </div>
              <select
                defaultValue={a.escala ?? ""}
                className="w-48 border rounded px-2 py-1 text-sm"
                onBlur={(e) =>
                  handleSave(a._id, { escala: Number(e.target.value) })
                }
              >
                <option value="">Seleccionar…</option>
                <option value={0}>No cumple (0%)</option>
                <option value={50}>Cumple parcial (50%)</option>
                <option value={75}>Cumple con pendientes (75%)</option>
                <option value={100}>Cumple totalmente (100%)</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end pt-4">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
