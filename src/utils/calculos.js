// src/utils/calculos.js
//
// ⚠️ FUENTE ÚNICA DE VERDAD: backend/src/lib/scoringCore.js
// Este archivo SOLO re-exporta el motor unificado para que el frontend y el
// backend calculen exactamente igual. No agregar lógica acá: editá scoringCore.js.
// Vite bundlea scoringCore en el cliente en tiempo de build.
export {
  calculatePeriodCompliance,
  calculateMetaScore,
  calculateObjectiveProgress,
  calculateWeightedScore,
  calculateGlobalScore,
  calculateCompetencyProgress,
  AF_REGLAS_CORREGIDAS,
} from "../../backend/src/lib/scoringCore.js";
