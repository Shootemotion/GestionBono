// src/components/HistorialEvaluacion.jsx
import React from "react";

function formatearFecha(fecha) {
  if (!fecha) return "Sin fecha";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "Fecha inválida";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelEvento(item) {
  const raw = (item.action || item.estado || "").toUpperCase();

  switch (raw) {
    case "CREATE":
      return "Creación de la evaluación";
    case "MANAGER_EDIT":
      return "Edición del jefe";
    case "MANAGER_SUBMIT":
      return "Envío del jefe al colaborador";
    case "EMPLOYEE_ACK":
      return "El colaborador está de acuerdo";
    case "EMPLOYEE_CONTEST":
      return "El colaborador está en desacuerdo";
    case "SUBMIT_HR":
      return "Envío a RRHH";
    case "HR_CLOSE":
    case "HR_CLOSE_BULK":
      return "Cierre por RRHH";
    case "REOPEN":
      return "Reapertura de la evaluación";

    // Fallbacks que armaste en MiDesempeno
    case "COMENTARIO-COLABORADOR":
      return "Comentario del colaborador";
    case "COMENTARIO-JEFE":
      return "Comentario del jefe";

    default:
      return raw || "Evento";
  }
}

export default function HistorialEvaluacion({ trazabilidad = [] }) {
  const items = Array.isArray(trazabilidad) ? trazabilidad : [];

  if (!items.length) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Sin movimientos registrados para esta evaluación.
      </div>
    );
  }

  // Normalizo y ordeno por fecha
  const normalizados = items
    .map((it, idx) => ({
      id: it._id || idx,
      fecha: it.at || it.fecha || null,
      raw: it,
    }))
    .sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0;
      const db = b.fecha ? new Date(b.fecha).getTime() : 0;
      return da - db;
    });

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-2 pb-1 border-b border-border/60">
        <h3 className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200 uppercase">
          Historial de la evaluación
        </h3>
      </div>

      <div className="p-3 space-y-3 max-h-[480px] overflow-auto">
        {normalizados.map(({ id, fecha, raw }, idx) => {
          const titulo = labelEvento(raw);
          const comentario = raw.comentario || raw.note || "";
          const esComentarioColab =
            (raw.estado || "").toUpperCase() === "COMENTARIO-COLABORADOR";

          return (
            <div
              key={id}
              className="relative pl-4 border-l border-slate-200 dark:border-slate-700 pb-3 last:pb-0"
            >
              {/* Punto en la línea de tiempo */}
              <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500 shadow-sm" />

              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  {titulo}
                </div>
                <div className="text-[10px] text-slate-500">
                  {formatearFecha(fecha)}
                </div>
              </div>

              {comentario && (
                <div
                  className={`mt-1 text-[11px] leading-snug whitespace-pre-wrap ${
                    esComentarioColab
                      ? "text-slate-800 bg-indigo-50/80 dark:bg-indigo-900/40 dark:text-slate-100 rounded-md px-2 py-1"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {comentario}
                </div>
              )}

              {/* Mini-tag abajo si viene con action/estado crudo */}
              {(raw.action || raw.estado) && (
                <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-400">
                  {(raw.action || raw.estado || "").toString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
