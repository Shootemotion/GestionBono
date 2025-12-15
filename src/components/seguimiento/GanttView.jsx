import { useMemo, useState } from "react";

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
  }
};

function parsePeriodoToDate(periodoStr) {
  if (!periodoStr) return null;
  const mMatch = periodoStr.match(/^(\d{4})M(\d{1,2})$/i);
  if (mMatch) return new Date(Number(mMatch[1]), Number(mMatch[2]) - 1, 28);
  const qMatch = periodoStr.match(/^(\d{4})Q([1-4])$/i);
  if (qMatch) return new Date(Number(qMatch[1]), (Number(qMatch[2]) - 1) * 3 + 2, 28);
  const yMatch = periodoStr.match(/^(\d{4})$/);
  if (yMatch) return new Date(Number(yMatch[1]), 11, 31);
  const d = new Date(periodoStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getHybridStatus(hito, fechaRef, itemType) {
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

  // 1. Si ya tiene resultado cargado -> Completado
  if (hito?.actual !== null && hito?.actual !== undefined) {
    return "completado";
  }

  // 2. Si no tiene fecha ref, asumimos futuro
  if (!fechaRef) return "futuro";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ref = new Date(fechaRef);
  ref.setHours(23, 59, 59, 999);

  const diffMs = ref - hoy;
  const diffDays = Math.ceil(diffMs / MS_PER_DAY);

  // 3. Vencido
  if (diffDays < 0) return "vencido";

  // 4. Por vencer (próximos 7 días)
  if (diffDays <= 7) return "por_vencer";

  // 5. Borrador (si existe el hito pero no está completo)
  // Ignoramos MANAGER_DRAFT como estado de flujo, lo tratamos como borrador/en curso
  if (hito?.estado === "MANAGER_DRAFT") return "borrador";

  // 6. Futuro
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
  const currentYear = anio || new Date().getFullYear();
  const columns = useMemo(() => buildColumns(currentYear), [currentYear]);

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

          let fechaRef;
          let periodKey = hito.periodo;

          // Special handling for Feedback items (Shift to next month)
          if (item._tipo === "feedback") {
            let y = 0;
            let q = 0;
            let isFinal = false;

            const qMatch = hito.periodo.match(/^(\d{4})Q([1-4])$/i);
            const fMatch = hito.periodo.match(/^(\d{4})FINAL$/i);
            const simpleQMatch = hito.periodo.match(/^Q([1-4])$/i);
            const simpleFMatch = hito.periodo.match(/^FINAL$/i);

            if (qMatch) {
              y = parseInt(qMatch[1]);
              q = parseInt(qMatch[2]);
            } else if (fMatch) {
              y = parseInt(fMatch[1]);
              isFinal = true;
            } else if (simpleQMatch) {
              y = currentYear;
              q = parseInt(simpleQMatch[1]);
            } else if (simpleFMatch) {
              y = currentYear;
              isFinal = true;
            }

            if (q > 0) {
              // Q1 (Nov) -> Dec of SAME year (y)
              if (q === 1) {
                fechaRef = new Date(y, 11, 10); // Dec 10, Year y
                periodKey = `${y}M12`;
              } else if (q === 2) {
                // Q2 (Feb) -> Mar of NEXT year (y+1)
                fechaRef = new Date(y + 1, 2, 10); // Mar 10
                periodKey = `${y + 1}M03`;
              } else if (q === 3) {
                // Q3 (May) -> Jun of NEXT year (y+1)
                fechaRef = new Date(y + 1, 5, 10); // Jun 10
                periodKey = `${y + 1}M06`;
              }
            } else if (isFinal) {
              // Final (Aug) -> Sep of NEXT year (y+1)
              fechaRef = new Date(y + 1, 8, 10); // Sep 10
              periodKey = `${y + 1}M09`;
            }
          }

          if (!fechaRef) {
            fechaRef = hito.fecha
              ? new Date(hito.fecha)
              : parsePeriodoToDate(hito.periodo);
          }

          if (!periodKey || (item._tipo !== "feedback" && hito.fecha)) {
            if (hito.fecha) {
              const d = new Date(hito.fecha);
              const y = d.getUTCFullYear();
              const m = d.getUTCMonth() + 1;
              periodKey = `${y}M${String(m).padStart(2, "0")}`;
            }
          }

          const statusKey = getHybridStatus(hito, fechaRef, item._tipo);

          if (dueOnly && statusKey !== "vencido" && statusKey !== "por_vencer") return;

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
  }, [grouped, selectedEmpleadoId, dueOnly, ganttGrouping]);

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

            let maxItemsInCell = 0;
            Object.values(row.itemsByPeriod).forEach((arr) => {
              const uniqueEmps = new Set(arr.map((x) => x.empleado._id));
              maxItemsInCell = Math.max(maxItemsInCell, uniqueEmps.size);
            });
            const rowHeight = Math.max(50, maxItemsInCell * 24 + 16);

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

                    return (
                      <div
                        key={col.key}
                        className="w-[120px] flex-none border-l border-slate-100 p-1 flex flex-col gap-1"
                      >
                        {cellEmployees.map((cellEmp, idx) => (
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
          className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-3 w-64 text-xs pointer-events-none"
          style={{
            top: tooltipPos.y - 10,
            left: tooltipPos.x,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-bold text-slate-700 mb-1 border-b border-slate-100 pb-1 flex justify-between">
            <span>
              {hoverData.empleado.nombre} {hoverData.empleado.apellido}
            </span>
          </div>
          <div className="space-y-1 mt-2">
            {hoverData.items.map((it, i) => (
              <div key={i} className="flex items-start gap-1 text-slate-500">
                <span className="mt-1 text-[6px]">●</span>
                <span>{it.item.nombre}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center italic">
            Click para ver detalles
          </div>
        </div>
      )}
    </div>
  );
}