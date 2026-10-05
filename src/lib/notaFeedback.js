// src/lib/notaFeedback.js
//
// ⚠️ FUENTE ÚNICA: backend/src/lib/notaOficial.js
// Re-exporta el resolvedor para que el front y el backend respondan igual a
// "¿cuál es la nota de este feedback?". Mismo patrón que calculos.js con
// scoringCore: Vite lo bundlea en el cliente.
//
// No leas `feedback.scores` a mano en una pantalla: si RRHH confirmó otra
// nota, `scores` tiene el valor viejo y vas a mostrar el número equivocado.
export { notaDelFeedback } from "../../backend/src/lib/notaOficial.js";
