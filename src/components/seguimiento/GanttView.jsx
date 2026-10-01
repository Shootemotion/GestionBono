import { useMemo, useState } from "react";
import {
  getCurrentFiscalYear,
  parseFiscalPeriod,
  fiscalPeriodStatus,
} from "@/lib/fiscalYear";
import { mesesEnCiclo, esPeriodoAnteriorAlIngreso } from "../../../backend/src/lib/tiempoEfectivo.js";

// Cuántas personas se muestran por celda antes de plegar el resto.
// Cuatro entra cómodo en los 120 px de ancho de columna sin apilar de más.
const MAX_POR_CELDA = 4;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const STATUS_CONFIG = {
  vencido: {
    id: "vencido",
    label: "Vencido",
    color: "text-rose-700 bg-rose-50 border-rose-200",
    pill: "bg-rose-500",
    order: 1,
  },
  por_vencer: {
    id: "por_vencer",
    label: "Por Vencer",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    pill: "bg-amber-500",
    order: 2,
  },
  completado: {
    id: "completado",
    label: "Completado",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    pill: "bg-emerald-500",
    order: 6,
  },
  borrador: {
    id: "borrador",
    label: "Borrador",
    color: "text-slate-600 bg-slate-50 border-slate-200",
    pill: "bg-slate-400",
    order: 5,
  },
  futuro: {
    id: "futuro",
    label: "Futuro",
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
    pill: "bg-cyan-500",
    order: 7,
  },
  pendiente: { // Fallback
    id: "pendiente",
    label: "Pendiente",
    color: "text-slate-400 bg-slate-50 border-slate-200",
    pill: "bg-slate-300",
    order: 8,
  },
  // Nuevos estados Feedback
  enviado_empleado: {
    id: "enviado_empleado",
    label: "Enviado al empleado",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    pill: "bg-blue-500",
    order: 3,
  },
  enviado_rrhh: {
    id: "enviado_rrhh",
    label: "Enviado a RRHH",
    color: "text-purple-700 bg-purple-50 border-purple-200",
    pill: "bg-purple-500",
    order: 4,
  },
  finalizado: {
    id: "finalizado",
    label: "Finalizado",
    color: "text-emerald-800 bg-emerald-100 border-emerald-300",
    pill: "bg-emerald-600",
    order: 6, // Same as completado?
  },
  // Período anterior al ingreso de la persona, sin cargar. No es un pendiente:
  // no corresponde. Gris y al final, para que no compita con lo que sí hay que
  // hacer.
  no_aplica: {
    id: "no_aplica",
    label: "No aplica (previo al ingreso)",
    color: "text-slate-400 bg-slate-50 border-slate-200",
    pill: "bg-slate-300",
    order: 9,
  },
  // Período anterior al ingreso PERO con un resultado cargado. Es un error de
  // carga: se evaluó un mes en el que la persona no estaba.
  fuera_de_rango: {
    id: "fuera_de_rango",
    label: "Cargado antes del ingreso",
    color: "text-rose-700 bg-rose-100 border-rose-300",
    pill: "bg-rose-600",
    order: 0,
  }
};

/**
 * Estado de un hito que cae antes del ingreso de la persona.
 *
 * Son dos cosas distintas y conviene no mezclarlas:
 *
 *   · Sin dato  → "no_aplica". Hoy caía en "vencido" y se pintaba ROJO: el
 *     Gantt le reclamaba al referente una carga de un mes en el que la persona
 *     ni siquiera estaba en la empresa.
 *   · Con dato  → "fuera_de_rango". Hoy caía en "completado" y se pintaba
 *     VERDE, que es peor: un valor imposible pasaba por trabajo bien hecho.
 *
 * Devuelve null si el período sí le corresponde.
 */
function estadoPorIngreso(hito, emp, anioPlantilla) {
  if (!emp?.fechaIngreso || anioPlantilla === undefined || anioPlantilla === null) return null;
  const meses = mesesEnCiclo(emp.fechaIngreso, Number(anioPlantilla));
  if (!esPeriodoAnteriorAlIngreso(hito?.periodo, meses)) return null;

  const conDato = hito?.actual !== null && hito?.actual !== undefined;
  return conDato ? "fuera_de_rango" : "no_aplica";
}

function getHybridStatus(hito, fechaRef, itemType, rango) {
  // Lógica específica para Feedback
  if (itemType === "feedback") {
    if (hito?.estado === "SENT") return "enviado_empleado";
    if (hito?.estado === "PENDING_HR") return "enviado_rrhh";
    if (hito?.estado === "CLOSED") return "finalizado";

    // Logic for DRAFT in Feedback
    if (hito?.estado === "DRAFT" || !hito?.estado) {
      // El usuario quiere ver solo los estados del flujo (Borrador, Enviado..., Finalizado)
      // Incluso si está vencido, el estado es Borrador.
      return "borrador";
    }
  }

  // Lógica para Objetivos/Aptitudes (ya no usan flujo de envío)

  // 1. Prioridad: Estados explícitos de cierre (CERRADO / EVALUADO)
  //    Esto evita que un hit cerrado aparezca como vencido solo por fecha o falta de 'actual' numérica
  if (hito?.estado === "CLOSED" || hito?.estado === "CERRADO" || hito?.estado === "EVALUATED") {
    return "completado"; // O "finalizado" si se prefiere distincion
  }

  // 2. Si ya tiene resultado cargado -> Completado
  if (hito?.actual !== null && hito?.actual !== undefined) {
    return "completado";
  }

  // 3. Calendario fiscal: abierto desde que arranca el período hasta el plazo
  //    de carga (día 10 del mes siguiente al cierre). Antes se comparaba contra
  //    la fecha de INICIO, así que un trimestre se daba por vencido el día
  //    después de abrirse.
  if (rango) {
    const estado = fiscalPeriodStatus(rango);
    if (estado === "por_vencer" && hito?.estado === "MANAGER_DRAFT") return "borrador";
    return estado;
  }

  // 4. Sin período reconocible: ventana de 7 días sobre la fecha disponible
  if (!fechaRef) return "futuro";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ref = new Date(fechaRef);
  ref.setHours(23, 59, 59, 999);

  const diffDays = Math.ceil((ref - hoy) / MS_PER_DAY);

  if (diffDays < 0) return "vencido";
  if (diffDays <= 7) return "por_vencer";
  if (hito?.estado === "MANAGER_DRAFT") return "borrador";
  return "futuro";
}

function buildColumns(anio) {
  const cols = [];
  const startMonth = 9; // Septiembre
  for (let i = 0; i < 13; i++) { // 13 months to include September of next year
    let m = startMonth + i;
    let y = anio;
    if (m > 12) {
      m -= 12;
      y = anio + 1;
    }
    const mStr = String(m).padStart(2, "0");
    const label = new Date(y, m - 1, 1).toLocaleString("es-ES", { month: "short" });
    cols.push({ key: `${y}M${mStr}`, label: `${label} ${y}`, mes: m, year: y });
  }
  return cols;
}

export default function GanttView({
  grouped = [],
  anio,
  openHitoModal,
  dueOnly,
  selectedEmpleadoId,
  hideAreaGroup = false,
  ganttGrouping = "sector_estado" // "sector_estado" | "estado_sector"
}) {
  const currentYear = anio || getCurrentFiscalYear();
  const columns = useMemo(() => buildColumns(currentYear), [currentYear]);

  // Filas desplegadas a mano. El resto muestra las primeras personas y esconde
  // el resto detrás de un "+N más".
  const [filasAbiertas, setFilasAbiertas] = useState(() => new Set());
  const alternarFila = (clave) =>
    setFilasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const processedRows = useMemo(() => {
    const groupsMap = new Map();
    const seenIds = new Set();

    grouped.forEach((item) => {
      let itemEmployees = [];
      if (Array.isArray(item.empleados)) itemEmployees = item.empleados;
      else if (item.empleado) itemEmployees = [item.empleado];

      itemEmployees.forEach((emp) => {
        if (!emp || !emp._id) return;
        if (selectedEmpleadoId && String(emp._id) !== String(selectedEmpleadoId)) return;

        const areaName = emp.area?.nombre || "Sin Área";
        const sectorName = emp.sector?.nombre || "Sin Sector";

        (item.hitos || []).forEach((hito) => {
          const uniqueKey = `${item._id}-${emp._id}-${hito.periodo}`;
          if (seenIds.has(uniqueKey)) return;
          seenIds.add(uniqueKey);

          // El `periodo` del hito es el dato inequívoco (2026Q1, 2026M09…);
          // `hito.fecha` es solo el INICIO del período, no su vencimiento, así
          // que no sirve ni para ubicar la columna ni para decidir el estado.
          const rango = parseFiscalPeriod(hito.periodo, currentYear);

          let fechaRef = rango?.vencimiento ?? null;
          let periodKey = rango?.columna ?? null;

          if (!periodKey) {
            // Período no reconocido: caemos a la fecha cruda para no perder el hito.
            const d = hito.fecha ? new Date(hito.fecha) : null;
            if (d && !Number.isNaN(d.getTime())) {
              fechaRef = fechaRef ?? d;
              periodKey = `${d.getUTCFullYear()}M${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            } else {
              periodKey = hito.periodo;
            }
          }

          // Antes que nada: ¿este período es anterior a su ingreso? Si lo es,
          // ni "vencido" ni "completado" dicen la verdad.
          const statusKey =
            estadoPorIngreso(hito, emp, item.year ?? item.anio ?? currentYear)
            ?? getHybridStatus(hito, fechaRef, item._tipo, rango);

          // El filtro de "pendientes" muestra también los cargados fuera de rango:
          // son los que de verdad hay que ir a corregir.
          if (dueOnly && !["vencido", "por_vencer", "fuera_de_rango"].includes(statusKey)) return;

          // Determine group key based on ganttGrouping
          let groupKey;
          if (ganttGrouping === "estado_sector") {
            // Group by Status -> Sector (Area ignored or secondary)
            groupKey = `${statusKey}||${sectorName}||${areaName}`;
          } else {
            // Default: Area -> Sector -> Status (or Sector -> Status if Area hidden)
            groupKey = `${areaName}||${sectorName}||${statusKey}`;
          }

          if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
              id: groupKey,
              area: areaName,
              sector: sectorName,
              statusKey: statusKey,
              itemsByPeriod: {},
            });
          }

          const group = groupsMap.get(groupKey);

          if (!group.itemsByPeriod[periodKey]) group.itemsByPeriod[periodKey] = [];
          group.itemsByPeriod[periodKey].push({
            empleado: emp,
            item: item,
            hito: hito,
            statusKey: statusKey,
          });
        });
      });
    });

    let rows = Array.from(groupsMap.values());
    rows.sort((a, b) => {
      if (ganttGrouping === "estado_sector") {
        // Sort by Status Order first
        const orderA = STATUS_CONFIG[a.statusKey]?.order || 99;
        const orderB = STATUS_CONFIG[b.statusKey]?.order || 99;
        if (orderA !== orderB) return orderA - orderB;

        // Then by Sector
        if (a.sector !== b.sector) return a.sector.localeCompare(b.sector);

        // Then by Area
        return a.area.localeCompare(b.area);
      } else {
        // Default: Area -> Sector -> Status
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        if (a.sector !== b.sector) return a.sector.localeCompare(b.sector);
        const orderA = STATUS_CONFIG[a.statusKey]?.order || 99;
        const orderB = STATUS_CONFIG[b.statusKey]?.order || 99;
        return orderA - orderB;
      }
    });

    return rows;
  }, [grouped, selectedEmpleadoId, dueOnly, ganttGrouping, currentYear]);

  const [hoverData, setHoverData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e, data) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    setHoverData(data);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white text-xs">
      {/* Scroll único (horizontal + vertical) */}
      <div className="flex-1 overflow-x-auto overflow-y-auto pb-20">
        <div className="min-w-full">
          {/* HEADER sticky */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-20 shadow-sm">
            {/* Dynamic Headers based on grouping */}
            {ganttGrouping === "estado_sector" ? (
              <>
                <div className="w-32 shrink-0 px-3 py-3 font-bold text-slate-600">
                  Estado
                </div>
                <div className="w-40 shrink-0 px-3 py-3 font-bold text-slate-600 border-l border-slate-200">
                  Sector
                </div>
                {!hideAreaGroup && (
                  <div className="w-40 shrink-0 px-3 py-3 font-bold text-slate-600 border-l border-slate-200">
                    Área
                  </div>
                )}
              </>
            ) : (
              <>
                {!hideAreaGroup && (
                  <div className="w-40 shrink-0 px-3 py-3 font-bold text-slate-600">
                    Área
                  </div>
                )}
                <div className="w-40 shrink-0 px-3 py-3 font-bold text-slate-600 border-l border-slate-200">
                  Sector
                </div>
                <div className="w-32 shrink-0 px-3 py-3 font-bold text-slate-600 border-l border-slate-200">
                  Estado
                </div>
              </>
            )}

            {/* Bloque de meses: ancho = 12 * 120px */}
            <div className="flex">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="w-[120px] flex-none border-l border-slate-200 px-1 py-3 text-center font-medium text-slate-500 uppercase text-[10px] bg-slate-50"
                >
                  {col.label}
                </div>
              ))}
            </div>
          </div>

          {/* CUERPO */}
          {processedRows.length === 0 && (
            <div className="p-10 text-center text-slate-400 italic">
              No hay datos para mostrar con los filtros actuales.
            </div>
          )}

          {processedRows.map((row, index) => {
            const statusConfig =
              STATUS_CONFIG[row.statusKey] || STATUS_CONFIG.pendiente;

            const claveFila = row.key ?? index;
            const filaAbierta = filasAbiertas.has(claveFila);

            let maxItemsInCell = 0;
            Object.values(row.itemsByPeriod).forEach((arr) => {
              const uniqueEmps = new Set(arr.map((x) => x.empleado._id));
              maxItemsInCell = Math.max(maxItemsInCell, uniqueEmps.size);
            });
            // Plegada, la fila mide lo que ocupan las visibles más el "+N".
            const visiblesEnFila = filaAbierta
              ? maxItemsInCell
              : Math.min(maxItemsInCell, MAX_POR_CELDA) + (maxItemsInCell > MAX_POR_CELDA ? 1 : 0);
            const rowHeight = Math.max(50, visiblesEnFila * 24 + 16);

            // Visual Grouping Logic (Rowspan simulation)
            const prevRow = index > 0 ? processedRows[index - 1] : null;

            // Check if we should hide the label (visually merge)
            let hideAreaLabel = false;
            let hideSectorLabel = false;
            let hideStatusLabel = false;

            if (ganttGrouping === "estado_sector") {
              // Grouping: Status -> Sector -> Area
              if (prevRow && prevRow.statusKey === row.statusKey) {
                hideStatusLabel = true;
                if (prevRow.sector === row.sector) {
                  hideSectorLabel = true;
                  if (prevRow.area === row.area) {
                    hideAreaLabel = true;
                  }
                }
              }
            } else {
              // Grouping: Area -> Sector -> Status
              if (prevRow && prevRow.area === row.area) {
                hideAreaLabel = true;
                if (prevRow.sector === row.sector) {
                  hideSectorLabel = true;
                  // Status is usually the leaf, so we don't merge it unless we want to merge identical statuses in same sector?
                  // But typically we list all statuses. If we have duplicate statuses (impossible by map key), we'd merge.
                  // Here, status is the differentiator, so we show it.
                }
              }
            }

            return (
              <div
                key={row.id}
                className={`flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${
                  // Add top border if NOT merged, otherwise remove it to simulate merge? 
                  // Actually, we keep border-b on all rows, but maybe we can make the internal borders lighter?
                  ""
                  }`}
                style={{ minHeight: rowHeight }}
              >
                {/* Dynamic Columns based on grouping */}
                {ganttGrouping === "estado_sector" ? (
                  <>
                    <div className={`w-32 shrink-0 px-3 py-2 flex items-center border-r border-slate-100 ${hideStatusLabel ? "" : ""}`}>
                      {!hideStatusLabel && (
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-semibold border ${statusConfig.color} w-full text-center truncate shadow-sm`}
                        >
                          {statusConfig.label}
                        </span>
                      )}
                    </div>
                    <div className={`w-40 shrink-0 px-3 py-2 flex items-center border-r border-slate-100 text-slate-500 truncate ${hideSectorLabel ? "" : ""}`}>
                      {!hideSectorLabel && (
                        <span className="truncate" title={row.sector}>
                          {row.sector}
                        </span>
                      )}
                    </div>
                    {!hideAreaGroup && (
                      <div className={`w-40 shrink-0 px-3 py-2 flex items-center border-r border-slate-100 text-slate-600 font-medium truncate ${hideAreaLabel ? "" : ""}`}>
                        {!hideAreaLabel && (
                          <span className="truncate" title={row.area}>
                            {row.area}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!hideAreaGroup && (
                      <div className={`w-40 shrink-0 px-3 py-2 flex items-center border-r border-slate-100 text-slate-600 font-medium truncate ${hideAreaLabel ? "" : ""}`}>
                        {!hideAreaLabel && (
                          <span className="truncate" title={row.area}>
                            {row.area}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`w-40 shrink-0 px-3 py-2 flex items-center border-r border-slate-100 text-slate-500 truncate ${hideSectorLabel ? "" : ""}`}>
                      {!hideSectorLabel && (
                        <span className="truncate" title={row.sector}>
                          {row.sector}
                        </span>
                      )}
                    </div>
                    <div className="w-32 shrink-0 px-3 py-2 flex items-center border-r border-slate-100">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-semibold border ${statusConfig.color} w-full text-center truncate shadow-sm`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                  </>
                )}

                {/* Bloque de meses de la fila: misma estructura que el header */}
                <div className="flex h-full">
                  {columns.map((col) => {
                    const rawItems = row.itemsByPeriod[col.key] || [];
                    const empsInCell = new Map();
                    rawItems.forEach((ri) => {
                      if (!empsInCell.has(ri.empleado._id)) {
                        empsInCell.set(ri.empleado._id, {
                          empleado: ri.empleado,
                          items: [],
                        });
                      }
                      empsInCell.get(ri.empleado._id).items.push(ri);
                    });
                    const cellEmployees = Array.from(empsInCell.values());
                    // Se muestran las primeras y el resto detrás de un "+N".
                    // Un sector de 14 personas dibujaba 14 píldoras en cada una
                    // de las 12 columnas —168 para mostrar 14 nombres— y la fila
                    // medía 352 px de alto.
                    const visibles = filaAbierta ? cellEmployees : cellEmployees.slice(0, MAX_POR_CELDA);
                    const ocultos = cellEmployees.length - visibles.length;

                    return (
                      <div
                        key={col.key}
                        className="w-[120px] flex-none border-l border-slate-100 p-1 flex flex-col gap-1"
                      >
                        {visibles.map((cellEmp, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-1.5 px-1.5 py-1 rounded border shadow-sm cursor-pointer bg-white hover:bg-slate-50 transition-all ${statusConfig.color}`}
                            onClick={() => {
                              if (openHitoModal && cellEmp.items[0]) {
                                const first = cellEmp.items[0];
                                openHitoModal(
                                  first.item,
                                  [cellEmp.empleado],
                                  first.hito
                                );
                              }
                            }}
                            onMouseEnter={(e) =>
                              handleMouseEnter(e, {
                                ...cellEmp,
                                statusKey: row.statusKey,
                              })
                            }
                            onMouseLeave={() => setHoverData(null)}
                          >
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${statusConfig.pill}`}
                            >
                              {cellEmp.empleado.nombre?.charAt(0)}
                              {cellEmp.empleado.apellido?.charAt(0)}
                            </div>
                            <span className="truncate font-medium text-[10px]">
                              {cellEmp.empleado.nombre}{" "}
                              {cellEmp.empleado.apellido}
                            </span>
                            {cellEmp.items.length > 1 && (
                              <span className="text-[9px] opacity-70 ml-auto">
                                ({cellEmp.items.length})
                              </span>
                            )}
                          </div>
                        ))}

                        {ocultos > 0 && (
                          <button
                            onClick={() => alternarFila(row.key ?? index)}
                            className="px-1.5 py-1 rounded border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            title={`Ver las ${cellEmployees.length} personas de esta fila`}
                          >
                            +{ocultos} más
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hoverData && (
        <div
          className="fixed z-50 bg-white/95 backdrop-blur-sm border border-slate-200/60 shadow-2xl ring-1 ring-slate-900/5 rounded-xl w-72 text-sm pointer-events-none transition-all duration-200 ease-out"
          style={{
            top: tooltipPos.y - 12,
            left: tooltipPos.x,
            transform: "translate(-50%, -100%)",
          }}
        >
          {/* Header */}
          <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center justify-between rounded-t-xl backdrop-blur-md">
            <span className="font-bold text-slate-800">
              {hoverData.empleado.nombre} {hoverData.empleado.apellido}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_CONFIG[hoverData.statusKey]?.color || 'bg-slate-100 text-slate-500'
              }`}>
              {STATUS_CONFIG[hoverData.statusKey]?.label}
            </span>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            <div className="max-h-[300px] overflow-y-auto pr-1 relative custom-scrollbar">
              {(() => {
                const objetivos = hoverData.items.filter(it => it.item._tipo === 'objetivo' || it.item._tipo === 'meta' || (!it.item._tipo && it.item.peso !== undefined));
                const aptitudes = hoverData.items.filter(it => it.item._tipo === 'aptitud');
                const feedbacks = hoverData.items.filter(it => it.item._tipo === 'feedback');
                const otros = hoverData.items.filter(it => !objetivos.includes(it) && !aptitudes.includes(it) && !feedbacks.includes(it));

                const renderSection = (title, items, dotColor) => items.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                      {title} ({items.length})
                    </p>
                    <div className="space-y-1.5 pl-3">
                      {items.map((it, i) => (
                        <div key={i} className="flex items-start gap-2 group">
                          <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 group-hover:scale-125 transition-transform`} />
                          <span className="text-slate-600 font-medium leading-snug text-xs">
                            {it.item.nombre}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <div>
                    {renderSection('Objetivos', objetivos.length > 0 ? objetivos : otros, 'bg-blue-500')}
                    {renderSection('Competencias', aptitudes, 'bg-amber-500')}
                    {renderSection('Feedback', feedbacks, 'bg-purple-500')}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium tracking-wide">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"></div>
            Click para ver detalles
          </div>
        </div>
      )}
    </div>
  );
}