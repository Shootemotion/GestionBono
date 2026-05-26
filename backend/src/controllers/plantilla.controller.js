// src/controllers/plantilla.controller.js
import Plantilla from "../models/Plantilla.model.js";

export async function createPlantilla(req, res) {
  try {
    const body = req.body;

    const nueva = await Plantilla.create({
      ...body,
      fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
      metas: body.metas || [],

    });


    res.status(201).json(nueva);
  } catch (err) {
    console.error("createPlantilla error:", err);
    res.status(500).json({ message: "Error creando plantilla" });
  }
}

export async function updatePlantilla(req, res) {
  try {
    const { id } = req.params;
    const body = req.body;

    // ⚠️ PROTECCIÓN: El alcance (scope) de una plantilla no puede cambiar después de su creación.
    // Cambiar scopeType/scopeId afectaría a todos los empleados que ya la tienen por herencia.
    // Para cambiar el alcance hay que crear una nueva plantilla.
    delete body.scopeType;
    delete body.scopeId;
    delete body.scopeRef;
    delete body.year; // el año fiscal tampoco debe cambiar

    const updated = await Plantilla.findByIdAndUpdate(
      id,
      {
        ...body,
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        metas: body.metas || [], // 👈 acepta metas en update
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    res.json(updated);
  } catch (err) {
    console.error("updatePlantilla error:", err);
    res.status(500).json({ message: "Error actualizando plantilla" });
  }
}

export async function listPlantillas(req, res) {
  try {
    const { year, scopeType, scopeId, tipoFiltro } = req.query;
    const query = {};

    if (year) query.year = Number(year);
    if (scopeType) query.scopeType = scopeType;
    if (scopeId) query.scopeId = scopeId;
    if (tipoFiltro === "activas") {
      query.$or = [{ activo: true }, { estadoAprobacion: "pendiente" }];
    } else if (tipoFiltro === "pendientes") {
      query.estadoAprobacion = "pendiente";
    } else if (tipoFiltro === "inactivas") {
      query.activo = false;
    } else if (tipoFiltro === "todos" || tipoFiltro === "all") {
      // No filtrar por activo (traer todo)
    } else {
      // Default: Solo activas (protección seguridad)
      query.activo = true;
    }

    const list = await Plantilla.find(query)
      .populate("objetivosCalidad", "codigo nombre year")
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error("listPlantillas error:", err);
    res.status(500).json({ message: "Error listando plantillas" });
  }
}


export async function getPlantillaById(req, res) {
  try {
    const { id } = req.params;
    const tpl = await Plantilla.findById(id)
      .populate("objetivosCalidad", "codigo nombre year");
    if (!tpl) return res.status(404).json({ message: "Plantilla no encontrada" });
    res.json(tpl);
  } catch (err) {
    console.error("getPlantillaById error:", err);
    res.status(500).json({ message: "Error obteniendo plantilla" });
  }
}

export async function deletePlantilla(req, res) {
  try {
    const { id } = req.params;
    const deleted = await Plantilla.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Plantilla no encontrada" });
    res.sendStatus(204);
  } catch (err) {
    console.error("deletePlantilla error:", err);
    res.status(500).json({ message: "Error eliminando plantilla" });
  }
}

// =======================================================
// =============  SISTEMA DE VERSIONADO ==================
// =======================================================

export async function versionarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // 1. Obtener la plantilla original
    const plantillaOriginal = await Plantilla.findById(id);
    if (!plantillaOriginal) {
      return res.status(404).json({ message: "Plantilla original no encontrada" });
    }

    // 2. Crear una nueva plantilla clonando los datos base
    // PERO incrementando la versión y guardando parentPlantillaId
    const nuevaVersionNum = (plantillaOriginal.version || 1) + 1;

    // Extraemos la información de la plantilla actual como JS Object
    const baseData = plantillaOriginal.toObject();

    // Eliminamos metadatos que no se deben clonar directamente
    delete baseData._id;
    delete baseData.__v;
    delete baseData.createdAt;
    delete baseData.updatedAt;

    // Fusionamos la data original con los cambios que vienen del formulario en 'body'
    const nuevaPlantillaData = {
      ...baseData,
      ...body,
      // Variables estrictas de versionado (sobreescriben cualquier inyección)
      version: nuevaVersionNum,
      parentPlantillaId: plantillaOriginal._id,
      estadoAprobacion: "pendiente", // Queda pendiente de aprobación
      activo: false // No es la vigente todavía
    };

    const nuevaPlantilla = await Plantilla.create(nuevaPlantillaData);

    res.status(201).json({
      message: "Nueva versión creada (pendiente de aprobación)",
      plantilla: nuevaPlantilla
    });

  } catch (err) {
    console.error("versionarPlantilla error:", err);
    res.status(500).json({ message: "Error al versionar la plantilla" });
  }
}

import Evaluacion from "../models/Evaluacion.model.js";

export async function aprobarVersionPlantilla(req, res) {
  try {
    const { id } = req.params;

    // 1. Buscar la plantilla a aprobar
    const plantillaNueva = await Plantilla.findById(id);
    if (!plantillaNueva || !plantillaNueva.parentPlantillaId) {
      return res.status(404).json({ message: "Versión de plantilla no válida o no encontrada" });
    }

    // 2. Buscar al padre y desactivarlo
    await Plantilla.findByIdAndUpdate(plantillaNueva.parentPlantillaId, { activo: false });

    // 3. Activar la nueva plantilla
    plantillaNueva.estadoAprobacion = "aprobada";
    plantillaNueva.activo = true;
    await plantillaNueva.save();

    // 4. MIGRAR EVALUACIONES PENDIENTES (MANAGER_DRAFT) DE LA PLANTILLA VIEJA
    // Aquellas evaluaciones de la plantilla antigua que aún estén en estado DRAFT, 
    // se pasarán a usar la nueva plantilla. (Las cerradas o enviadas al empleado quedan con la V1).
    const evaluacionesDraft = await Evaluacion.find({
      plantillaId: plantillaNueva.parentPlantillaId,
      estado: "MANAGER_DRAFT"
    });

    let migrados = 0;
    for (const ev of evaluacionesDraft) {
      // Mapear nuevas metas
      const nuevasMetasEvaluacion = plantillaNueva.metas.map(metaPlantilla => {
        // Intentar rescatar el resultado si la meta se llama igual
        const metaPrevia = ev.metasResultados.find(m => m.nombre === metaPlantilla.nombre);

        return {
          metaId: metaPlantilla._id,
          nombre: metaPlantilla.nombre,
          unidad: metaPlantilla.unidad,
          operador: metaPlantilla.operador,
          esperado: metaPlantilla.esperado,
          pesoMeta: metaPlantilla.pesoMeta,
          reconoceEsfuerzo: metaPlantilla.reconoceEsfuerzo,
          permiteOver: metaPlantilla.permiteOver,
          tolerancia: metaPlantilla.tolerancia,
          modoAcumulacion: metaPlantilla.modoAcumulacion,
          acumulativa: metaPlantilla.acumulativa,
          reglaCierre: metaPlantilla.reglaCierre,
          umbralPeriodos: metaPlantilla.umbralPeriodos,
          // Si había un resultado de una meta con igual nombre, conservarlo. Si no, null.
          resultado: metaPrevia ? metaPrevia.resultado : null,
          cumple: metaPrevia ? metaPrevia.cumple : false
        };
      });

      ev.plantillaId = plantillaNueva._id;
      ev.metasResultados = nuevasMetasEvaluacion;
      await ev.save();
      migrados++;
    }

    res.json({
      message: `Versión aprobada y activa. Se migraron ${migrados} evaluaciones en DRAFT.`,
      plantilla: plantillaNueva
    });

  } catch (err) {
    console.error("aprobarVersionPlantilla error:", err);
    res.status(500).json({ message: "Error al aprobar la versión de la plantilla" });
  }
}
