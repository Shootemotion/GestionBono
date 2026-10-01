// src/pages/RRHHEvaluaciones.jsx
import RRHHFeedbackClosing from "@/components/RRHHFeedbackClosing";
import ExportarResultados from "@/components/ExportarResultados";

export default function RRHHEvaluaciones() {
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Cierre de Feedback Trimestrales</h1>
      <ExportarResultados />
      <RRHHFeedbackClosing />
    </div>
  );
}
