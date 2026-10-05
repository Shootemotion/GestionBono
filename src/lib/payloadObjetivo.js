// src/lib/payloadObjetivo.js
//
// Arma el cuerpo que se le manda al backend al guardar un objetivo.
//
// Vivía dentro de `handleSubmit` en FormularioObjetivos. Salió de ahí cuando
// el formulario pasó a validar en vivo contra el backend: si la validación
// manda una cosa y el guardado otra, el formulario te deja guardar algo que
// el backend rechaza, o peor, te avisa de un problema que no existe.
//
// Es la misma idea que con el cálculo: una sola construcción, usada por los
// dos caminos. Acá no hay reglas de negocio —esas están todas en el
// backend—, solo la normalización de lo que el formulario tiene en pantalla.

/** Normaliza una meta del formulario a la forma que espera el backend. */
export function normalizarMeta(m) {
  const aNumero = (v, porDefecto = null) => {
    if (v === "" || v == null) return porDefecto;
    const n = Number(v);
    return Number.isNaN(n) ? porDefecto : n;
  };

  const unidad = m.unidad || "Porcentual";
  const esBinaria = unidad === "Cumple/No Cumple";
  const tolerancia = aNumero(m.tolerancia, 0);

  return {
    // El _id de las metas que ya existen viaja de ida y vuelta. Sin esto el
    // backend solo puede emparejarlas por nombre, y renombrar una meta le
    // huerfanaba todos los resultados ya cargados.
    ...(m._id ? { _id: m._id } : {}),
    nombre: (m.nombre || "").trim(),
    target: null, // el target de texto quedó en desuso
    esperado: aNumero(m.esperado),
    unidad,
    operador: esBinaria ? ">=" : m.operador || ">=",
    modoAcumulacion: m.modoAcumulacion || "periodo",
    acumulativa: m.modoAcumulacion === "acumulativo" || !!m.acumulativa,
    pesoMeta: aNumero(m.pesoMeta),
    reconoceEsfuerzo: esBinaria ? false : m.reconoceEsfuerzo !== false,
    permiteOver: esBinaria ? false : m.permiteOver === true,
    tolerancia: tolerancia >= 0 ? tolerancia : 0,
    reglaCierre: m.reglaCierre || "promedio",
    umbralPeriodos: Number(m.umbralPeriodos || 0),
  };
}

/**
 * Cuerpo completo del objetivo.
 *
 * @param {Object} form  lo que el formulario tiene en pantalla
 * @returns {Object} listo para mandar a /templates
 */
export function construirPayloadObjetivo(form) {
  const metas = (form.metas || [])
    .map(normalizarMeta)
    .filter((m) => m.nombre || m.esperado !== null);

  const body = {
    tipo: "objetivo",
    year: Number(form.year),
    scopeType: form.scopeType,
    scopeId: form.scopeId,
    nombre: form.nombre,
    descripcion: form.descripcion,
    proceso: form.proceso,
    frecuencia: form.frecuencia,
    modoAcumulacion: form.modoAcumulacion,
    acumulativo: form.modoAcumulacion === "acumulativo",
    pesoBase: Number(form.peso || 0),
    activo: form.estado === "Activo",
    objetivosCalidad: form.objetivosCalidad,
  };

  if (form.usarFechaCierreCustom && form.fechaCierre) {
    body.fechaCierre = new Date(form.fechaCierre);
    body.fechaCierreCustom = true;
  }

  if (metas.length > 0) body.metas = metas;

  return body;
}
