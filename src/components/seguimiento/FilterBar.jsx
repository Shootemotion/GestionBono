import { Calendar, Building, Store, User, Search, CheckCircle2 } from "lucide-react";

export default function FilterBar({
  anio, setAnio,
  areaFiltro, setAreaFiltro, areasUnicas,
  sectorFiltro, setSectorFiltro, sectoresUnicos,
  empQuery, setEmpQuery,
  empSelectedId, setEmpSelectedId,
  empHints, showEmpHints, setShowEmpHints,
  hideAreaFilter = false
}) {
  return (
    <div className="space-y-5">

      {/* 2. FILTROS GRID - Diseño "Input Group" con Iconos */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-12 items-end">

        {/* Año */}
        <div className="lg:col-span-2">
          <label className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 block">Año</label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Calendar className="w-4 h-4" />
            </div>
            <input
              type="number"
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all hover:bg-white"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Área */}
        {!hideAreaFilter && (
          <div className="lg:col-span-3">
            <label className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 block">Área</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Building className="w-4 h-4" />
              </div>
              <select
                value={areaFiltro}
                onChange={(e) => setAreaFiltro(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all cursor-pointer hover:bg-white appearance-none"
              >
                {areasUnicas.map((a) => (
                  <option key={a._id} value={a._id}>{a.nombre}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
          </div>
        )}

        {/* Sector */}
        <div className={hideAreaFilter ? "lg:col-span-4" : "lg:col-span-3"}>
          <label className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 block">Sector</label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Store className="w-4 h-4" />
            </div>
            <select
              value={sectorFiltro}
              onChange={(e) => setSectorFiltro(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all cursor-pointer hover:bg-white appearance-none"
            >
              {sectoresUnicos.map((s) => (
                <option key={s._id} value={s._id}>{s.nombre}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>

        {/* Empleado (Buscador) */}
        <div className="lg:col-span-4 relative">
          <label className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 block flex justify-between">
            <span>Empleado</span>
            {empSelectedId && <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Seleccionado</span>}
          </label>
          <div className="relative group">
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${empSelectedId ? "text-emerald-500" : "text-slate-400 group-focus-within:text-blue-500"}`}>
              {empSelectedId ? <User className="w-4 h-4 fill-emerald-100" /> : <Search className="w-4 h-4" />}
            </div>
            <input
              className={`w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm outline-none transition-all placeholder:text-slate-400 ${empSelectedId
                ? "bg-emerald-50/50 border-emerald-200 text-emerald-800 font-semibold focus:ring-2 focus:ring-emerald-100"
                : "bg-slate-50 border-slate-200 text-slate-700 font-medium focus:ring-2 focus:ring-blue-100 focus:border-blue-400 hover:bg-white"
                }`}
              placeholder="Buscar por nombre..."
              value={empQuery}
              onChange={(e) => {
                setEmpQuery(e.target.value);
                setShowEmpHints(true);
                setEmpSelectedId(null);
              }}
              onFocus={() => setShowEmpHints(true)}
              onBlur={() => setTimeout(() => setShowEmpHints(false), 200)}
            />
          </div>

          {/* Dropdown Hints */}
          {showEmpHints && empHints.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-slate-50 px-3 py-2 text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">Resultados sugeridos</div>
              {empHints.map((h) => (
                <button
                  key={h._id}
                  onClick={() => {
                    setEmpSelectedId(h._id);
                    setEmpQuery(h.label);
                    setShowEmpHints(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 hover:text-blue-700 transition flex flex-col gap-0.5 border-b border-slate-50 last:border-0 group"
                >
                  <div className="font-semibold text-slate-700 group-hover:text-blue-700">{h.label}</div>
                  <div className="text-[11px] text-slate-400 group-hover:text-blue-400 flex items-center gap-1">
                    <span>{h.area}</span>
                    <span className="text-slate-300">•</span>
                    <span>{h.sector}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
