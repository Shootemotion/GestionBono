// backend/src/utils/alcanceEmpleados.js
// ¿Qué empleados puede VER cada usuario?
//
// POLÍTICA
//   · Dirección, RRHH y superadmin ven a todos.
//   · Un jefe (referente de un área o sector, o con rol jefe_*) ve solo su
//     gente: los empleados de las áreas y sectores que tiene a cargo, más él
//     mismo.
//   · Quien no tiene un alcance definido (p. ej. un visor suelto) queda como
//     estaba: no lo recortamos, para no vaciarle pantallas que hoy usa.
//
// Es la misma regla que el front ya aplicaba en GestionNomina.jsx, pero acá
// del lado del servidor, que es el único lugar donde de verdad restringe.

import mongoose from "mongoose";

const oid = (v) => {
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};

/** Dirección, RRHH y superadmin no tienen recorte. */
export function tieneAlcanceTotal(user) {
  return !!(user?.isSuper || user?.isRRHH || user?.isDirectivo);
}

/**
 * Alcance efectivo del usuario.
 * @returns {{acotado: boolean, areas: string[], sectores: string[]}}
 *   `acotado:false` = sin recorte (alcance total o alcance indeterminable).
 */
export function alcanceDe(user) {
  if (tieneAlcanceTotal(user)) return { acotado: false, areas: [], sectores: [] };

  // SOLO las áreas y sectores donde figura como referente. Deliberadamente NO
  // sumamos su propia área: los jefes están todos en "Comité de Gestión", así
  // que incluirla haría que cada jefe viera a los demás jefes — pares, no gente
  // a su cargo. (GestionNomina.jsx sí la suma, pero ahí es para navegar la
  // estructura, no para dar acceso a datos.)
  const areas = new Set((user?.referenteAreas || []).map(String).filter(Boolean));
  const sectores = new Set((user?.referenteSectors || []).map(String).filter(Boolean));

  // Sin alcance determinable no recortamos: preserva el comportamiento actual
  // de los visores, que hoy usan la nómina completa.
  if (areas.size === 0 && sectores.size === 0) {
    return { acotado: false, areas: [], sectores: [] };
  }
  return { acotado: true, areas: [...areas], sectores: [...sectores] };
}

/**
 * Condición de mongo para acotar una búsqueda de empleados.
 * @returns {object|null} `null` si el usuario no tiene recorte.
 *   Combinalo con $and para no pisar un $or preexistente (el del buscador).
 */
export function filtroAlcanceEmpleados(user) {
  const a = alcanceDe(user);
  if (!a.acotado) return null;

  const or = [];
  const areaIds = a.areas.map(oid).filter(Boolean);
  const secIds = a.sectores.map(oid).filter(Boolean);
  if (areaIds.length) or.push({ area: { $in: areaIds } });
  if (secIds.length) or.push({ sector: { $in: secIds } });
  if (!or.length) return null;

  // El jefe NO aparece en su propia lista: la lista es "mi gente", y uno no es
  // colaborador de sí mismo. Evita, por ejemplo, que en el Simulador de Cálculo
  // se evalúe a sí mismo. Mismo criterio que dashByArea, que excluye al
  // referente que consulta.
  //
  // Ojo: esto NO le quita acceso a sus propios datos. Mi Desempeño y Mi Legajo
  // piden un empleado puntual y pasan por puedeVerEmpleado, que sí permite el
  // propio legajo.
  const propio = user?.empleadoId ? oid(user.empleadoId) : null;
  if (!propio) return { $or: or };
  return { $and: [{ $or: or }, { _id: { $ne: propio } }] };
}

/**
 * ¿Puede este usuario ver a este empleado?
 * @param {object} emp Documento de empleado (con `area` y `sector`, poblados o no).
 */
export function puedeVerEmpleado(user, emp) {
  const a = alcanceDe(user);
  if (!a.acotado) return true;
  if (!emp) return false;

  if (user?.empleadoId && String(emp._id) === String(user.empleadoId)) return true;

  const areaId = String(emp.area?._id ?? emp.area ?? "");
  const sectorId = String(emp.sector?._id ?? emp.sector ?? "");
  return a.areas.includes(areaId) || a.sectores.includes(sectorId);
}
