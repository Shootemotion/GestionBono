// backend/src/lib/plantillaGuards.js
//
// Barreras de entrada para crear y editar objetivos/aptitudes.
//
// CONTEXTO (por qué existe este archivo)
// --------------------------------------
// En septiembre de 2026 varios jefes cargaron los objetivos del AF2026
// clonando los del AF2025. El modal de clonación proponía por defecto el año
// del objetivo ORIGEN, así que los clones nacieron dentro de un ejercicio ya
// cerrado; y el front mandaba el objetivo entero con {...original}, con lo
// cual viajaban también createdAt, version y los _id de las metas. El
// resultado fue el Área Técnica con objetivos duplicados, pesos que sumaban
// mucho más de 100 y resultados colgando de metas que ya no existían.
//
// La lección: el controlador confiaba en el body. Estas funciones son el
// "no confío" puesto en un solo lugar, para que valga igual si mañana el
// pedido llega desde otra pantalla, desde un script o desde Postman.

import mongoose from "mongoose";
import { matchCap } from "../auth/auth.middleware.js";
import { anioFiscalActual, anioFiscalCerrado, etiquetaAnioFiscal } from "./fiscalYear.js";

/* ------------------------------------------------------------------ *
 * 1. Qué campos puede mandar un cliente
 * ------------------------------------------------------------------ */

/**
 * Lista blanca. Todo lo que no esté acá se descarta en silencio.
 *
 * Es lista blanca y no lista negra a propósito: si mañana el modelo suma un
 * campo sensible, el default seguro es que NO se pueda escribir desde afuera
 * hasta que alguien lo agregue acá conscientemente.
 */
const CAMPOS_PLANTILLA = [
  "tipo", "year", "scopeType", "scopeId",
  "nombre", "descripcion", "proceso", "objetivosCalidad",
  "metodo", "target", "unidad", "escalas",
  "metas",
  "fechaCierre", "fechaCierreCustom",
  "frecuencia", "pesoBase", "activo",
  "motivoVersion", "comentarioVersion", "metadata",
];

/**
 * Campos que el cliente NUNCA escribe, aunque los mande.
 *
 *   _id, createdAt, updatedAt, __v  -> identidad y sellos de tiempo. Un clon
 *     que hereda el createdAt del original hace imposible reconstruir cuándo
 *     pasó cada cosa, que fue justamente lo que costó horas de investigación.
 *   version, parentPlantillaId, estadoAprobacion -> los maneja el versionado
 *     (versionarPlantilla / aprobarVersionPlantilla), no un alta común.
 *   deletedAt, deletedBy -> los maneja el borrado lógico.
 *   scopeRef, fechaInicioFiscal -> derivados, los completa el pre("validate").
 */
const CAMPOS_PROHIBIDOS = [
  "_id", "id", "__v", "createdAt", "updatedAt",
  "version", "parentPlantillaId", "estadoAprobacion",
  "deletedAt", "deletedBy",
  "scopeRef", "fechaInicioFiscal",
];

const CAMPOS_META = [
  "nombre", "target", "esperado", "unidad", "operador", "pesoMeta",
  "reconoceEsfuerzo", "permiteOver", "tolerancia",
  "modoAcumulacion", "acumulativa", "reglaCierre", "umbralPeriodos",
];

/**
 * Deja del body solo lo que se puede escribir.
 *
 * @param {Object} body
 * @param {Object} opts
 * @param {boolean} opts.conservarMetaIds  true al editar (el _id de la meta
 *   ata los resultados ya cargados), false al crear (un clon que reusa los
 *   _id de las metas del original termina compartiéndolos entre dos objetivos
 *   distintos).
 */
export function sanitizarPlantilla(body = {}, { conservarMetaIds = false } = {}) {
  const limpio = {};
  for (const campo of CAMPOS_PLANTILLA) {
    if (body[campo] !== undefined) limpio[campo] = body[campo];
  }

  if (Array.isArray(limpio.metas)) {
    limpio.metas = limpio.metas.map((meta) => {
      const m = {};
      for (const campo of CAMPOS_META) {
        if (meta?.[campo] !== undefined) m[campo] = meta[campo];
      }
      if (conservarMetaIds && meta?._id) m._id = meta._id;
      return m;
    });
  }

  return limpio;
}

/** Los campos prohibidos que venían en el body, para poder avisarlo. */
export function camposIgnorados(body = {}) {
  return CAMPOS_PROHIBIDOS.filter((c) => body?.[c] !== undefined);
}

/* ------------------------------------------------------------------ *
 * 2. Validación de contenido
 * ------------------------------------------------------------------ */

const TIPOS = ["objetivo", "aptitud"];
const SCOPES = ["area", "sector", "empleado", "employee"];
const FRECUENCIAS = ["mensual", "trimestral", "semestral", "anual"];

/**
 * Revisa el contenido y devuelve la lista de problemas.
 *
 * Mongoose ya valida los enums, pero lo hace tirando un 500 con un texto que
 * el usuario no entiende. Acá el error se explica en castellano y se devuelve
 * como 400, que es lo que realmente es: el pedido está mal, no el servidor.
 */
export function validarPlantilla(body = {}, { esCreacion = false } = {}) {
  const errores = [];
  const actual = anioFiscalActual();

  if (esCreacion) {
    if (!TIPOS.includes(body.tipo)) errores.push("El tipo debe ser objetivo o aptitud.");
    if (!SCOPES.includes(body.scopeType)) errores.push("El alcance debe ser área, sector o empleado.");
    if (!mongoose.Types.ObjectId.isValid(String(body.scopeId || ""))) {
      errores.push("Falta indicar a qué área, sector o empleado se aplica.");
    }
    const year = Number(body.year);
    if (!Number.isInteger(year)) {
      errores.push("El año fiscal es obligatorio.");
    } else if (year < actual - 5 || year > actual + 1) {
      errores.push(
        `El año fiscal ${etiquetaAnioFiscal(year)} está fuera de rango: se admite desde ` +
        `${etiquetaAnioFiscal(actual - 5)} hasta ${etiquetaAnioFiscal(actual + 1)}.`
      );
    }
  }

  if (body.nombre !== undefined && !String(body.nombre || "").trim()) {
    errores.push("El nombre no puede quedar vacío.");
  }

  if (body.frecuencia !== undefined) {
    if (!FRECUENCIAS.includes(body.frecuencia)) {
      errores.push("La frecuencia debe ser mensual, trimestral, semestral o anual.");
    }
  } else if (esCreacion) {
    errores.push("La frecuencia es obligatoria.");
  }

  if (body.pesoBase !== undefined || esCreacion) {
    const peso = Number(body.pesoBase);
    if (!Number.isFinite(peso)) errores.push("El peso es obligatorio y debe ser un número.");
    else if (peso < 0 || peso > 100) errores.push("El peso tiene que estar entre 0 y 100.");
  }

  if (Array.isArray(body.metas)) {
    body.metas.forEach((meta, i) => {
      if (!String(meta?.nombre || "").trim()) {
        errores.push(`La meta ${i + 1} no tiene nombre.`);
      }
      if (meta?.pesoMeta != null) {
        const pm = Number(meta.pesoMeta);
        if (!Number.isFinite(pm) || pm < 0 || pm > 100) {
          errores.push(`El peso de la meta ${i + 1} tiene que estar entre 0 y 100.`);
        }
      }
    });
  }

  return errores;
}

/* ------------------------------------------------------------------ *
 * 3. Año fiscal cerrado
 * ------------------------------------------------------------------ */

/** Capacidad que habilita escribir sobre un ejercicio terminado. */
export const CAP_ANIO_CERRADO = "objetivos:eliminar";

/**
 * ¿Este usuario puede tocar este año?
 *
 * Un año cerrado no es intocable -RRHH a veces tiene que corregir- pero deja
 * de estar al alcance de un jefe que se equivocó de opción en un combo.
 * Devuelve null si puede, o el mensaje de rechazo si no.
 */
export function bloqueoPorAnioCerrado(year, usuario) {
  if (year === undefined || year === null) return null;
  if (!anioFiscalCerrado(year)) return null;

  // Se pregunta igual que `requireCap`: primero el superadmin, después la
  // capacidad con soporte de comodín. Un `includes` plano bloqueaba al
  // superadmin, cuyo único permiso es "*" y no coincide literal con nada.
  if (usuario?.isSuper) return null;
  if (matchCap(usuario?.permisos, CAP_ANIO_CERRADO)) return null;

  return (
    `El ${etiquetaAnioFiscal(year)} ya está cerrado y no admite cambios. ` +
    `El año en curso es ${etiquetaAnioFiscal(anioFiscalActual())}. ` +
    `Si hay que corregir un ejercicio cerrado, pedíselo a RRHH.`
  );
}

/* ------------------------------------------------------------------ *
 * 4. Duplicados
 * ------------------------------------------------------------------ */

/** Nombres "iguales" para un humano: sin mayúsculas, sin espacios de más. */
export function normalizarNombre(nombre) {
  return String(nombre || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Busca un objetivo vivo que sea el mismo: mismo tipo, año, alcance y nombre.
 *
 * Cubre los dos casos que se vieron en el incidente: el clon repetido a mano
 * y el doble clic que mandaba dos POST con uno o dos segundos de diferencia.
 * El segundo no se resuelve del lado del navegador -un botón deshabilitado no
 * frena un reintento de red-, hay que frenarlo del lado del servidor.
 */
export async function buscarDuplicada(Plantilla, body, { excluirId = null } = {}) {
  if (!body?.nombre || !body?.scopeId || body?.year === undefined) return null;

  const filtro = {
    tipo: body.tipo,
    year: Number(body.year),
    scopeType: body.scopeType,
    scopeId: body.scopeId,
  };
  if (excluirId) filtro._id = { $ne: excluirId };

  const candidatas = await Plantilla.find(filtro).lean();
  const objetivo = normalizarNombre(body.nombre);
  return candidatas.find((p) => normalizarNombre(p.nombre) === objetivo) || null;
}
