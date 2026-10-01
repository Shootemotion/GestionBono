// backend/src/utils/salaryVisibility.js
// Control de acceso a la información salarial.
// El sueldo NO debe salir de la API salvo para roles autorizados.
//
// POLÍTICA: solo Dirección y RRHH ven sueldos (+ superadmin, la cuenta técnica
// de sistema, que ya tiene acceso total). Los jefes de área/sector y demás roles
// NO ven sueldos, aunque tengan nomina:editar.

/**
 * ¿Este usuario puede ver sueldos? Solo: superadmin, RRHH, directivo.
 */
export function puedeVerSueldo(user) {
  if (!user) return false;
  return !!(user.isSuper || user.isRRHH || user.isDirectivo);
}

/** Devuelve una copia del empleado SIN sueldoBase si el usuario no está autorizado. */
export function redactSueldoEmpleado(emp, user) {
  if (!emp || puedeVerSueldo(user)) return emp;
  const o = typeof emp.toObject === "function" ? emp.toObject() : { ...emp };
  delete o.sueldoBase;
  return o;
}

/** Redacta el sueldo en una lista del dashboard (items con .empleado). No muta el original. */
export function redactSueldoDashboard(items, user) {
  if (!Array.isArray(items) || puedeVerSueldo(user)) return items;
  return items.map((it) => {
    if (!it || !it.empleado) return it;
    const emp = { ...it.empleado };
    delete emp.sueldoBase;
    return { ...it, empleado: emp };
  });
}
