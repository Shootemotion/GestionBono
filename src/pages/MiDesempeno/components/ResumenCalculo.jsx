// src/pages/MiDesempeno/components/ResumenCalculo.jsx
//
// Resumen de cómo se compone el puntaje del período. Vive en el panel de
// detalle (columna ancha) y no en la tarjeta del KPI: es una tabla, y en una
// tarjeta angosta quedaba con scroll horizontal y sin leerse.
//
// No calcula nada: muestra lo que ya devolvió computePeriodResults.

import { Info, ChevronRight } from "lucide-react";

const n1 = (v) => Number(v ?? 0).toFixed(1);

/** Explica por qué la escala de esta persona es la que es. */
function explicarEscala(escala, periodo) {
  if (!escala?.objetivosTotales) return null;
  const { porcentajeDelAnio, objetivosAcumulativos, objetivosSinDatos, objetivosTotales } = escala;
  const motivos = [];
  if (objetivosAcumulativos > 0) {
    motivos.push(
      `${objetivosAcumulativos} de tus ${objetivosTotales} objetivos son acumulativos y todavía se están sumando`
    );
  }
  if (objetivosSinDatos > 0) {
    motivos.push(
      `${objetivosSinDatos} todavía no tiene${objetivosSinDatos === 1 ? "" : "n"} carga cargada en este período`
    );
  }
  const base = `A ${periodo} se puede medir el ${n1(porcentajeDelAnio)}% de tu año`;
  return motivos.length ? `${base}: ${motivos.join(" y ")}.` : `${base}.`;
}

export function ResumenCalculo({
  desglose = [],
  escala,
  periodo,
  scoreObj = 0,
  scoreComp = 0,
  scoreGlobal = 0,
  onVerObjetivo,
}) {
  if (!desglose.length) {
    return (
      <div className="p-8 text-center text-sm italic text-slate-400">
        No hay objetivos para resumir en este período.
      </div>
    );
  }

  const frase = explicarEscala(escala, periodo);

  return (
    <div>
      {/* Encabezado, con el mismo tono que el resto del panel de detalle */}
      <h2 className="text-xl font-bold text-zinc-800">Resumen del cálculo</h2>
      <p className="mt-1 text-sm text-zinc-500">
        De dónde sale tu puntaje de {periodo}, objetivo por objetivo.
      </p>

      {frase && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 ring-1 ring-zinc-100">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span>{frase}</span>
        </div>
      )}

      {/* Tabla: acá sí hay ancho para que se lea sin scroll */}
      <table className="mt-5 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-400">
            <th className="pb-2 font-semibold">Objetivo</th>
            <th className="pb-2 text-right font-semibold">Peso</th>
            <th className="pb-2 text-right font-semibold">En juego</th>
            <th className="pb-2 text-right font-semibold">Tu avance</th>
            <th className="pb-2 text-right font-semibold">Aporta</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {desglose.map((d) => (
            <tr key={d._id} className="group hover:bg-zinc-50/60">
              <td className="py-3 pr-3">
                <div className={`font-medium ${d.tieneDatos ? "text-zinc-700" : "text-zinc-400"}`}>
                  {d.nombre}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2 py-px text-[10px] font-medium ${
                      d.tipo === "acumulativo"
                        ? "bg-sky-50 text-sky-700"
                        : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {d.tipo === "acumulativo" ? "acumulativo" : "de mantenimiento"}
                  </span>
                  {!d.tieneDatos && (
                    <span className="text-[10px] text-amber-600">sin carga en este período</span>
                  )}
                </div>
              </td>
              <td className="py-3 text-right tabular-nums text-zinc-500">{d.peso}%</td>
              <td className="py-3 text-right tabular-nums text-zinc-500">
                {n1(d.pesoEnJuego)}%
                {d.factor < 1 && (
                  <div className="text-[10px] text-zinc-400">
                    {d.peso} × {d.factor.toFixed(2)}
                  </div>
                )}
              </td>
              <td className="py-3 text-right tabular-nums text-zinc-600">{n1(d.score)}%</td>
              <td className="py-3 text-right tabular-nums font-semibold text-zinc-800">
                {n1(d.aporte)}
              </td>
              <td className="py-3 pl-2 text-right">
                {onVerObjetivo && (
                  <button
                    type="button"
                    onClick={() => onVerObjetivo(d._id)}
                    title="Ver el detalle de este objetivo"
                    className="rounded-md p-1 text-zinc-300 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 focus:opacity-100"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-200">
            <td colSpan={4} className="pt-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Puntaje de objetivos
            </td>
            <td className="pt-3 text-right text-base font-bold tabular-nums text-zinc-900">
              {n1(scoreObj)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      {/* Cómo se arma el global */}
      <div className="mt-5 rounded-xl border border-zinc-200 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Y así se arma tu global
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-zinc-600">
          <span className="font-semibold text-zinc-800">{n1(scoreObj)}</span>
          <span className="text-zinc-400">objetivos (pesan 70%)</span>
          <span className="text-zinc-300">+</span>
          <span className="font-semibold text-zinc-800">{n1(scoreComp)}</span>
          <span className="text-zinc-400">competencias (pesan 30%)</span>
          <span className="text-zinc-300">=</span>
          <span className="text-base font-bold text-zinc-900">{n1(scoreGlobal)}</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
        <strong className="text-zinc-500">De mantenimiento</strong>: hay que sostenerlo todo el año,
        por eso cuenta con todo su peso desde el primer día.{" "}
        <strong className="text-zinc-500">Acumulativo</strong>: se va sumando, por eso a esta altura
        cuenta solo la parte del año transcurrida. Esa es la razón por la que dos personas pueden
        ver escalas distintas sin que a una se le exija más que a la otra.
      </p>
    </div>
  );
}
