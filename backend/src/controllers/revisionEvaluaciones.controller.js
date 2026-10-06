// backend/src/controllers/revisionEvaluaciones.controller.js
//
// Pasa el validador de resultados cargados por toda una tanda y devuelve el
// panorama: cuántos hay mal, de qué tipo y de quién.
//
// Es la contraparte de `revisionObjetivos`. Aquel revisa cómo quedó
// configurado un objetivo; este, lo que efectivamente se cargó contra él.
// Los dos alimentan la misma pantalla de Control de Datos.
//
// Por qué un endpoint y no un script: los problemas que detecta aparecen
// solos con el uso —alguien cambia una frecuencia, otro renombra una meta, un
// tercero carga un período de más— y hay que poder mirarlos cualquier día,
// no solo cuando alguien se acuerda de correr algo por consola.

import mongoose from "mongoose";
import Evaluacion from "../models/Evaluacion.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Empleado from "../models/Empleado.model.js";
import { validarLoteEvaluaciones } from "../lib/validacionEvaluaciones.js";
import { anioFiscalActual } from "../lib/fiscalYear.js";
import { filtroDesvinculados, pidioIncluirDesvinculados } from "../utils/alcanceEmpleados.js";

/**
 * GET /api/evaluaciones/revision?year=2026[&empleadoId=...]
 *
 * Sin `empleadoId` revisa el año completo. Con él, solo esa persona, que es
 * como se usa desde el legajo.
 */
export async function revisionEvaluaciones(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    const { empleadoId } = req.query;

    if (empleadoId && !mongoose.isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "empleadoId inválido" });
    }

    // Las plantillas del año se traen todas de una: el validador necesita el
    // calendario de cada objetivo, y pedirlo por evaluación serían cientos de
    // consultas para los mismos cien documentos.
    const [plantillas, empleados] = await Promise.all([
      Plantilla.find({ year, tipo: "objetivo" })
        .select("nombre year frecuencia metas fechaInicioFiscal fechaCierre fechaCierreCustom")
        .lean(),
      // Sin desvinculados salvo que se pidan: lo que haya quedado mal cargado
      // en el ciclo de alguien que ya no está no se va a corregir.
      Empleado.find(empleadoId ? { _id: empleadoId } : filtroDesvinculados(pidioIncluirDesvinculados(req)))
        .select("nombre apellido fechaIngreso estadoLaboral")
        .lean(),
    ]);

    const porId = new Map(plantillas.map((p) => [String(p._id), p]));
    const ingresoPorEmpleado = new Map(
      empleados.filter((e) => e.fechaIngreso).map((e) => [String(e._id), e.fechaIngreso])
    );
    const nombrePorEmpleado = new Map(
      empleados.map((e) => [String(e._id), `${e.apellido ?? ""}, ${e.nombre ?? ""}`.trim()])
    );

    // Las evaluaciones se acotan a las personas que entran en el listado.
    //
    // Filtrar sólo la consulta de empleados no alcanzaba: esto lista
    // EVALUACIONES, así que las de un desvinculado seguían saliendo aunque la
    // persona no estuviera en el listado de arriba.
    const filtro = {
      plantillaId: { $in: [...porId.keys()] },
      empleado: { $in: empleados.map((e) => e._id) },
    };
    if (empleadoId) filtro.empleado = empleadoId;

    const evaluaciones = await Evaluacion.find(filtro)
      .select("empleado plantillaId periodo year estado metasResultados")
      .lean();

    const resultado = validarLoteEvaluaciones(evaluaciones, porId, { ingresoPorEmpleado });

    // El nombre se agrega acá y no dentro del validador: el validador es
    // lógica pura y testeable sin base, y no tiene por qué saber de empleados.
    resultado.items = resultado.items.map((i) => ({
      ...i,
      empleadoNombre: nombrePorEmpleado.get(i.empleado) || "(empleado no encontrado)",
    }));

    res.json({ year, empleadoId: empleadoId || null, ...resultado });
  } catch (err) {
    console.error("revisionEvaluaciones error:", err);
    res.status(500).json({ message: "Error revisando las evaluaciones cargadas" });
  }
}
