// src/components/EmpleadoCard.jsx
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api";

const initials = (e) => {
  const n = `${e?.nombre ?? ""} ${e?.apellido ?? ""}`.trim();
  return n
    ? n.split(" ").slice(0, 2).map((x) => x[0]?.toUpperCase()).join("")
    : "—";
};

const fotoSrc = (empleado) => {
  const url = empleado?.fotoUrl;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // absoluta
  const base = (typeof API_ORIGIN === "string" && API_ORIGIN) ? API_ORIGIN : window.location.origin;
  return `${base.replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
};

function EmpleadoCard({ empleado, onEditar /* onEliminar ya no se usa aquí */ }) {
  const area = empleado?.area?.nombre ?? empleado?.area?.toString?.() ?? "—";
  const sector = empleado?.sector?.nombre ?? empleado?.sector?.toString?.() ?? null;
  const email = empleado?.email ?? empleado?.correo ?? "";
  const activo = empleado?.activo ?? true;
  const puesto = empleado?.puesto ?? "";
  const celular = empleado?.celular ?? empleado?.telefono ?? empleado?.movil ?? "";
  const img = useMemo(() => fotoSrc(empleado), [empleado?.fotoUrl]);

  return (
    <div className="group relative bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-slate-300 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col h-full">
      {/* 1. Foto Protagonista (Vertical) */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {img ? (
          <img
            src={img}
            alt={`${empleado?.nombre ?? ""} ${empleado?.apellido ?? ""}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold text-4xl">
            {initials(empleado)}
          </div>
        )}
      </div>

      {/* 2. Datos del Empleado */}
      <div className="flex flex-col p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-lg text-slate-800 leading-tight" title={`${empleado?.nombre} ${empleado?.apellido}`}>
            {empleado?.nombre} {empleado?.apellido}
          </h3>
          <span className={`flex-shrink-0 h-2.5 w-2.5 rounded-full mt-1.5 ${activo ? "bg-emerald-500 ring-4 ring-emerald-500/20" : "bg-slate-300"}`} title={activo ? "Activo" : "Inactivo"} />
        </div>

        <p className="text-sm font-medium text-slate-600 mb-3 min-h-[1.25rem]">
          {puesto || "—"}
        </p>

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="p-1 bg-slate-100/50 rounded text-slate-400">✉️</div>
            <span className="truncate" title={email}>{email || "Sin email"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="p-1 bg-slate-100/50 rounded text-slate-400">📱</div>
            <span className="truncate" title={celular}>{celular || "Sin celular"}</span>
          </div>
        </div>

        {/* Tags Área/Sector */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
            <span className="font-bold mr-1 text-slate-400">Área:</span> {area}
          </span>
          {sector && (
            <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
              <span className="font-bold mr-1 text-slate-400">Sector:</span> {sector}
            </span>
          )}
        </div>

        {/* Action Buttons (Visible ONLY on Hover - Bottom Overlay) */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-white/95 backdrop-blur-sm border-t border-slate-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
          <Button
            onClick={onEditar}
            variant="outline"
            className="flex-1 text-xs h-9 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50"
          >
            Editar
          </Button>
          <a href={`/nomina/legajo/${empleado._id}`} className="flex-1">
            <Button
              className="w-full text-xs h-9 bg-slate-800 hover:bg-slate-900 text-white"
            >
              Legajo
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export default memo(EmpleadoCard);
