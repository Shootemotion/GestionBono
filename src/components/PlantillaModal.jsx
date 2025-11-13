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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 relative animate-fadeIn">
        {/* Cerrar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          aria-label="Cerrar"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold mb-4">
          {editing ? "Editar Plantilla" : "Nueva Plantilla"}
        </h2>

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
  );
}
