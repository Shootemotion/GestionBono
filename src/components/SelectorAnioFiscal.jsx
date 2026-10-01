import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fiscalYearLabel,
  fiscalYearRange,
  getCurrentFiscalYear,
} from "@/lib/fiscalYear";

/**
 * Selector de AÑO FISCAL.
 *
 * Muestra siempre la etiqueta legible (`AF 2026/27`) con el rango completo
 * (`1 sep 2026 – 31 ago 2027`) como tooltip, pero hacia afuera sigue emitiendo
 * el mismo número de año de inicio que se guarda en la base. Reemplazar un
 * selector viejo por éste no cambia ningún fetch ni payload.
 *
 * @param {number}   value      Año fiscal seleccionado (año de inicio).
 * @param {Function} onChange   Recibe el nuevo año de inicio (number).
 * @param {'stepper'|'pills'|'select'} variant  Forma visual.
 * @param {'light'|'dark'} tone  Superficie sobre la que se apoya.
 * @param {number[]} years     Solo para 'pills'/'select'. Por defecto una
 *                             ventana fija alrededor del año fiscal actual.
 * @param {string}   size      Solo para 'stepper': 'sm' | 'md' | 'lg'.
 * @param {boolean}  showCaption  Muestra el rango debajo, además del tooltip.
 */
export default function SelectorAnioFiscal({
  value,
  onChange,
  variant = "stepper",
  tone = "light",
  years,
  size = "md",
  showCaption = false,
  className,
}) {
  const label = fiscalYearLabel(value);
  const range = fiscalYearRange(value);
  const dark = tone === "dark";

  // Ventana anclada al año fiscal en curso, NO al seleccionado: así las opciones
  // no se corren solas cada vez que el usuario elige una.
  const anchor = getCurrentFiscalYear();
  const optionYears = years ?? [anchor - 1, anchor, anchor + 1];
  // Si el valor activo cayó fuera de la ventana (navegación previa, dato viejo),
  // lo agregamos para que el control nunca quede sin selección visible.
  const opts = optionYears.includes(value)
    ? optionYears
    : [...optionYears, value].sort((a, b) => a - b);

  if (variant === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        title={range}
        aria-label="Año fiscal"
        className={cn(
          "rounded-xl border px-3 py-2 font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20",
          dark
            ? "bg-white/10 border-white/10 text-white"
            : "bg-white border-slate-200 text-slate-700",
          className
        )}
      >
        {opts.map((y) => (
          <option key={y} value={y}>
            {fiscalYearLabel(y)}
          </option>
        ))}
      </select>
    );
  }

  if (variant === "pills") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div
          role="group"
          aria-label="Año fiscal"
          className={cn(
            "inline-flex items-center rounded-full p-0.5",
            dark ? "bg-white/10" : "bg-slate-100"
          )}
        >
          {opts.map((y) => (
            <button
              key={y}
              type="button"
              title={fiscalYearRange(y)}
              aria-pressed={value === y}
              onClick={() => onChange(y)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                value === y
                  ? dark
                    ? "bg-white/20 text-white shadow-sm"
                    : "bg-white text-slate-900 shadow-sm"
                  : dark
                    ? "text-slate-300 hover:text-white"
                    : "text-slate-500 hover:text-slate-800"
              )}
            >
              {fiscalYearLabel(y)}
            </button>
          ))}
        </div>
        {showCaption && (
          <span
            className={cn(
              "text-[10px]",
              dark ? "text-slate-300" : "text-slate-500"
            )}
          >
            Ciclo {range}
          </span>
        )}
      </div>
    );
  }

  // variant === "stepper"
  const sizes = {
    sm: { label: "text-sm font-semibold", icon: 16, gap: "gap-1" },
    md: { label: "text-base font-bold", icon: 18, gap: "gap-2" },
    lg: { label: "text-3xl font-black leading-none", icon: 24, gap: "gap-3" },
  };
  const s = sizes[size] ?? sizes.md;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("flex items-center", s.gap)} title={range}>
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          aria-label="Año fiscal anterior"
          title={`Ir a ${fiscalYearLabel(value - 1)}`}
          className={cn(
            "p-1 rounded-full transition-colors",
            dark
              ? "text-slate-300 hover:text-white hover:bg-white/10"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          )}
        >
          <ChevronLeft width={s.icon} height={s.icon} />
        </button>

        <span
          className={cn(
            "text-center whitespace-nowrap",
            s.label,
            dark ? "text-white" : "text-slate-700"
          )}
        >
          {label}
        </span>

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label="Año fiscal siguiente"
          title={`Ir a ${fiscalYearLabel(value + 1)}`}
          className={cn(
            "p-1 rounded-full transition-colors",
            dark
              ? "text-slate-300 hover:text-white hover:bg-white/10"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          )}
        >
          <ChevronRight width={s.icon} height={s.icon} />
        </button>
      </div>

      {showCaption && (
        <span
          className={cn(
            "text-[10px] font-medium tracking-wider",
            dark ? "text-slate-400" : "text-slate-500"
          )}
        >
          {range}
        </span>
      )}
    </div>
  );
}
