// src/components/AsignacionMasivaObjetivos.jsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { objetivosAsignacionMasivaEmpleados } from '@/lib/objetivos';
import { toast } from 'sonner';

export default function AsignacionMasivaObjetivos({ anio, empleados = [], onDone, onClose }) {
  const [selected, setSelected] = useState(() => new Set());
  const [selectAll, setSelectAll] = useState(false);

  // campos del objetivo a asignar
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [kpi, setKpi] = useState('');
  const [target, setTarget] = useState('');
  const [peso, setPeso] = useState(25);
  const [fechaLimite, setFechaLimite] = useState('');
  const [metodo, setMetodo] = useState('trimestral');

  useEffect(() => {
    // cuando se abre/cierra desde el Modal externo, reseteamos
    setSelected(new Set());
    setSelectAll(false);
    setNombre(''); setDescripcion(''); setKpi(''); setTarget('');
    setPeso(25); setFechaLimite(''); setMetodo('trimestral');
  }, []);

  const totalSeleccionados = selected.size;

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(empleados.map(e => e._id)));
      setSelectAll(true);
    }
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      toast.info('Seleccioná al menos un empleado.');
      return;
    }
    if (!nombre?.trim()) {
      toast.info('Completá el nombre del objetivo.');
      return;
    }

    try {
      await objetivosAsignacionMasivaEmpleados({
        anio,
        empleadoIds: Array.from(selected),
        objetivo: { nombre, descripcion, kpi, target, peso, fechaLimite, metodo },
      });
      toast.success(`Objetivo asignado a ${selected.size} empleado(s)`);
      onDone?.();
      onClose?.();
    } catch (e) {
      console.error(e);
      toast.error(e?.data?.message || e?.message || 'Error al asignar');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header selección */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleSelectAll}>
          {selectAll ? 'Quitar selección' : 'Seleccionar Todos'}
        </Button>
        <span className="text-sm text-muted-foreground">
          {totalSeleccionados} seleccionado(s)
        </span>
      </div>

      {/* Lista de empleados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[280px] overflow-auto rounded-xl border p-2">
        {empleados.map((e) => {
          const checked = selected.has(e._id);
          return (
            <label
              key={e._id}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checked ? 'bg-accent/60' : 'bg-background'}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() => toggleOne(e._id)}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {e.apellido}, {e.nombre}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {e.puesto} • {e.sector?.nombre || '—'}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Form objetivo */}
      <div className="space-y-3">
        <h3 className="font-medium">Datos del Objetivo</h3>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Nombre del Objetivo</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              placeholder="Ej: Aumentar ventas"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Peso (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              value={peso}
              onChange={(e) => setPeso(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Descripción</label>
          <textarea
            className="w-full min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            placeholder="Descripción detallada del objetivo"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">KPI</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              placeholder="Ej: Número de ventas"
              value={kpi}
              onChange={(e) => setKpi(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Target</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              placeholder="Ej: > 100 ventas"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fecha Límite</label>
            <input
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Método de Seguimiento</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
            >
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Asignar</Button>
        </div>
      </div>
    </div>
  );
}
