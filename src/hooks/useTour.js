import { useRef, useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Hook to manage interactive tours using driver.js with PREMIUM styling
 * @param {Array} steps - Array of steps for the tour
 * @returns {Function} startTour - Function to trigger the tour
 */
export const useTour = (steps = []) => {
  const driverRef = useRef(null);

  useEffect(() => {
    // Inject Custom Premium Styles
    const styleId = "driver-premium-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        /* ANIMATION: Keyframes for smoother entrance */
        @keyframes popoverIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* 1. WRAPPER & BACKGROUND (Glassmorphism) */
        .driver-popover.driverjs-theme {
          background-color: rgba(255, 255, 255, 0.95); /* High opacity white */
          backdrop-filter: blur(16px);                  /* Heavy blur/glass effect */
          -webkit-backdrop-filter: blur(16px);
          color: #1e293b;
          
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 20px;                          /* Modern rounded corners */
          
          /* Deep, colored shadow for depth */
          box-shadow: 
            0 20px 40px -8px rgba(37, 99, 235, 0.15),   /* Blueish ambient shadow */
            0 8px 16px -4px rgba(0, 0, 0, 0.05),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);

          padding: 24px;
          min-width: 320px;
          max-width: 400px;
          font-family: 'Inter', system-ui, sans-serif;  /* Modern Font Stack */
          
          /* Entrance Animation */
          animation: popoverIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* 2. TITLE - Clean & Bold */
        .driver-popover.driverjs-theme .driver-popover-title {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 10px;
          color: #0f172a; /* slate-900 */
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent; /* Subtle gradient title */
          display: inline-block;
        }

        /* 3. DESCRIPTION - Readable */
        .driver-popover.driverjs-theme .driver-popover-description {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 400;
          color: #475569; /* slate-600 */
          line-height: 1.6;
          margin-bottom: 20px;
        }

        /* 4. FOOTER & BUTTONS */
        .driver-popover.driverjs-theme .driver-popover-footer {
          margin-top: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        /* Primary Button (Next/Done) */
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-next-btn,
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-done-btn {
          background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); /* Vibrant Blue Gradient */
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.01em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-next-btn:hover,
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-done-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
          background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
        }
        
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-next-btn:active,
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-done-btn:active {
          transform: translateY(0);
        }

        /* Secondary Button (Previous) - Ghost Style */
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-prev-btn {
          background: transparent;
          color: #64748b;
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .driver-popover.driverjs-theme .driver-popover-footer .driver-popover-prev-btn:hover {
          background-color: #f1f5f9; /* slate-100 */
          color: #334155;
        }

        /* Close Button - Subtle */
        .driver-popover.driverjs-theme .driver-popover-close-btn {
          color: #cbd5e1;
          transition: color 0.2s;
          top: 16px;
          right: 16px;
        }
        .driver-popover.driverjs-theme .driver-popover-close-btn:hover {
          color: #64748b;
        }

        /* Progress Text - Styled */
        .driver-popover.driverjs-theme .driver-popover-progress-text {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        /* HIGHLIGHT OVERLAY - Softer transition */
        .driver-overlay {
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        
        /* HIGHLIGHT BOX - Glowing Edges */
        .driver-active-element {
            /* If we could style the cutout border directly from CSS... usually handled by JS options */
        }
      `;
      document.head.appendChild(style);
    }

    // Initialize driver with Smooth Config
    driverRef.current = driver({
      showProgress: true,
      animate: true,      // Essential for smooth movement
      opacity: 0.6,       // Lighter dark overlay (0.75 is default, 0.5-0.6 feels lighter)
      allowClose: true,

      // Padding around highlighted element
      stagePadding: 8,

      // Custom Text
      doneBtnText: "¡Entendido!",
      nextBtnText: "Siguiente ✨", // Adding emoji for "onda"
      prevBtnText: "Atrás",
      progressText: "Paso {{current}} de {{total}}",

      steps: steps,
    });

  }, [steps]);

  const startTour = () => {
    if (driverRef.current) {
      driverRef.current.drive();
    }
  };

  return { startTour };
};
