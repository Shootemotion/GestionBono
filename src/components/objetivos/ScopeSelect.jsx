import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { getCurrentFiscalYear } from "@/lib/fiscalYear";

export default function ScopeSelect({
  areas = [],
  sectores = [],
  empleados = [],
  areaId,
  sectorId,
  empleadoId,
  anio,
  onChangeArea,
  onChangeSector,
  onChangeEmpleado,
  onChangeAnio,
}) {
  const sectoresFiltrados = useMemo(() => {
    return sectores.filter((s) => {
      const sid = (typeof s.areaId === 'object' && s.areaId)?._id || s.areaId;
      return !areaId || String(sid) === String(areaId);
    });
  }, [sectores, areaId]);

  const empleadosFiltrados = useMemo(() => {
    if (empleadoId) return empleados;
    if (sectorId) return empleados.filter((e) => String(e.sector?._id) === String(sectorId));
    if (areaId) return empleados.filter((e) => String(e.area?._id) === String(areaId));
    return empleados;
  }, [empleados, areaId, sectorId, empleadoId]);

  return (
    <div className="card p-4 mb-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_120px]">
        {/* Área */}
        <div>
          <label className="text-xs text-muted-foreground">Área</label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm outline-none"
              value={areaId}
              onChange={(e)=>{ onChangeArea(e.target.value); onChangeSector(''); onChangeEmpleado(''); }}
              disabled={areas.length === 0}
            >
              {areas.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Sector */}
        <div>
          <label className="text-xs text-muted-foreground">Sector</label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm outline-none"
              value={sectorId}
              onChange={(e)=>{ onChangeSector(e.target.value); onChangeEmpleado(''); }}
              disabled={sectoresFiltrados.length === 0}
            >
              <option value="">—</option>
              {sectoresFiltrados.map(s => <option key={s._id} value={s._id}>{s.nombre}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Empleado */}
        <div>
          <label className="text-xs text-muted-foreground">Empleado</label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm outline-none"
              value={empleadoId}
              onChange={(e)=> onChangeEmpleado(e.target.value)}
              disabled={empleadosFiltrados.length === 0}
            >
              <option value="">—</option>
              {empleadosFiltrados.map(e => (
                <option key={e._id} value={e._id}>
                  {e.apellido}, {e.nombre} · {e.puesto}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Año */}
        <div>
          <label className="text-xs text-muted-foreground">Año</label>
          <input
            type="number"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            value={anio}
            onChange={(e)=> onChangeAnio(Number(e.target.value || getCurrentFiscalYear()))}
          />
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {empleados.length} empleados totales
      </div>
    </div>
  );
}
