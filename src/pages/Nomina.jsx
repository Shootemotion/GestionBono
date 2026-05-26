import { useEffect, useMemo, useState } from 'react';
import { Download, Search, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import TablaEmpleados from '@/components/TablaEmpleados';
import { useAuth } from '@/context/AuthContext';

function Nomina() {
  const { user } = useAuth();
  const rolesPrivilegiados = new Set(['superadmin', 'rrhh', 'directivo']);
  const rolNormalizado = String(user?.rol || '').toLowerCase();
  const rolEfectivoNorm = String(user?.rolEfectivo || '').toLowerCase();
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  const puedeVerDesvinculados = !!(
    user?.isSuper ||
    user?.isRRHH ||
    user?.isDirectivo ||
    rolesPrivilegiados.has(rolNormalizado) ||
    rolesPrivilegiados.has(rolEfectivoNorm) ||
    // Fallback por permiso: si tiene capacidad de editar nómina, también es RRHH-equivalent
    permisos.includes('nomina:editar') ||
    permisos.includes('nomina:*') ||
    permisos.includes('*')
  );
  const [empleados, setEmpleados] = useState([]);
  const [areas, setAreas] = useState([]);
  const [sectores, setSectores] = useState([]);

  const [query, setQuery] = useState('');
  const [areaId, setAreaId] = useState('all');
  const [sectorId, setSectorId] = useState('all');
  const [incluirDesvinculados, setIncluirDesvinculados] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Sólo RRHH / Directivo / Super pueden pedir desvinculados
        const includeAllowed = incluirDesvinculados && puedeVerDesvinculados;
        const empleadosPath = includeAllowed
          ? '/empleados?incluirDesvinculados=true&limit=100'
          : '/empleados?limit=100';
        const [areasRes, sectoresRes, empleadosRes] = await Promise.all([
          api('/areas'),
          api('/sectores'),
          api(empleadosPath),
        ]);
        setAreas(areasRes);
        setSectores(sectoresRes);
        // El endpoint puede responder { items: [...] } (paginado) o un array directo
        const emps = Array.isArray(empleadosRes)
          ? empleadosRes
          : Array.isArray(empleadosRes?.items)
            ? empleadosRes.items
            : [];
        setEmpleados(emps);
      } finally {
        setLoading(false);
      }
    })();
  }, [incluirDesvinculados]);

  const filteredSectores = useMemo(() => {
    if (areaId === 'all') return sectores;
    return sectores.filter((s) => s.areaId?._id === areaId);
  }, [sectores, areaId]);

  const filtered = useMemo(() => {
    let rows = empleados;
    if (areaId !== 'all') rows = rows.filter((e) => e.area?._id === areaId);
    if (sectorId !== 'all') rows = rows.filter((e) => e.sector?._id === sectorId);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (e) =>
          `${e.apellido ?? ''} ${e.nombre ?? ''}`.toLowerCase().includes(q) ||
          e.dni?.includes(q) ||
          (e.puesto ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [empleados, areaId, sectorId, query]);

  const exportCSV = () => {
    const headers = ['Apellido y Nombre', 'Puesto', 'Área', 'Sector', 'DNI', 'Email'];
    const rows = filtered.map((e) => [
      `${e.apellido ?? ''}, ${e.nombre ?? ''}`,
      e.puesto ?? '',
      e.area?.nombre ?? '',
      e.sector?.nombre ?? '',
      e.dni ?? '',
      e.email ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nomina.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-app">
      {/* Header */}
      <div className="title-row mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Nómina</h1>
          <p className="text-sm text-muted-foreground">
            Listado de empleados en modo lectura.
          </p>
        </div>
        <div className="btn-row">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, DNI o puesto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setSectorId('all');
            }}
          >
            <option value="all">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </Select>

          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            <option value="all">Todos los sectores</option>
            {filteredSectores.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </div>

        {puedeVerDesvinculados && (
          <div className="mt-3 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={incluirDesvinculados}
                onChange={(e) => setIncluirDesvinculados(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
              />
              <EyeOff className="h-3.5 w-3.5 text-rose-500" />
              Incluir empleados desvinculados
              <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-rose-600/70 bg-rose-50 border border-rose-100 rounded-full px-1.5 py-0.5">
                RRHH / Dirección
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <TablaEmpleados
          empleados={filtered}
               mostrarAcciones={
          user?.isRRHH || 
          user?.isDirectivo || 
          user?.isJefeArea || 
          user?.isJefeSector || 
          (user?.referenteAreas?.length > 0 || user?.referenteSectors?.length > 0)
        }
        compact
       
          loading={loading}
        />
      </div>
    </div>
  );
}

export default Nomina;
