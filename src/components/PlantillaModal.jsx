// src/components/PlantillaModal.jsx
import { useMemo } from "react";
import FormularioObjetivos from "./FormularioObjetivos";
import FormularioAptitudes from "./FormularioAptitudes";

export default function PlantillaModal({
  isOpen,
  onClose,
  modalType,
  editing,
  onAfterSave,
  areas,
  sectores,
  empleados = [],
  scopeType,   // alcance activo del padre (opcional)
  scopeId,     // alcance id activo del padre (opcional)
  year,        // año activo del padre (opcional)
}) {
  if (!isOpen) return null;

  const initialYear = useMemo(() => editing?.year ?? year, [editing, year]);
  const initialScopeId = useMemo(() => editing?.scopeId ?? scopeId, [editing, scopeId]);
  const formKey = useMemo(() => editing?._id ?? `nuevo-${modalType}`, [editing, modalType]);

  const handleSaved = (saved, { keepOpen = false } = {}) => {
    onAfterSave?.(saved);        // el padre actualiza su estado local
    if (!keepOpen) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col relative animate-fadeIn overflow-hidden">
        {/* Header fijo */}
        <div className="flex-none p-6 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800">
            {editing ? "Editar Plantilla" : "Nueva Plantilla"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* Contenido flexible (Formulario maneja su scroll) */}
        <div className="flex-1 overflow-hidden">
          {modalType === "objetivo" && (
            <FormularioObjetivos
              key={formKey}
              // estado inicial
              initialData={editing ?? null}
              initialYear={initialYear}
              initialScopeType={editing?.scopeType ?? scopeType}
              initialScopeId={initialScopeId}
              // catálogos
              areas={areas}
              sectores={sectores}
              empleados={empleados}
              // callbacks
              onSaved={(saved) => handleSaved(saved, { keepOpen: false })}
              onSaveAndContinue={(saved) => handleSaved(saved, { keepOpen: true })}
              onCancelar={onClose}
            />
          )}

          {modalType === "aptitud" && (
            <FormularioAptitudes
              key={formKey}
              // algunos proyectos usan "datosIniciales" en lugar de "initialData"
              datosIniciales={editing ?? null}
              initialYear={initialYear}
              initialScopeType={editing?.scopeType ?? scopeType}
              initialScopeId={initialScopeId}
              // catálogos
              areas={areas}
              sectores={sectores}
              empleados={empleados}
              // callbacks
              onSaved={(saved) => handleSaved(saved, { keepOpen: false })}
              onSaveAndContinue={(saved) => handleSaved(saved, { keepOpen: true })}
              onCancelar={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
