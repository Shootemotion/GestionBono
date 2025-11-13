// src/pages/RRHHResumen.jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const GroupPicker = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Agrupar por</span>
    <select
      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="jefe">Jefe</option>
      <option value="area">Área</option>
      <option value="sector">Sector</option>
    </select>
  </div>
);

export default function RRHHResumen() {
  const [groupBy, setGroupBy] = useState("jefe");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Carga cruda (todas las evaluaciones visibles para RRHH)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Ideal: backend ya trae lo necesario poblado (manager, empleado.area/sector)
        // Alternativa: api('/evaluaciones?scope=rrhh&populate=manager,empleado')
        const ev = await api(`/rrhh/evaluaciones`);
        const arr = Array.isArray(ev) ? ev : ev?.items || [];
        setRows(arr);
      } catch (e) {
        console.error(e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Agrupación y métricas
  const grupos = useMemo(() => {
    const map = new Map();

    const getKey = (r) => {
      if (groupBy === "jefe") {
        const jefe =
          r?.manager?.nombre ||
          r?.manager?.name ||
          r?.manager?.displayName ||
          r?.manager?.email ||
          r?.manager?._id ||
          "—";
        return String(jefe);
      }
      if (groupBy === "area") {
        return String(r?.empleado?.area || r?.empleado?.areaNombre || "—");
      }
      // sector
      return String(r?.empleado?.sector || r?.empleado?.sectorNombre || "—");
    };

    for (const r of rows) {
      const key = getKey(r);
      if (!map.has(key)) {
        map.set(key, {
          key,
          totalColaboradores: 0,
          conformes: 0,
          desconformes: 0,
          resultados: [],
          sample: [],
        });
      }
      const g = map.get(key);
      g.totalColaboradores += 1;

      const ack = r?.empleadoAck?.estado || null;
      if (ack === "ACK") g.conformes += 1;
      else if (ack === "CONTEST") g.desconformes += 1;

      if (typeof r?.actual === "number") g.resultados.push(r.actual);
      g.sample.push(r);
    }

    // Post-proceso
    const out = [];
    for (const [, g] of map) {
      const prom =
        g.resultados.length
          ? g.resultados.reduce((a, b) => a + b, 0) / g.resultados.length
          : 0;
      const pctDesac =
        g.totalColaboradores > 0
          ? (g.desconformes / g.totalColaboradores) * 100
          : 0;

      out.push({
        grupo: g.key,
        totalColaboradores: g.totalColaboradores,
        conformes: g.conformes,
        desconformes: g.desconformes,
        pctDesacuerdo: Math.round(pctDesac),
        promedioResultado: Math.round(prom),
      });
    }

    // Orden: primero los focos con más desacuerdo
    out.sort((a, b) => b.pctDesacuerdo - a.pctDesacuerdo);
    return out;
  }, [rows, groupBy]);

  return (
    <div className="container-app">
      <div className="mx-auto max-w-[1100px] space-y-4">
        {/* Header simple */}
        <div className="flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-black/5 dark:ring-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md shadow-sm">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Resumen RRHH</h1>
            <p className="text-sm text-muted-foreground">
              Vista consolidada por jefe, área o sector con conformidad y resultados.
            </p>
          </div>
          <GroupPicker value={groupBy} onChange={setGroupBy} />
        </div>

        {/* Tabla */}
        <div className="rounded-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50/80 dark:bg-slate-800/70 backdrop-blur text-[11px] uppercase text-slate-500 dark:text-slate-400 tracking-wide">
                <th className="text-left px-3 py-2 w-[35%]">
                  {groupBy === "jefe" ? "Jefe" : groupBy === "area" ? "Área" : "Sector"}
                </th>
                <th className="text-left px-3 py-2">Colaboradores</th>
                <th className="text-left px-3 py-2">Conformes</th>
                <th className="text-left px-3 py-2">Desconformes</th>
                <th className="text-left px-3 py-2">% Desacuerdo</th>
                <th className="text-left px-3 py-2">Resultado Prom.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={6}>
                    Cargando…
                  </td>
                </tr>
              ) : grupos.length ? (
                grupos.map((g) => (
                  <tr
                    key={g.grupo}
                    className="border-t border-slate-200/60 dark:border-slate-700/60 odd:bg-white/70 even:bg-slate-50/60 dark:odd:bg-slate-900/50 dark:even:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 font-medium">{g.grupo}</td>
                    <td className="px-3 py-2">{g.totalColaboradores}</td>
                    <td className="px-3 py-2">{g.conformes}</td>
                    <td className="px-3 py-2">{g.desconformes}</td>
                    <td className="px-3 py-2">{g.pctDesacuerdo}%</td>
                    <td className="px-3 py-2">{g.promedioResultado}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={6}>
                    Sin datos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Acciones (export rápido si querés enganchar a Excel/BI más adelante) */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              // mínimo export JSON rápido
              const blob = new Blob([JSON.stringify(grupos, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `rrhh_resumen_${groupBy}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exportar JSON
          </Button>
        </div>
      </div>
    </div>
  );
}
