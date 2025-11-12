export function mixGlobal({ obj = 0, apt = 0, pesos = { obj: 0.7, apt: 0.3 } }) {
  const po = Number(pesos?.obj ?? 0.7);
  const pa = Number(pesos?.apt ?? 0.3);
  const norm = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  return +(norm(obj) * po + norm(apt) * pa).toFixed(2);
}

export function bonoLineal({ global, maxPct = 0.3, minPct = 0, umbral = 60 }) {
  const g = Math.max(0, Math.min(100, Number(global) || 0));
  if (g <= umbral) return { pct: minPct, meta: "bajo_umbral" };
  const pct = minPct + (maxPct - minPct) * ((g - umbral) / (100 - umbral));
  return { pct: +pct.toFixed(4), meta: "lineal" };
}

export function bonoTramos({ global, tramos = [
  { gte: 0,  pct: 0.00 },
  { gte: 70, pct: 0.10 },
  { gte: 85, pct: 0.20 },
  { gte: 95, pct: 0.30 },
] }) {
  const g = Math.max(0, Math.min(100, Number(global) || 0));
  let pct = 0;
  for (const t of tramos) if (g >= t.gte) pct = t.pct;
  return { pct, meta: "tramos" };
}

export function montoBono({ sueldo, pct }) {
  const s = Number(sueldo) || 0;
  const p = Number(pct) || 0;
  return +(s * p).toFixed(2);
}
