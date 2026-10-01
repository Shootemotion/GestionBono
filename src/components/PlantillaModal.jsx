// src/components/PlantillaModal.jsx
import { useMemo, useEffect } from "react";
import { X, Target, Sparkles } from "lucide-react";
import FormularioObjetivos from "./FormularioObjetivos";
import FormularioObjetivosLegacy from "./FormularioObjetivos.legacy";
import FormularioAptitudes from "./FormularioAptitudes";

// 🔁 Interruptor de rediseño. Poner en false para volver al formulario anterior
//    (src/components/FormularioObjetivos.legacy.jsx), que quedó intacto.
//    Cuando se decida cuál queda, borrar el archivo que sobre y este flag.
const USAR_FORM_REDISENADO = true;

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
  // Cerrar con Escape. El hook va antes del early return para no romper el orden.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const initialYear = useMemo(() => editing?.year ?? year, [editing, year]);
  const initialScopeId = useMemo(() => editing?.scopeId ?? scopeId, [editing, scopeId]);
  const formKey = useMemo(() => editing?._id ?? `nuevo-${modalType}`, [editing, modalType]);

  if (!isOpen) return null;

  const handleSaved = (saved, { keepOpen = false } = {}) => {
    onAfterSave?.(saved);        // el padre actualiza su estado local
    if (!keepOpen) onClose();
  };

  const esObjetivo = modalType === "objetivo";
  const Icono = esObjetivo ? Target : Sparkles;
  const FormObjetivos = USAR_FORM_REDISENADO ? FormularioObjetivos : FormularioObjetivosLegacy;

  const propsComunes = {
    key: formKey,
    initialYear,
    initialScopeType: editing?.scopeType ?? scopeType,
    initialScopeId,
    areas,
    sectores,
    empleados,
    onSaved: (saved) => handleSaved(saved, { keepOpen: false }),
    onSaveAndContinue: (saved) => handleSaved(saved, { keepOpen: true }),
    onCancelar: onClose,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plantilla-modal-titulo"
    >
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 w-full max-w-5xl h-[92vh] flex flex-col relative animate-fadeIn overflow-hidden">
        {/* Header fijo */}
        <div className="flex-none px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`grid place-items-center h-9 w-9 shrink-0 rounded-xl ${
                esObjetivo ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
              }`}
            >
              <Icono className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="plantilla-modal-titulo"
                className="text-base font-semibold text-slate-900 leading-tight truncate"
              >
                {editing ? "Editar plantilla" : "Nueva plantilla"}
                <span className="text-slate-400 font-normal">
                  {" · "}{esObjetivo ? "Objetivo" : "Competencia"}
                </span>
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {editing?.nombre
                  ? editing.nombre
                  : "Definí qué se mide y con qué regla se evalúa."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido flexible (el formulario maneja su propio scroll) */}
        <div className="flex-1 overflow-hidden bg-slate-50/60">
          {esObjetivo && <FormObjetivos {...propsComunes} initialData={editing ?? null} />}

          {modalType === "aptitud" && (
            // algunos proyectos usan "datosIniciales" en lugar de "initialData"
            <FormularioAptitudes {...propsComunes} datosIniciales={editing ?? null} />
          )}
        </div>
      </div>
    </div>
  );
}
