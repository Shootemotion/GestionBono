import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, FileEdit, Send, Users, CheckCircle, Calendar, 
  Hourglass, CheckCircle2, MessageSquare, UserCircle2 
} from "lucide-react";

// You can extract StatusBadge here or keep it in the main if you pass it or import it.
// We'll import StatusBadge if we extract it, or just pass it as a prop for now.
// For simplicity, we can pass StatusBadge as a prop or redefine/export it from a shared file.
// Since StatusBadge is a simple UI helper, let's copy it here for self-containment, 
// or I can import it if I put it in a shared file. Let's just define it here to keep things simple.
const StatusBadge = ({ status }) => {
  const styles = {
    "SENT": "bg-blue-50 text-blue-700 border-blue-200",
    "REALIZADO": "bg-blue-50 text-blue-700 border-blue-200",
    "PENDING_HR": "bg-purple-50 text-purple-700 border-purple-200",
    "ACKNOWLEDGED": "bg-purple-50 text-purple-700 border-purple-200",
    "CLOSED": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "SYSTEM_CLOSED": "bg-slate-100 text-slate-600 border-slate-300",
    "PENDIENTE": "bg-amber-50 text-amber-700 border-amber-200",
    "DRAFT": "bg-amber-50 text-amber-700 border-amber-200",
    "VENCIDO": "bg-rose-50 text-rose-700 border-rose-200",
    "FUTURO": "bg-slate-50 text-slate-400 border-slate-200",
    "ACTUAL": "bg-blue-50 text-blue-700 border-blue-200"
  };

  const labels = {
    "SENT": "Enviado al empleado",
    "REALIZADO": "Enviado al empleado",
    "PENDING_HR": "Enviado a RRHH",
    "ACKNOWLEDGED": "Enviado a RRHH",
    "CLOSED": "Finalizado",
    "SYSTEM_CLOSED": "Cerrado por Sistema",
    "PENDIENTE": "Borrador",
    "DRAFT": "Borrador",
    "VENCIDO": "Vencido",
    "FUTURO": "Futuro",
    "ACTUAL": "En Curso"
  };

  return (
    <Badge variant="outline" className={`${styles[status] || styles["PENDIENTE"]} font-medium`}>
      {labels[status] || "Pendiente"}
    </Badge>
  );
};

export const FeedbackStatusPanel = ({
  selectedFeedback,
  timelineItems,
  evaluatorName
}) => {
  return (
    <>
      {/* VERTICAL FLOW STATUS (Redesigned) */}
      {selectedFeedback && !selectedFeedback.isPlaceholder && (
        <div className="lg:hidden bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 shadow-sm transition-all animate-in slide-in-from-left-2 mt-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Estado del Proceso
            </div>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black tracking-wide">
              {selectedFeedback.periodo}
            </span>
          </h3>

          <div className="relative pl-1">
            {/* Vertical Line */}
            <div className="absolute left-[14px] top-3 bottom-4 w-0.5 bg-slate-100 -z-0"></div>

            <div className="space-y-8 relative z-10">
              {[
                { label: "Borrador Inicia", status: "DRAFT", date: selectedFeedback.createdAt, icon: FileEdit, deadlineKey: "manager" },
                { label: "Enviado a Vos", status: "SENT", date: selectedFeedback.submittedToEmployeeAt, icon: Send, deadlineKey: "employee" },
                { label: "Tu Respuesta", status: "PENDING_HR", date: selectedFeedback.empleadoAck?.fecha, icon: Users, deadlineKey: "employee" },
                { label: "Cierre Final", status: "CLOSED", date: selectedFeedback.closedAt, icon: CheckCircle, deadlineKey: null }
              ].map((step, idx) => {
                const order = { "DRAFT": 0, "SENT": 1, "PENDING_HR": 2, "CLOSED": 3 };
                const currentStep = order[selectedFeedback.estado] ?? 0;
                const isCompleted = idx <= currentStep;
                const isCurrent = idx === currentStep;
                const Icon = step.icon;

                // Get deadline info
                const periodItem = timelineItems.find(t => t.id === selectedFeedback.periodo);
                let deadlineRange = step.deadlineKey && periodItem ? periodItem.deadlines[step.deadlineKey] : null;

                // Dynamic Deadline for Employee Response
                if (step.deadlineKey === "employee" && selectedFeedback.submittedToEmployeeAt) {
                  const submissionDate = new Date(selectedFeedback.submittedToEmployeeAt);
                  const dynamicDeadline = new Date(submissionDate);
                  dynamicDeadline.setDate(dynamicDeadline.getDate() + 5);
                  deadlineRange = dynamicDeadline.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
                }

                return (
                  <div key={idx} className={`flex gap-4 group ${isCompleted ? 'opacity-100' : 'opacity-60'}`}>
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-sm
                      ${isCompleted ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200' : 'bg-white border-slate-200 text-slate-300'}
                      ${isCurrent ? 'ring-2 ring-blue-100 ring-offset-2' : ''}
                    `}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className={`text-sm font-bold leading-none mb-1 transition-colors ${isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                        {step.label}
                      </div>

                      {/* Date Logic */}
                      {step.date && isCompleted ? (
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-300" />
                          {new Date(step.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </div>
                      ) : !isCompleted && deadlineRange ? (
                        <div className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 w-fit mt-1 flex items-center gap-1">
                          <Hourglass className="w-3 h-3" />
                          Vence: {deadlineRange}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-300 italic mt-1">Pendiente</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}



      {selectedFeedback ? (
        <div className="space-y-6">
          {/* Header Feedback */}
          <div id="tour-feedback-status" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                  <MessageSquare className="w-6 h-6 text-blue-600" />
                  Feedback {selectedFeedback.periodo}
                </h2>
                <div className="flex flex-col mt-1 ml-9">
                  <span className="text-sm text-slate-500">
                    {selectedFeedback.isPlaceholder
                      ? "Este periodo aún no ha sido evaluado."
                      : `Recibido el ${selectedFeedback.submittedToEmployeeAt ? new Date(selectedFeedback.submittedToEmployeeAt).toLocaleDateString() : "—"}`
                    }
                  </span>
                  {!selectedFeedback.isPlaceholder && (
                    <span className="text-xs font-bold text-slate-400 uppercase mt-1">
                      Evaluado por: <span className="text-slate-600">{evaluatorName}</span>
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={(() => {
                if (selectedFeedback.estado !== "DRAFT" && selectedFeedback.estado !== "PENDIENTE" && !selectedFeedback.isPlaceholder) {
                  return selectedFeedback.estado;
                }

                const item = timelineItems.find(t => t.id === selectedFeedback.periodo);
                if (!item) return "PENDIENTE";

                const now = new Date();
                const startDate = new Date(item.date);

                const workStartDate = new Date(startDate);
                workStartDate.setMonth(workStartDate.getMonth() - 3);

                const deadline = new Date(startDate);
                deadline.setMonth(deadline.getMonth() + 2);

                if (now > deadline) return "VENCIDO";
                if (now >= workStartDate) return "ACTUAL";

                return "FUTURO";
              })()} />
            </div>

            {!selectedFeedback.isPlaceholder && (
              <div className="bg-slate-50/80 p-6 rounded-xl border border-slate-200/60">
                <label className="text-xs font-bold text-blue-600 uppercase mb-3 block flex items-center gap-2">
                  <UserCircle2 className="w-4 h-4" /> Comentarios del Líder
                </label>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedFeedback.comentario || "Sin comentarios."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
};
