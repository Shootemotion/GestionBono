// backend/src/contratos/verificador.js
//
// Corre el catálogo contra la base y devuelve el resultado.
//
// Vive acá y no dentro del script para que la consola y la pantalla ejecuten
// exactamente lo mismo. Si fueran dos implementaciones, el día que difieran
// nadie va a saber cuál creer — que es precisamente el problema que estos
// contratos existen para evitar.

import mongoose from "mongoose";
import Empleado from "../models/Empleado.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import Feedback from "../models/Feedback.model.js";
import { computeForEmployees } from "../controllers/dashboard.controller.js";
import { CONTRATOS, SEVERIDAD } from "./catalogo.js";

/**
 * Todo lo que los contratos necesitan, traído una sola vez.
 *
 * Se acota a las personas activas: los contratos describen lo que el sistema
 * promete hoy, y el ciclo de alguien que ya no está no se corrige.
 */
export async function armarContexto(year) {
  const empleados = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } })
    .select("nombre apellido fechaIngreso estadoLaboral")
    .lean();

  const ids = empleados.map((e) => e._id);
  const [plantillas, evaluaciones, feedbacks, dash] = await Promise.all([
    Plantilla.find({ year }).lean(),
    Evaluacion.find({}).select("empleado plantillaId periodo metasResultados updatedAt").lean(),
    Feedback.find({ year }).lean(),
    computeForEmployees(ids, year),
  ]);

  const activos = new Set(ids.map(String));
  const feedbacksActivos = feedbacks.filter((f) => activos.has(String(f.empleado)));

  const feedbacksPorEmpleado = new Map();
  for (const f of feedbacksActivos) {
    const k = String(f.empleado);
    if (!feedbacksPorEmpleado.has(k)) feedbacksPorEmpleado.set(k, []);
    feedbacksPorEmpleado.get(k).push(f);
  }

  return {
    year,
    db: mongoose.connection.db,
    empleados,
    plantillas,
    plantillaPorId: new Map(plantillas.map((p) => [String(p._id), p])),
    evaluaciones: evaluaciones.filter(
      (e) =>
        activos.has(String(e.empleado)) &&
        plantillas.some((p) => String(p._id) === String(e.plantillaId))
    ),
    feedbacks: feedbacksActivos,
    feedbacksPorEmpleado,
    dash,
    nombrePorEmpleado: new Map(
      empleados.map((e) => [String(e._id), `${e.apellido ?? ""}, ${e.nombre ?? ""}`.trim()])
    ),
    ingresoPorEmpleado: new Map(
      empleados.filter((e) => e.fechaIngreso).map((e) => [String(e._id), e.fechaIngreso])
    ),
  };
}

/**
 * Verifica todos los contratos.
 *
 * Un verificador que falla no se traga: se reporta como "no se pudo
 * verificar". Un contrato que no se puede comprobar no es un contrato
 * cumplido, y mostrarlo en verde sería peor que no mostrarlo.
 *
 * @param {Number} year
 * @param {Object} [ctx]  contexto ya armado, si se quiere reutilizar
 */
export async function verificarContratos(year, ctx = null) {
  const contexto = ctx || (await armarContexto(year));

  const resultados = [];
  for (const c of CONTRATOS) {
    let violaciones = [];
    let error = null;
    try {
      violaciones = (await c.verificar(contexto)) || [];
    } catch (e) {
      error = e.message;
    }

    resultados.push({
      id: c.id,
      titulo: c.titulo,
      promesa: c.promesa,
      porque: c.porque,
      seImpone: c.seImpone,
      capa: c.capa,
      severidad: c.severidad,
      verificadoPor: c.verificadoPor || null,
      estado: error ? "no_verificable" : violaciones.length ? "incumplido" : "cumplido",
      error,
      cantidad: violaciones.length,
      violaciones,
    });
  }

  const cumplidos = resultados.filter((r) => r.estado === "cumplido").length;
  const incumplidos = resultados.filter((r) => r.estado === "incumplido");
  const criticosRotos = incumplidos.filter((r) => r.severidad === SEVERIDAD.CRITICO).length;

  return {
    year,
    verificadoEl: new Date(),
    universo: {
      personas: contexto.empleados.length,
      objetivos: contexto.plantillas.length,
      resultados: contexto.evaluaciones.length,
      feedbacks: contexto.feedbacks.length,
    },
    total: resultados.length,
    cumplidos,
    incumplidos: incumplidos.length,
    noVerificables: resultados.filter((r) => r.estado === "no_verificable").length,
    criticosRotos,
    // Lo que falta primero: críticos, después el resto, al final lo cumplido.
    contratos: resultados.sort((a, b) => {
      const peso = (r) =>
        r.estado === "incumplido" ? (r.severidad === SEVERIDAD.CRITICO ? 0 : 1)
        : r.estado === "no_verificable" ? 2
        : 3;
      return peso(a) - peso(b) || a.id.localeCompare(b.id);
    }),
  };
}
