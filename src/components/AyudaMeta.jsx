// src/components/AyudaMeta.jsx
//
// Ayuda contextual de los campos de una meta (el bloque "Cómo se mide").
// El texto de cada campo vive en @/lib/ayudaMetas.

// El estado abierto/cerrado lo maneja el formulario, para poder renderizar el
// botón dentro de la fila del encabezado y el panel debajo, a ancho completo.
import { HelpCircle, X, BookOpen } from "lucide-react";
import { AYUDA_CAMPOS_META } from "@/lib/ayudaMetas";

/**
 * Ícono de ayuda al lado de una etiqueta. Se abre al pasar el mouse y también
 * con el teclado (focus), así que no queda inaccesible.
 */
export function AyudaCampo({ campo, className = "" }) {
  const info = AYUDA_CAMPOS_META[campo];
  if (!info) return null;

  return (
    <span className={`relative inline-flex group align-middle ${className}`}>
      <button
        type="button"
        aria-label={`Ayuda: ${info.titulo}`}
        className="text-slate-300 hover:text-slate-500 focus:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] leading-snug text-slate-100 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="block font-semibold text-white">{info.titulo}</span>
        <span className="mt-1 block text-slate-300">{info.texto}</span>
        {info.nota && (
          <span className="mt-1.5 block border-t border-slate-700 pt-1.5 text-amber-300">
            {info.nota}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Botón "¿Cómo funciona?" con el panel completo, para quien prefiere leer todo
 * junto en vez de campo por campo.
 */
/**
 * Botón que abre/cierra la ayuda. Va en la fila del encabezado; el panel se
 * renderiza aparte, a ancho completo, para que no comprima el título.
 */
export function BotonAyudaMetas({ abierto, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      aria-controls="panel-ayuda-metas"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <BookOpen className="h-3.5 w-3.5" />
      {abierto ? "Ocultar ayuda" : "¿Cómo funciona?"}
    </button>
  );
}

/**
 * Panel con la referencia completa de los campos de una meta. Debe ocupar todo
 * el ancho disponible: si se lo mete dentro de una fila flex junto al título,
 * lo aplasta y la segunda columna se sale de la vista.
 */
export function PanelAyudaMetas({ onCerrar }) {
  return (
    <div
      id="panel-ayuda-metas"
      className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-600">
          Una <strong>meta</strong> es la regla con la que se decide si el
          objetivo se cumplió. Se lee como una condición:{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
            ocupación ≥ 80, medición mensual, cada mes por separado
          </code>
          .
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar ayuda"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-3.5 md:grid-cols-2">
        {Object.entries(AYUDA_CAMPOS_META).map(([k, info]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-semibold text-slate-800">{info.titulo}</dt>
            <dd className="text-[11px] leading-snug text-slate-500">
              {info.texto}
              {info.nota && (
                <span className="mt-1 block text-amber-700">{info.nota}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
