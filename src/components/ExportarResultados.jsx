import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download, FileSpreadsheet, FileText, Loader2, Users, User, Building2, Info,
} from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { getCurrentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";
import SelectorAnioFiscal from "@/components/SelectorAnioFiscal";

/**
 * Exportación de resultados de desempeño.
 *
 * Tres alcances: toda la nómina, por usuario y por área. En los dos últimos se
 * puede elegir uno puntual o dejar "todos", que trae a todos separados.
 *
 * Las notas que salen en el archivo son las que quedaron guardadas en cada
 * feedback —el registro de lo que se le comunicó a la persona—, no un
 * recálculo. Está explicado en el pie del panel para que nadie lo dé por otra
 * cosa.
 */

const ALCANCES = [
  { id: "nomina", label: "Toda la nómina", icono: Users, ayuda: "Una fila por empleado con las notas de cada período." },
  { id: "empleado", label: "Por usuario", icono: User, ayuda: "Ficha completa: objetivos, metas por período, competencias y feedback." },
  { id: "area", label: "Por área", icono: Building2, ayuda: "Promedio del área y el detalle de su gente." },
];

const nombreEmp = (e) =>
  `${e.apellido || ""}${e.apellido && e.nombre ? ", " : ""}${e.nombre || ""}`.trim() || e.email || "—";

export default function ExportarResultados() {
  const [anio, setAnio] = useState(getCurrentFiscalYear());
  const [alcance, setAlcance] = useState("nomina");
  const [empleadoId, setEmpleadoId] = useState("");   // "" = todos
  const [areaId, setAreaId] = useState("");           // "" = todas
  const [incluirDesvinculados, setIncluirDesvinculados] = useState(false);
  const [bajando, setBajando] = useState(null);       // 'xlsx' | 'pdf' | null

  const [empleados, setEmpleados] = useState([]);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    Promise.all([
      api("/empleados?limit=1000").catch(() => []),
      api("/reportes/areas").catch(() => []),
    ]).then(([emps, ars]) => {
      const lista = Array.isArray(emps) ? emps : emps?.items || emps?.data || [];
      setEmpleados([...lista].sort((a, b) => nombreEmp(a).localeCompare(nombreEmp(b), "es")));
      setAreas(Array.isArray(ars) ? ars : []);
    });
  }, []);

  const descripcion = useMemo(() => {
    if (alcance === "nomina") return "todos los empleados en una tabla";
    if (alcance === "empleado") {
      if (!empleadoId) return `los ${empleados.length} empleados, uno por sección`;
      return nombreEmp(empleados.find((e) => String(e._id) === empleadoId) || {});
    }
    if (!areaId) return `las ${areas.length} áreas, una por sección`;
    return areas.find((a) => String(a._id) === areaId)?.nombre || "";
  }, [alcance, empleadoId, areaId, empleados, areas]);

  const descargar = async (formato) => {
    setBajando(formato);
    const id = alcance === "empleado" ? empleadoId : alcance === "area" ? areaId : "";
    const params = new URLSearchParams({ anio: String(anio), formato, alcance });
    if (id) params.set("id", id);
    if (incluirDesvinculados) params.set("incluirDesvinculados", "true");

    try {
      const { nombre } = await apiDownload(`/reportes/desempeno?${params.toString()}`);
      toast.success(`Descargado: ${nombre}`);
    } catch (e) {
      toast.error(e?.message || "No se pudo generar el reporte");
    } finally {
      setBajando(null);
    }
  };

  const ocupado = bajando !== null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-500" /> Exportar resultados
        </h2>
        <SelectorAnioFiscal value={anio} onChange={setAnio} size="sm" />
      </div>

      <div className="p-5">
        {/* Alcance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {ALCANCES.map((a) => {
            const activo = alcance === a.id;
            const Icono = a.icono;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAlcance(a.id)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  activo
                    ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className={`flex items-center gap-2 text-sm font-bold ${activo ? "text-indigo-700" : "text-slate-700"}`}>
                  <Icono className="w-4 h-4" /> {a.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-snug">{a.ayuda}</div>
              </button>
            );
          })}
        </div>

        {/* Selector según el alcance */}
        {alcance === "empleado" && (
          <label className="block mb-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Empleado</span>
            <select
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              className="mt-1 w-full max-w-md px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Todos ({empleados.length}) — uno por sección</option>
              {empleados.map((e) => (
                <option key={e._id} value={String(e._id)}>{nombreEmp(e)}</option>
              ))}
            </select>
          </label>
        )}

        {alcance === "area" && (
          <label className="block mb-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Área</span>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="mt-1 w-full max-w-md px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Todas ({areas.length}) — una por sección</option>
              {areas.map((a) => (
                <option key={a._id} value={String(a._id)}>{a.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer mb-5">
          <input
            type="checkbox"
            className="accent-indigo-500 w-4 h-4"
            checked={incluirDesvinculados}
            onChange={(e) => setIncluirDesvinculados(e.target.checked)}
          />
          Incluir desvinculados
        </label>

        {/* Botones */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => descargar("xlsx")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bajando === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Excel
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => descargar("pdf")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bajando === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            PDF
          </button>
          <span className="text-xs text-slate-500">
            {fiscalYearLabel(anio)} · {descripcion}
          </span>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] bg-slate-50 border border-slate-200 text-slate-500 rounded-lg p-2.5 leading-snug">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
          <span>
            Las notas por período se toman del <strong>feedback guardado</strong>: es lo que efectivamente se le
            comunicó a cada persona, sin recalcular. El detalle de objetivos y competencias son los valores
            cargados en cada período. El Excel trae hojas separadas (Resumen, Objetivos, Competencias, Feedback)
            para filtrar y armar tablas dinámicas; el PDF viene armado para leer e imprimir.
          </span>
        </div>
      </div>
    </div>
  );
}
