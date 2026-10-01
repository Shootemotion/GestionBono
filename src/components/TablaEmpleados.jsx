// src/components/TablaEmpleados.jsx
import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/* ---------- UI helpers ---------- */
function Chip({ label, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{children ?? "—"}</span>
    </span>
  );
}

function Th({ children, className = "" }) {
  return (
    <th
      className={
        "sticky top-0 z-10 px-3 py-2 text-left text-[13px] font-semibold text-muted-foreground " +
        "bg-muted/40 first:rounded-tl-xl last:rounded-tr-xl " +
        className
      }
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={"px-3 py-2 align-middle text-sm " + className}>{children}</td>;
}

/* ---------- hooks ---------- */
function useOutsideClose(open, onClose, ...refs) {
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e) => {
      const hit = refs.some((r) => r.current && r.current.contains(e.target));
      if (!hit) onClose?.();
    };
    const handleKey = (e) => e.key === "Escape" && onClose?.();

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose, refs]);
}

/* ---------- Row (usa hooks aquí, no dentro del map) ---------- */
function EmpleadoRow({
  empleado,
  isOpen,
  onToggle,
  mostrarAcciones,
  onEditar,
  onEliminar,
}) {
  const rowRef = useRef(null);
  const anchorRef = useRef(null);
  const popRef = useRef(null);

  useOutsideClose(isOpen, () => onToggle(false), rowRef, popRef);

  const desvinculado = empleado.estadoLaboral === "DESVINCULADO";
  return (
    <tr
      ref={rowRef}
      className={
        "border-b border-border/60 hover:bg-muted/30 transition-colors cursor-pointer " +
        (desvinculado
          ? "bg-rose-50/40 text-slate-500"
          : "odd:bg-background even:bg-muted/20")
      }
      onClick={() => onToggle(!isOpen)}
    >
      {/* Nombre + ancla del popover */}
      <Td className="font-medium">
        <div ref={anchorRef} className="relative inline-block">
          {`${empleado.apellido}, ${empleado.nombre}`}
          {(empleado.apodo || empleado.Apodo) && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({empleado.apodo || empleado.Apodo})
            </span>
          )}
          {desvinculado && (
            <span className="ml-2 inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
              Desvinculado
            </span>
          )}

          {isOpen && (
            <div
              ref={popRef}
              className="absolute z-50 left-0 top-7 w-[640px] max-w-[calc(100vw-2rem)]
                         rounded-xl border bg-popover p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip label="Email">{empleado.email}</Chip>
                <Chip label="DNI">{empleado.dni}</Chip>
                <Chip label="CUIL">{empleado.cuil}</Chip>
                <Chip label="Ingreso">
                  {empleado.fechaIngreso
                    ? new Date(empleado.fechaIngreso).toLocaleDateString()
                    : "—"}
                </Chip>
                {empleado.telefono && <Chip label="Teléfono">{empleado.telefono}</Chip>}
                {empleado.CV && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-1 text-xs">
                    <span className="text-muted-foreground">CV:</span>
                    <a
                      href={empleado.CV}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      Ver
                    </a>
                  </span>
                )}
              </div>
              {/* flechita */}
              <div className="absolute -top-2 left-4 h-3 w-3 rotate-45 bg-popover border-l border-t" />
            </div>
          )}
        </div>
      </Td>

      <Td className="max-w-[280px] truncate">{empleado.puesto || "—"}</Td>
      <Td>{empleado.area?.nombre || "—"}</Td>
      <Td>{empleado.sector?.nombre || "—"}</Td>

      {mostrarAcciones && (
        <Td className="text-right">
          <div className="inline-flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="transition-transform hover:-translate-y-px hover:bg-blue-600 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onEditar(empleado);
              }}
            >
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 bg-red-50/60 transition hover:-translate-y-px hover:bg-red-600 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onEliminar(empleado._id);
              }}
            >
              Eliminar
            </Button>
          </div>
        </Td>
      )}
    </tr>
  );
}

/* ---------- Tabla ---------- */
export default function TablaEmpleados({
  empleados = [],
  onEliminar,
  onEditar,
  mostrarAcciones = false,
  empleadoExpandidoId,
  setEmpleadoExpandidoId,
}) {
  if (!empleados?.length) {
    return (
      <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        No hay empleados para mostrar.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr>
              <Th>Nombre Completo</Th>
              <Th className="min-w-[280px]">Puesto</Th>
              <Th>Área</Th>
              <Th>Sector</Th>
              {mostrarAcciones && <Th className="text-right">Acciones</Th>}
            </tr>
          </thead>

          <tbody>
            {empleados.map((empleado, idx) => (
              <EmpleadoRow
                key={empleado._id}
                empleado={empleado}
                isOpen={empleadoExpandidoId === empleado._id}
                onToggle={(val) =>
                  setEmpleadoExpandidoId(val ? empleado._id : null)
                }
                mostrarAcciones={mostrarAcciones}
                onEditar={onEditar}
                onEliminar={onEliminar}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
