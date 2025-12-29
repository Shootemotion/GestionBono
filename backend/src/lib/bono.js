export function mixGlobal({ obj = 0, apt = 0, pesos = { obj: 0.7, apt: 0.3 } }) {
  const po = Number(pesos?.obj ?? 0.7);
  const pa = Number(pesos?.apt ?? 0.3);
  // Permitimos que el score supere 100 si hay over-achievement
  const norm = (v) => Math.max(0, Number(v) || 0);
  return +(norm(obj) * po + norm(apt) * pa).toFixed(2);
}

export function bonoLineal({ global, maxPct = 0.3, minPct = 0, umbral = 60 }) {
  // Round to 1 decimal place to handle "35.9" vs "36" issues or "89.9" vs "90"
  // If user sees "36%" in UI (rounded), they expect 36 threshold to pass.
  // 35.98 -> 36.0
  const gRaw = Math.max(0, Math.min(100, Number(global) || 0));
  const g = Math.round(gRaw * 10) / 10;

  // Fix potential floating point issues (e.g. 36 vs 36.00000001)
  const epsilon = 0.0001;
  const normalizedG = g + epsilon;

  // DEBUG LOG
  if (normalizedG < umbral || (g > 35 && g < 45)) {
    console.log(`[DEBUG_BONO_LINEAL] g=${g}, norm=${normalizedG}, umbral=${umbral}, minPct=${minPct}, maxPct=${maxPct}, result=${normalizedG < umbral ? 'bajoumbral' : 'ok'}`);
  }

  if (normalizedG < umbral) return { pct: 0, meta: "bajo_umbral" };
  const pct = minPct + (maxPct - minPct) * ((g - umbral) / (100 - umbral));
  return { pct: +pct.toFixed(4), meta: "lineal" };
}

export function bonoTramos({ global, tramos = [
  { gte: 0, pct: 0.00 },
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
