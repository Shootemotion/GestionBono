// src/components/Footer.jsx
import { useState } from "react";
import {
  APP_NAME,
  APP_VERSION,
  BUILD_DATE,
  APP_OWNER,
  SUPPORT_EMAIL,
} from "@/lib/appInfo";
import { LifeBuoy, Tag, Calendar, Mail, MessageSquarePlus } from "lucide-react";
import AppFeedbackModal from "@/components/AppFeedbackModal";

export default function Footer() {
  const year = new Date().getFullYear();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur-md shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-[1700px] px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
          {/* Izquierda: app + version */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{APP_NAME}</span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono"
              title={`Último build: ${BUILD_DATE}`}
            >
              <Tag className="w-3 h-3" /> v{APP_VERSION}
            </span>
          </div>

          {/* Centro: soporte + feedback */}
          <div className="flex items-center gap-3 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <LifeBuoy className="w-3.5 h-3.5 text-blue-500" />
              <span>
                ¿Problemas?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Soporte%20Plataforma%20Desempe%C3%B1o%20-%20v${APP_VERSION}`}
                  className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  {SUPPORT_EMAIL}
                </a>
              </span>
            </span>
            <span className="text-slate-300 hidden sm:inline">·</span>
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
              title="Dejar una sugerencia o reportar un bug"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Dejar feedback
            </button>
          </div>

          {/* Derecha: build date + owner */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-slate-400" title={`Último build: ${BUILD_DATE}`}>
              <Calendar className="w-3 h-3" /> {BUILD_DATE}
            </span>
            <span className="text-slate-300">·</span>
            <span>© {year} {APP_OWNER}</span>
          </div>
        </div>
      </footer>

      <AppFeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}
