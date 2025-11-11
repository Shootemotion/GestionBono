import { useEffect, useState } from "react";

export default function FilterBar({ anio, setAnio }) {
  const [yearInput, setYearInput] = useState(anio);
  useEffect(() => setYearInput(anio), [anio]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-center">
      <div className="space-y-1">
        <div className="text-xs text-slate-500">Año</div>
        <input
          type="number"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={yearInput}
          onChange={(e) => setYearInput(e.target.value)}
          onBlur={() => setAnio(Number(yearInput) || new Date().getFullYear())}
        />
      </div>
    </div>
  );
}
