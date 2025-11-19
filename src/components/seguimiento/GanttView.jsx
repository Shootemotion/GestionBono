// src/components/seguimiento/GanttView.jsx
import { useMemo, useState } from "react";

/* ===================== columnas (fiscal Ago→Jul) ===================== */
function getColumns(anio, zoom = "mes") {
  const cols = [];
  if (zoom === "mes") {
    for (let i = 0; i < 12; i++) {
      const mes = (i + 8) % 12;                 // 8 = agosto
      const y = mes < 8 ? anio + 1 : anio;      // Ago..Dic -> anio ; Ene..Jul -> anio+1
      const start = new Date(y, mes, 1);
      const end = new Date(y, mes + 1, 0, 23, 59, 59, 999);
      cols.push({
        key: `m-${y}-${mes}`,
        label: new Date(y, mes).toLocaleString("es-AR", { month: "short", year: "2-digit" }),
        start, end,
      });
    }
  } else {
    // T1: Ago-Oct, T2: Nov-Ene, T3: Feb-Abr, T4: May-Jul (fiscal)
    const groups = [[7,8,9],[10,11,0],[1,2,3],[4,5,6]];
    groups.forEach((g, idx) => {
      const months = g.map(m => ({ m, y: m <= 6 ? anio + 1 : anio }));
      const start = new Date(months[0].y, months[0].m, 1);
      const end = new Date(months[2].y, months[2].m + 1, 0, 23, 59, 59, 999);
      cols.push({
        key: `t-${idx + 1}`,
        label: `T${idx + 1} ${String(end.getFullYear()).slice(-2)}`,
        start, end,
      });
    });
  }
  return cols;
}

/* ===== helpers metas (evita “12/24” inflados) ===== */
// Normaliza strings tipo "2025M11", "2025Q1", etc.


// --- Parseo de periodos tipo "2025M12", "2025Q1", "2025" (fiscal Ago→Jul) ---
const norm = (s) => String(s || "").trim().toUpperCase();
function parsePeriodo(p, fiscalStartMonth = 7 /* Ago=7 */) {
  const s = norm(p);
  // YYYYMn
  const mm = s.match(/^(\d{4})M(\d{1,2})$/);
  if (mm) {
    const y = +mm[1], m = +mm[2] - 1; // JS month 0-11
    const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { kind: "M", start, end, y, m, label: s };
  }
  // YYYYQn
  const qq = s.match(/^(\d{4})Q([1-4])$/);
  if (qq) {
     const y = +qq[1], q = +qq[2];
    // Fiscal: Q1= Ago-Oct, Q2= Nov-Ene, Q3= Feb-Abr, Q4= May-Jul
    const map = {1:[7,8,9], 2:[10,11,0], 3:[1,2,3], 4:[4,5,6]};
    const months = map[q].map(m => ({ m, y: m <= 6 ? y + 1 : y }));
    const start = new Date(months[0].y, months[0].m, 1, 0,0,0,0);
   const end   = new Date(months[2].y, months[2].m + 1, 0, 23,59,59,999);
    return { kind: "Q", start, end, y, q, label: s };
  }
  // YYYY (año fiscal Ago→Jul)
  const yy = s.match(/^(\d{4})$/);
  if (yy) {
     const y = +yy[1];
    const start = new Date(y, fiscalStartMonth, 1, 0,0,0,0);                 // Ago y
    const end   = new Date(y + 1, fiscalStartMonth, 0, 23,59,59,999);        // Fin Jul y+1
    return { kind: "Y", start, end, y, label: s };
  }
  return null;
}
// ===== frecuencia → período =====
function normFreq(f) {
  return String(f || "").trim().toLowerCase();
}
function freqMatchesPeriodo(freq, parsed) {
  const f = normFreq(freq);
  if (!parsed) return false;
  if (parsed.kind === "M") {
    // sólo metas mensuales matchean meses
    return ["m", "mensual", "mensuales", "monthly"].includes(f);
  }
  if (parsed.kind === "Q") {
    // sólo metas trimestrales matchean quarters
    return ["t", "trimestral", "trimestrales", "quarterly"].includes(f);
  }
  if (parsed.kind === "Y") {
    // sólo metas anuales matchean año fiscal
    return ["a", "anual", "anuales", "yearly", "anual_fiscal"].includes(f);
  }
  return false;
}
// Devuelve una fecha si la meta trae alguna pista
function dateFromMeta(m, item) {
   // aceptar camelCase, snake_case y lowercase
   const cand =
     m?.fecha ??
     m?.vencimiento ??
     m?.fechaLimite ?? m?.fechalimite ?? m?.fecha_limite ??
    m?.hito?.fecha ??
    // fallback a nivel objetivo (sirve para metas sin fecha)
    item?.fecha ?? item?.vencimiento ??
    item?.fechaLimite ?? item?.fechalimite ?? item?.fecha_limite;
   const d = cand ? new Date(cand) : null;
   return d && !isNaN(d?.getTime?.()) ? d : null;
 }
const metaKey = (m) =>
   [m?.nombre ?? m?.titulo ?? m?.descripcion ?? "", m?.unidad ?? "", m?.operador ?? "", m?.target ?? ""]
     .map(x => String(x ?? "").trim().toUpperCase()).join("¦");

 const isRealMeta = (m) =>
   !!((m?.nombre ?? m?.titulo ?? m?.descripcion)); // evita objetos-config vacíos
// Chequea si la meta aplica al periodo parseado



function metaMatchesPeriodo(m, parsed, item) {
  if (!parsed) return false;
  // 1) match directo por strings/arrays
  const mp  = norm(m?.periodo);
  const mps = Array.isArray(m?.periodos) ? m.periodos.map(norm) : [];
  const mhp = norm(m?.hito?.periodo);
 if (mp && (mp === parsed.label)) return true; // label viene normalizado
  if (mps.length && mps.includes(parsed.label)) return true;
  if (mhp && (mhp === parsed.label)) return true;
// 1.b) match por FRECUENCIA si no hay tag explícito
  if (!mp && !mps.length && !mhp) {
    if (freqMatchesPeriodo(m?.frecuencia, parsed)) return true;
  }
// ---- aliases sin año: "M12", "12", "Q1" ----
  if (parsed.kind === "M") {
    const monthNum = parsed.m + 1; // 1..12
    // "M12" o "12"
    if (/^M\d{1,2}$/.test(mp) && +mp.slice(1) === monthNum) return true;
    if (/^\d{1,2}$/.test(mp) && +mp === monthNum) return true;
  }
  if (parsed.kind === "Q") {
    const qAlias = mp.startsWith("Q") ? +mp.slice(1) : NaN;
    if (!Number.isNaN(qAlias) && qAlias === parsed.q) return true;
    // también permitimos número suelto como quarter
    if (/^[1-4]$/.test(mp) && +mp === parsed.q) return true;
  }
  if (parsed.kind === "Y" && (m?.anio || m?.year)) {
    const y = +(m.anio ?? m.year);
    if (y === parsed.y) return true;
  }

  // 3) por fecha única dentro del rango del periodo
const d = dateFromMeta(m, item);
  if (d && d >= parsed.start && d <= parsed.end) return true;

  // 4) por rango (desde/hasta)
  const desde = m?.desde ? new Date(m.desde) : null;
  const hasta = m?.hasta ? new Date(m.hasta) : null;
  if (desde && !isNaN(desde) && hasta && !isNaN(hasta)) {
    // overlap
    if (hasta >= parsed.start && desde <= parsed.end) return true;
  }
  return false;
}

const normPeriodo = (p) => String(p || "").trim().toUpperCase();

function metasCountForPeriodo(item, periodo) {
  if (!item || isAptitudItem(item)) return 0;
  const parsed = parsePeriodo(periodo);
  const metas =
    (Array.isArray(item?.metas) && item.metas) ||
    (Array.isArray(item?.rawItem?.metas) && item.rawItem.metas) ||
    (Array.isArray(item?.objetivo?.metas) && item.objetivo.metas) ||
    [];
  if (!metas.length) return 0;
  // ¿La data trae alguna pista de periodo/fecha en al menos una meta?
  const anyTagged = metas.some((m) =>
    m?.periodo || m?.periodos || m?.hito?.periodo ||
    m?.mes || m?.month || m?.monthIndex || m?.trimestre || m?.quarter ||
    m?.anio || m?.year ||
    m?.fecha || m?.vencimiento || m?.fechaLimite || m?.fechalimite || m?.fecha_limite ||
    m?.desde || m?.hasta
  );
 // Si ninguna meta está “tageada” por periodo, usamos el total (aplica en todo hito).
 if (!anyTagged) return null; // sin tag → no contamos en ese hito
  // Si hay tags, contamos solo las del periodo del hito.
  return metas.filter(m => metaMatchesPeriodo(m, parsed)).length;
}

 function metasForPeriodo(item, periodo) {
   if (!item || isAptitudItem(item)) return [];
   const parsed = parsePeriodo(periodo);
   let metas =
     (Array.isArray(item?.metas) && item.metas) ||
     (Array.isArray(item?.rawItem?.metas) && item.rawItem.metas) ||
     (Array.isArray(item?.objetivo?.metas) && item.objetivo.metas) ||
     [];
if (!metas.length) return [];
// 0) Meta “real” solamente
  metas = metas.filter(isRealMeta);
  if (!metas.length) return [];
   const anyTagged = metas.some((m) =>
     m?.periodo || m?.periodos || m?.hito?.periodo ||
     m?.mes || m?.month || m?.monthIndex || m?.trimestre || m?.quarter ||
     m?.anio || m?.year ||
     m?.fecha || m?.vencimiento || m?.fechaLimite || m?.fechalimite || m?.fecha_limite ||
     m?.desde || m?.hasta
   );

  // 1) Si NO hay tags, usamos FRECUENCIA como criterio de match por periodo.
  let filtered = [];
  if (!anyTagged) {
    filtered = metas.filter(m => freqMatchesPeriodo(m?.frecuencia, parsed));
    // si ni frecuencia coincide, último fallback: una sola meta “representativa” (no infla)
    if (!filtered.length) {
      const uniq = new Map();
      metas.forEach(m => { const k = metaKey(m); if (!uniq.has(k)) uniq.set(k, m); });
      return Array.from(uniq.values());
    }
  } else {
    // 2) Con tags/fechas, filtramos normalmente por período
    filtered = metas.filter(m => metaMatchesPeriodo(m, parsed, item));
  }



  const uniq = new Map();
  filtered.forEach(m => { const k = metaKey(m); if (!uniq.has(k)) uniq.set(k, m); });
  return Array.from(uniq.values());
 }

// ⚠️ Declarar ANTES que getMetasCount para evitar ReferenceError
const isAptitudItem = (it) => it?._tipo === "aptitud" || it?.tipo === "aptitud";
function getMetasCount(item) {
  if (isAptitudItem(item)) return 0;

  const src =
    (item?.rawItem && Array.isArray(item.rawItem.metas)) ? item.rawItem :
    (Array.isArray(item?.metas)) ? item :
    (item?.objetivo && Array.isArray(item.objetivo.metas)) ? item.objetivo :
    null;

  return Array.isArray(src?.metas) ? src.metas.length : 0;
}

/* ===== Leyenda de colores ===== */
function Legend() {
  const Dot = ({ cls }) => <span className={`inline-block w-3 h-3 rounded-full ${cls}`} />;
  return (
    <div className="flex items-center gap-4 px-3 py-2 text-xs text-slate-600 border-b border-slate-200 bg-slate-50/60">
      <span className="font-medium">Referencias:</span>
      <span className="inline-flex items-center gap-2"><Dot cls="bg-rose-500" /> Vencido</span>
      <span className="inline-flex items-center gap-2"><Dot cls="bg-amber-500" /> Próx. 7 días</span>
      <span className="inline-flex items-center gap-2"><Dot cls="bg-emerald-500" /> Futuro (&gt;7 días)</span>
    </div>
  );
}
function MetaList({ metas }) {
  const [open, setOpen] = useState(false);
  const visible = open ? metas : metas.slice(0, 5);
  return (
    <div className="text-[11px]">
      <div className="text-slate-500 mb-0.5">Metas del período:</div>
      {metas.length ? (
        <>
          <ul className="space-y-0.5 max-h-28 overflow-auto pr-1">
            {visible.map((m, idx) => {
              const tituloBase = m?.nombre ?? m?.titulo ?? m?.descripcion ?? m?.desc ?? "Meta";
              const f = m?.fecha || m?.vencimiento || m?.fechaLimite || m?.fechalimite || m?.fecha_limite;
              const fechaTxt = f ? ` — ${new Date(f).toLocaleDateString("es-AR")}` : "";
              const full = `${tituloBase}${fechaTxt}`;
              return (
                <li key={m?._id || idx} className="text-[12px] text-slate-600 leading-snug">
                  <span className="align-top">• </span>
                  <span
                    className="inline-block max-w-[240px] align-top break-words whitespace-normal"
                    title={full}
                  >
                    {full}
                  </span>
                </li>
              );
            })}
          </ul>
          {metas.length > 5 && (
            <button
              type="button"
              className="mt-1 text-[11px] text-indigo-600 hover:underline"
              onClick={() => setOpen(v => !v)}
            >
              {open ? "ver menos" : `ver ${metas.length - 5} más`}
            </button>
          )}
        </>
      ) : (
        <div className="text-[12px] text-slate-500">—</div>
      )}
    </div>
  );
}
/* ===== Modal: elegir objetivo/aptitud ===== */
function ObjectivePicker({ open, onClose, datos, onPick }) {
  if (!open) return null;
  const fecha = datos?.fecha ? new Date(datos.fecha).toLocaleDateString("es-AR") : "";
// Pills consistentes
  const Pill = ({ children, title }) => (
    <span title={title}
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5">
     {children}
    </span>
  );

  const MetaList = ({ metas }) => (
    <ul className="space-y-0.5 max-h-28 overflow-auto pr-1">
      {metas.slice(0, 8).map((m, i) => {
        const t = m?.nombre ?? m?.titulo ?? m?.descripcion ?? m?.desc ?? "Meta";
        return (
          <li key={m?._id ?? i} className="text-[12px] text-slate-700 leading-5">
            • <span className="break-words">{t}</span>
          </li>
        );
      })}
      {metas.length > 8 && (
        <li className="text-[11px] text-slate-500">… y {metas.length - 8} más</li>
      )}
    </ul>
  );
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white shadow-xl p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">
            Elegí el objetivo/aptitud — {datos?.periodo} · {fecha}
          </h3>
          <p className="text-xs text-slate-500">
            Se abrirá la evaluación; adentro elegís a quién evaluar.
          </p>
        </div>

        <ul className="space-y-3 max-h-[62vh] overflow-auto pr-1">
          {(datos?.objetivos || []).map((o, i) => {
             const peso = o.item?.pesoBase ?? o.item?.peso;
            const metasPeriodo = metasForPeriodo(o.item, datos?.periodo);
 const empleados = Array.isArray(o.empleados) ? o.empleados : [];
 const esAptitud = isAptitudItem(o.item);
            return (
   <li key={i}>
    <div className="rounded-xl border border-slate-200 bg-white/90 shadow-sm hover:shadow-md transition p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className={esAptitud ? "text-amber-600" : "text-indigo-600"}>{esAptitud ? "💡" : "🎯"}</span>

        <div className="min-w-0 flex-1">
          {/* Header: título  pills */}
          <div className="flex items-start gap-3">
            <h4 className="flex-1 font-semibold text-slate-900 leading-6 break-words">
              {o.nombre}
            </h4>
            <div className="shrink-0 flex items-center gap-1">
              <Pill title="Dirigido a"><span>👥</span>{empleados.length}</Pill>
              {peso != null && <Pill title="Peso"><span>⚖️</span>{peso}%</Pill>}
              {!esAptitud && (
                <Pill title="Metas en el período">
                  <span>📌</span>{metasPeriodo.length || 0} <span className="ml-0.5">metas</span>
                </Pill>
              )}
            </div>
          </div>

          {/* Body: dos columnas en desktop, apilado en mobile */}
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-[11px] text-slate-500 mb-1">Dirigido a:</div>
              <ul className="max-h-24 overflow-auto pr-1 space-y-0.5">
                {empleados.slice(0, 16).map((e) => (
                  <li key={e?._id} className="text-[12px] text-slate-700 leading-5">
                    • {`${e?.apellido || ""} ${e?.nombre || ""}`.trim() || "—"}
                  </li>
                ))}
                {empleados.length > 16 && (
                  <li className="text-[11px] text-slate-500">… y {empleados.length - 16} más</li>
                )}
              </ul>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Metas del período:</div>
              {esAptitud ? (
                <div className="text-[12px] text-slate-400">—</div>
              ) : metasPeriodo.length ? (
                <MetaList metas={metasPeriodo} />
              ) : (
                <div className="text-[12px] text-slate-500">—</div>
              )}
            </div>
          </div>

          {/* Footer: botón a la derecha, fijo */}
          <div className="mt-4 flex justify-end">
            <button
              className="text-xs rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 active:scale-[0.98] transition"
              onClick={() => onPick(o.item, empleados)}
            >
              Evaluar
            </button>
          </div>
        </div>
      </div>
    </div>
  </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-end">
          <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}


/* ===================== Componente ===================== */
export default function GanttView({

grouped = [], 
  filtered, tipoFiltro,  // legacy
  anio, zoom = "mes",
  openHitoModal,         // (item, empleados, hito)
  dueOnly = false,
}) {

  // 👇 modo de agrupación actual (lo trae groupItems)
  const groupMode = grouped[0]?.kind || "item";

  // 👇 cómo mostramos el/los empleados cuando agrupamos por Objetivo/Aptitud
  const empleadosLabel = (g) => {
    const arr = Array.from(g.empleados?.values?.() || []);
    if (!arr.length) return "—";

    if (arr.length === 1) {
      const e = arr[0];
      const nombre =
        `${e.apellido || ""} ${e.nombre || ""}`.trim() ||
        e.email ||
        "—";
      return nombre;
    }

    const first = arr[0];
    const baseNombre =
      `${first.apellido || ""} ${first.nombre || ""}`.trim() ||
      first.email ||
      "—";

    const extra = arr.length - 1;
    // Ej: "Pérez, Juan +3"
    return `${baseNombre} +${extra}`;
  };
  const usingGrouped = Array.isArray(grouped);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerData, setPickerData] = useState(null); // { periodo, fecha, objetivos:[{nombre,tipo,item,empleados[]}] }
  const cols = useMemo(() => getColumns(anio, zoom), [anio, zoom]);

  // helpers vencimiento
  const isDue = (fecha) => {
    const f = new Date(fecha);
    const diff = (f - new Date()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "past";
    if (diff <= 7) return "soon";
    return "future";
  };
  const chipColor = (fecha) => {
    const t = isDue(fecha);
    if (t === "past") return "bg-rose-500";
    if (t === "soon") return "bg-amber-500";
    return "bg-emerald-500";
  };
  const isQuarterPeriodo = (p) => /^\d{4}Q\d$/i.test(String(p || ""));

  // ========== Construcción de filas ========== //
  let rowsToRender = [];

  if (usingGrouped) {
    rowsToRender = grouped.map((g) => {
      const bucket = new Map(); // key -> {periodo, fecha, objetivos: Map(itemId -> {...})}

      (g.items || []).forEach((it) => {
        (it.hitos || []).forEach((h) => {
          if (dueOnly) {
            const tag = isDue(h.fecha);
            if (!(tag === "past" || tag === "soon")) return;
          }

          const d = new Date(h.fecha);
          // 🔑 Para trimestres colapsamos por periodo (e.g. 2025Q1)
          // Para meses seguimos distinguiendo por día.
          const key = isQuarterPeriodo(h.periodo)
            ? String(h.periodo)
            : `${h.periodo}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

          if (!bucket.has(key)) {
            bucket.set(key, {
              periodo: h.periodo,
              fecha: h.fecha,            // la primera que llegue nos sirve para ordenar/tooltip
              objetivos: new Map(),      // itemId -> { nombre, tipo, item, empleados:Set }
            });
          }

          const b = bucket.get(key);
          const itemId = String(it._id);

          if (!b.objetivos.has(itemId)) {
            b.objetivos.set(itemId, {
              nombre: it.nombre,
              tipo: it._tipo,
              item: it.rawItem || it,
              empleados: new Map(),
            });
          }
     const entry = b.objetivos.get(itemId);

// Normalizamos empleados: soportar it.empleados (array), it.empleado (uno solo)
// y como último fallback, los empleados del grupo g (por si vienen sólo ahí).
let empleadosSrc = [];

if (Array.isArray(it.empleados)) {
  empleadosSrc = it.empleados;
} else if (it.empleado) {
  empleadosSrc = [it.empleado];
}

// Fallback: si el item no trae empleados pero el grupo sí los tiene asociados
if ((!empleadosSrc || empleadosSrc.length === 0) && g.empleados && typeof g.empleados.values === "function") {
  empleadosSrc = Array.from(g.empleados.values());
}

(empleadosSrc || []).forEach((e) => {
  if (e?._id) {
    entry.empleados.set(String(e._id), e);
  }
});

        });
      });

      const hits = Array.from(bucket.values()).map((b) => {
        const objetivosArr = Array.from(b.objetivos.values()).map(v => ({
          nombre: v.nombre,
          tipo: v.tipo,
          item: v.item,
          empleados: Array.from(v.empleados.values()),
        }));
        return { hito: { periodo: b.periodo, fecha: b.fecha }, objetivos: objetivosArr };
      });

      return {
        _rowKey: g.key,
        title: g.title,
        kind: g.kind || null, // "area" | "sector" | "empleado" | null
        empleados: g.empleados, // Map de empleados para la columna Empleado(s)
        uniformTipo:
          new Set((g.items || []).map((it) => it._tipo)).size === 1
            ? (g.items?.[0]?._tipo ?? null)
            : null,
        hits,
      };
    });
  } else {
    // Legacy (por si aún lo usás en alguna vista)
    const byItem = new Map();
    const src = Array.isArray(filtered) ? filtered : [];
    src.forEach((r) => {
      const pack = [
        ...(tipoFiltro !== "aptitud"
          ? (r.objetivos?.items ?? []).map((i) => ({ ...i, _tipo: "objetivo" }))
          : []),
        ...(tipoFiltro !== "objetivo"
          ? (r.aptitudes?.items ?? []).map((i) => ({ ...i, _tipo: "aptitud" }))
          : []),
      ];
      pack.forEach((it) => {
        if (!byItem.has(it._id)) byItem.set(it._id, it);
      });
    });

    rowsToRender = Array.from(byItem.values()).map((it) => ({
      _rowKey: it._id,
      title: it.nombre,
      uniformTipo: it._tipo,
      hits: (it.hitos ?? []).map((h) => ({
        hito: h,
        objetivos: [{ nombre: it.nombre, tipo: it._tipo, item: it, empleados: [] }],
      })),
    }));

  }
// ===== ORDEN: agrupar visualmente por empleado cuando estamos en "Objetivo/Aptitud" =====
  if (usingGrouped) {
    if (groupMode === "item") {
      const empName = (row) => (empleadosLabel(row) || "").toLowerCase();
      rowsToRender.sort((a, b) => {
        const ea = empName(a);
        const eb = empName(b);
        if (ea !== eb) return ea.localeCompare(eb, "es");
        return (a.title || "").localeCompare(b.title || "", "es");
      });
    } else {
      // para los otros modos (empleado/área/sector) ordenamos por título
      rowsToRender.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "es")
      );
    }
  } else {
    // legacy sin "grouped"
    rowsToRender.sort((a, b) =>
      (a.title || "").localeCompare(b.title || "", "es")
    );
  }
  // ====== títulos e iconos uniformes ======
  const cleanTitle = (t) => (t || "").replace(/^[🎯💡🏢🧩👤]\s*/, "");
const firstColTitle =
    groupMode === "empleado"
      ? "Empleado"
      : groupMode === "area"
      ? "Área"
      : groupMode === "sector"
      ? "Sector"
      : "Objetivo / Aptitud / Grupo";
  return (
    <div className="overflow-x-auto">
      <Legend />

      <table className="w-full text-sm border-collapse">
       <thead>
  <tr>
    {groupMode === "item" && (
      <th className="w-56 px-3 py-2 text-left text-xs font-semibold text-slate-500 border-b bg-slate-50">
        Empleado(s)
      </th>
    )}

     <th className="w-80 px-3 py-2 text-left text-xs font-semibold text-slate-500 border-b bg-slate-50">
     {firstColTitle}
    </th>

    {cols.map((c) => (
      <th
        key={c.key}
        className="px-3 py-2 text-center text-xs font-semibold text-slate-500 border-b bg-slate-50"
      >
        {c.label}
      </th>
    ))}
  </tr>
</thead>

        <tbody className="divide-y divide-slate-100">
          {rowsToRender.map((row) => {
            const titleText = cleanTitle(row.title);
            const icon =
              row?.kind === "area"     ? "🏢" :
              row?.kind === "sector"   ? "🧩" :
              row?.kind === "empleado" ? "👤" :
              (row.uniformTipo === "objetivo" ? "🎯" : "💡");
            const iconCls =
              row?.kind ? "text-slate-500" :
              (row.uniformTipo === "objetivo" ? "text-indigo-600" : "text-amber-600");

            return (
              <tr key={row._rowKey} className="odd:bg-white even:bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  {groupMode === "item" && (
         <td className="px-3 py-2 text-sm border-b align-top whitespace-nowrap">
           {empleadosLabel(row)}
         </td>
       )}
                <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                  <div className="inline-flex items-center gap-1 font-medium text-slate-800" title={titleText}>
                    <span className={iconCls}>{icon}</span>
                    <span className="truncate max-w-[32rem]">{titleText}</span>
                  </div>
                </td>

                {cols.map((c) => {
                  // Sólo mostrar hitos cuya fecha caiga dentro de la ventana fiscal del header
                  const hits = (row.hits ?? []).filter(({ hito }) => {
                    const f = new Date(hito.fecha);
                    return f >= c.start && f <= c.end;
                  });

                  return (
                    <td
                      key={`${row._rowKey}-${c.key}`}
                      className="min-w-[7.5rem] w-32 px-2 py-2 text-center align-middle border-l border-slate-200"
                    >
                      {hits.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {hits.map(({ hito, objetivos }, j) => {
                            if (dueOnly) {
                              const t = isDue(hito.fecha);
                              if (!(t === "past" || t === "soon")) return null;
                            }
                            const cls = chipColor(hito.fecha);
                            const objetivosCount = objetivos.length;
                            const showCount = row.uniformTipo ? null : `${objetivosCount} obj`; // si es item puro, oculto contador

                     const tooltipList = objetivos
  .slice(0, 6)
   .map((o) => {
     const esApt = isAptitudItem(o.item);
     if (esApt) return `💡 ${o.nombre} · 👥 ${o.empleados?.length ?? 0}`;
     const metas = metasForPeriodo(o.item, hito.periodo);
     const metasTxt = metas.length
       ? metas.slice(0, 6).map((m) =>
           (m?.nombre ?? m?.titulo ?? m?.descripcion ?? "Meta")
         ).join("\n   - ")
       : "—";
     return `🎯 ${o.nombre} · 👥 ${o.empleados?.length ?? 0}\n   Metas:\n   - ${metasTxt}`;
   })
   .join("\n\n") || "—";
                            const extra = objetivosCount > 6 ? `\n… y ${objetivosCount - 6} más` : "";
                            const goDirect = objetivosCount === 1;

                            return (
                              <button
                                key={`${row._rowKey}-${c.key}-${j}`}
                                onClick={() => {
                                  if (goDirect) {
                                    const o = objetivos[0];
                                    openHitoModal?.(o.item, o.empleados || [], hito);
                                  } else {
                                    setPickerData({ periodo: hito.periodo, fecha: hito.fecha, objetivos });
                                    setPickerOpen(true);
                                  }
                                }}
            className={`px-2 py-0.5 rounded-full text-[11px] leading-5 text-white ${cls}
   transition-all duration-150
   hover:scale-[1.18] hover:shadow-[0_6px_18px_rgba(0,0,0,0.25)]
   hover:ring-2 hover:ring-white/70 hover:ring-offset-2 hover:ring-offset-slate-300
   active:scale-[0.94]
   max-w-[11.5rem] overflow-hidden text-ellipsis`}
                                title={`${hito.periodo}${objetivosCount>1 ? ` • ${objetivosCount} objetivos` : ""}\n\n${tooltipList}${extra}\n\nClick para ${goDirect ? "evaluar" : "elegir objetivo"}`}
                              >
                                {hito.periodo}
                                {showCount && (
                                  <span className="ml-1 inline-block rounded-full bg-white/20 px-1.5 text-[10px]">
                                    {showCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}

    {rowsToRender.length === 0 && (
           <tr>
              <td
                className="text-center text-sm text-slate-500 py-12"
                colSpan={1 + cols.length + (groupMode === "item" ? 1 : 0)}
              >
                Sin resultados con los filtros actuales.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ObjectivePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        datos={pickerData || { periodo: "", fecha: "", objetivos: [] }}
        onPick={(item, empleados) => {
          if (pickerData) openHitoModal?.(item, empleados || [], { periodo: pickerData.periodo, fecha: pickerData.fecha });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
