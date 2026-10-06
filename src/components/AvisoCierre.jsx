// src/components/AvisoCierre.jsx
//
// "Esta nota puede cambiar cuando se cierre el año, y esto es por qué."
//
// Lo calcula el backend (riesgoDeCierre.ts) y viaja en el payload del
// dashboard; acá sólo se muestra.
//
// POR QUÉ EXISTE
// Guido Barretto vio 88,9 durante todo el año y su feedback final dijo 76,1.
// Una de sus metas pedía cumplir 12 períodos, llevaba 11, mostraba 91,7% y al
// cerrar dio 0. La información estaba en el sistema desde el primer mes y
// nadie se la mostró.
//
// NO es un error que los dos números difieran: el seguimiento muestra avance
// y el cierre aplica la regla que configuró el jefe. Lo que estaba mal era
// que la diferencia apareciera recién el último día.

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Target } from "lucide-react";

const fmt = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toFixed(1));

/**
 * @param {Object} props
 * @param {Object} props.riesgo        lo que devuelve el backend
 * @param {Boolean} [props.compacto]   una línea en vez del detalle (para la
 *   cabecera del jefe, donde el espacio es poco)
 */
export default function AvisoCierre({ riesgo, compacto = false }) {
  const [abierto, setAbierto] = useState(false);

  if (!riesgo?.hayRiesgo) return null;

  const puntos = Number(riesgo.impactoTotal);
  const baja = puntos < 0;

  if (compacto) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
        title="Hay metas cuya regla de cierre cambia el resultado. Abrí Mi Desempeño para el detalle."
      >
        <AlertTriangle className="w-3 h-3" />
        al cerrar {baja ? "" : "+"}
        {fmt(puntos)}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-amber-50"
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Si el año se cerrara hoy, esta nota {baja ? "bajaría" : "subiría"}{" "}
            {Math.abs(puntos)} punto{Math.abs(puntos) === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-amber-700 leading-snug mt-0.5">
            {riesgo.objetivos.length === 1 ? "Un objetivo tiene" : `${riesgo.objetivos.length} objetivos tienen`}{" "}
            metas que al cerrar se evalúan con una regla distinta de la del seguimiento.
            {!abierto && " Tocá para ver cuáles y qué falta."}
          </p>
        </div>
        {abierto ? (
          <ChevronDown className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        )}
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200/70 pt-3">
          {riesgo.objetivos.map((o) => (
            <div key={o.objetivoId}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <Target className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-800">{o.nombre}</span>
                </div>
                <span className="text-[11px] font-mono text-amber-700 shrink-0">
                  {fmt(o.seguimiento)}% → {fmt(o.cierre)}%
                </span>
              </div>

              <ul className="mt-1.5 space-y-2 pl-5">
                {o.metas.map((m, i) => (
                  <li key={i} className="text-[11px] leading-relaxed">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-700">{m.nombre}</span>
                      <span className="font-mono text-slate-500 shrink-0">
                        {fmt(m.seguimiento)}% → <strong className="text-amber-700">{fmt(m.cierre)}%</strong>
                      </span>
                    </div>
                    <p className="text-slate-600">{m.motivo}</p>
                    {/* Lo accionable: qué falta para que no caiga. Es la única
                        parte sobre la que todavía se puede hacer algo. */}
                    {m.queFalta && (
                      <p className="text-amber-800 font-medium mt-0.5">→ {m.queFalta}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-[11px] text-slate-500 border-t border-amber-200/70 pt-2">
            El número que se ve arriba es el avance del año y es correcto. Al cerrar, las metas
            configuradas como todo o nada —o con un mínimo de períodos— se evalúan con esa regla.
            Las dos cosas están bien; esto es para que la diferencia no aparezca recién el último
            día.
          </p>
        </div>
      )}
    </div>
  );
}
