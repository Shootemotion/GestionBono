import {
  Target,
  Lightbulb,
  Scale,
  Repeat,
  Settings2,
  MoreHorizontal,
  Edit3,
  Copy,
  Trash2,
  CheckCircle2,
  XCircle,
  Calendar,
  Globe
} from "lucide-react";

export default function PlantillasList({
  plantillas = [],
  onEdit,
  onClone,
  onDelete,
  onToggleActive,
  permisos,
  areas = [],
  sectores = [],
  empleados = []
}) {
  if (!plantillas.length) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        <p className="text-sm text-slate-500">
          No hay plantillas para este filtro. Probá limpiar filtros (Año/Alcance) o asegurate de haber creado plantillas para el año seleccionado.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4">
      {plantillas.map((p) => {
        const isObj = p.tipo === "objetivo";
        const canEdit = isObj
          ? permisos?.canEditObjetivo
          : permisos?.canEditAptitud;
        const canDelete = isObj
          ? permisos?.canDeleteObjetivo
          : permisos?.canDeleteAptitud;

        const metasCount =
          isObj && Array.isArray(p.metas) ? p.metas.length : null;

        // Data Normalization
        const metodo = p.metodo || "—";
        const proceso = p.proceso || "—";
        const frecuencia = p.frecuencia || p.frequency || "—";
        const activo = p.activo !== false;

        // Override Logic
        const overridePesoVal = p.__override?.peso;
        const hasPesoOverride = overridePesoVal !== undefined && overridePesoVal !== null;
        const pesoDisplay = hasPesoOverride && !isNaN(Number(overridePesoVal))
          ? Number(overridePesoVal)
          : (p.pesoBase ?? 0);

        const hasOverride =
          p.__hasOverride ||
          (!!p.__override && !p.__override.excluido && (hasPesoOverride || p.__override?.meta));

        // Format Scope (Alcance)
        const getScopeLabel = () => {
          if (p.scopeType === "empleado") {
            const emp = empleados.find(e => String(e._id) === String(p.scopeId));
            return emp ? `${emp.apellido}, ${emp.nombre}` : "Individual";
          }
          if (p.scopeType === "area") {
            const ar = areas.find(a => String(a._id) === String(p.scopeId));
            return ar ? `Área: ${ar.nombre}` : "Área";
          }
          if (p.scopeType === "sector") {
            const sec = sectores.find(s => String(s._id) === String(p.scopeId));
            return sec ? `Dep.: ${sec.nombre}` : "Dependencia";
          }
          return "Global";
        };
        const scopeLabel = getScopeLabel();

        // Theme Colors
        const borderColor = isObj ? "border-indigo-500" : "border-amber-500";
        const iconColor = isObj ? "text-indigo-600" : "text-amber-600";
        const bgColor = isObj ? "bg-indigo-50/50" : "bg-amber-50/50";

        return (
          <li
            key={p._id}
            className={`group relative flex flex-col bg-gradient-to-br from-white to-slate-50/50 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300 overflow-hidden border-l-[6px] ${borderColor}`}
            style={{ paddingBottom: '3.5rem' }}
          >

            <div className="flex flex-col h-full relative z-0">
              {/* HEADER */}
              <div className="p-4 pb-2 flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${bgColor} ${iconColor}`}>
                      {isObj ? <Target className="w-3 h-3" /> : <Lightbulb className="w-3 h-3" />}
                      {isObj ? "Objetivo" : "Competencia"}
                    </span>
                    {/* YEAR BADGE */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200/60">
                      <Calendar className="w-3 h-3" /> {p.year || "—"}
                    </span>

                    {hasOverride && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                        OVERRIDE
                      </span>
                    )}
                  </div>



                  {/* Title refined: Smaller text-sm, still medium weight */}
                  <h3 className="text-sm font-medium text-slate-700 leading-snug break-words tracking-tight group-hover:text-blue-700 transition-colors">
                    {p.nombre}
                  </h3>

                </div>

                {/* KPI Badge (Weight) - Slightly smaller */}
                <div className="flex flex-col items-end shrink-0">
                  <div className="text-xl font-bold text-slate-600 leading-none tracking-tighter">
                    {pesoDisplay}<span className="text-[10px] font-semibold text-slate-400 align-top ml-0.5">%</span>
                  </div>

                  {/* Status Toggle moved here */}
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <label className="relative inline-flex items-center cursor-pointer group/toggle" title={activo ? "Desactivar" : "Activar"}>
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={activo}
                        onChange={() => onToggleActive?.(p)}
                        disabled={!canEdit}
                      />
                      <div className={`w-8 h-4 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-100 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all ${activo ? 'bg-emerald-500 peer-checked:bg-emerald-500' : 'bg-slate-300'}`}></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* BODY: Tech Grid (Transparent, no white box) */}
              <div className="px-4 py-3 pb-6">
                <div className="grid grid-cols-3 gap-2 px-1 py-2 border-t border-slate-100/80">

                  {/* Col 1: Alcance (Scope) */}
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Alcance
                    </span>
                    <span className="text-xs font-medium text-slate-600 truncate" title={scopeLabel}>
                      {scopeLabel}
                    </span>
                  </div>

                  {/* Col 2: Proceso */}
                  <div className="flex flex-col border-l border-slate-100 pl-3">
                    <span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 flex items-center gap-1">
                      <Settings2 className="w-3 h-3" /> Proceso
                    </span>
                    <span className="text-xs font-medium text-slate-600 truncate" title={proceso}>
                      {proceso}
                    </span>
                  </div>

                  {/* Col 3: Metas/Frecuencia */}
                  <div className="flex flex-col border-l border-slate-100 pl-3">
                    <span className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 flex items-center gap-1">
                      {isObj ? <Target className="w-3 h-3" /> : <Repeat className="w-3 h-3" />}
                      {isObj ? "Metas/KPIS" : "Frecuencia"}
                    </span>
                    <span className="text-xs font-medium text-slate-600 truncate">
                      {isObj ? `${metasCount} items` : frecuencia}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* HOVER ACTIONS FOOTER (Overlay) */}
            <div className="absolute bottom-0 left-0 right-0 transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 ease-in-out border-t border-slate-100/80 bg-white/95 backdrop-blur-sm z-20 flex text-center divide-x divide-slate-100 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
              <button
                className="flex-1 py-3 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide flex items-center justify-center gap-2"
                onClick={() => onEdit?.(p)}
                disabled={!canEdit}
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
              <button
                className="flex-1 py-3 text-xs font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50/50 transition-colors uppercase tracking-wide flex items-center justify-center gap-2"
                onClick={() => onClone?.(p)}
              >
                <Copy className="w-3.5 h-3.5" /> Clonar
              </button>
              <button
                className="flex-1 py-3 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide flex items-center justify-center gap-2"
                onClick={() => onDelete?.(p)}
                disabled={!canDelete}
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
