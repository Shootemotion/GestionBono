// src/controllers/plantilla.controller.js
import Plantilla from "../models/Plantilla.model.js";
import {
  sanitizarPlantilla,
  camposIgnorados,
  validarPlantilla,
  bloqueoPorAnioCerrado,
  buscarDuplicada,
} from "../lib/plantillaGuards.js";
import {
  validarCoherenciaObjetivo,
  validarLote,
  resumirErrores,
} from "../lib/validacionObjetivos.js";
import { anioFiscalActual } from "../lib/fiscalYear.js";
import { huerfanosPorCambio } from "./historialPlantilla.controller.js";

/**
 * Quinto filtro: ¿el motor va a devolver el número que se quiso pedir?
 *
 * Los cuatro anteriores —lista blanca, validación formal, año cerrado,
 * duplicados— miran si el documento es legal. Este mira si tiene sentido:
 * un umbral de 9 períodos en un objetivo trimestral pasa los cuatro y
 * devuelve 0 todo el año.
 *
 * Corta solo con ERRORES. Las advertencias viajan en la respuesta del
 * guardado para que la pantalla las muestre después de guardar: frenar por
 * una advertencia convierte el aviso en un obstáculo y se termina
 * desactivando.
 *
 * Devuelve la respuesta ya enviada (para que el caller haga `return`), o
 * null si se puede seguir.
 */
function cortarPorCoherencia(body, res) {
  // Solo aplica a objetivos: las aptitudes no pasan por el motor de metas.
  if (body?.tipo && body.tipo !== "objetivo") return null;

  const { errores, advertencias } = validarCoherenciaObjetivo(body);
  if (!errores.length) return null;

  return res.status(400).json({
    message: resumirErrores(errores, body?.year),
    motivo: "configuracion_incoherente",
    errores,
    advertencias,
  });
}

/**
 * Adjunta las advertencias al objetivo guardado.
 *
 * Van en la respuesta del POST/PUT y no en un pedido aparte para que la
 * pantalla no tenga que acordarse de preguntar: si el guardado salió bien
 * pero la configuración tiene algo raro, el aviso llega con el mismo
 * response.
 */
function conAdvertencias(doc) {
  if (!doc) return doc;
  const plano = typeof doc.toObject === "function" ? doc.toObject() : doc;
  if (plano.tipo && plano.tipo !== "objetivo") return plano;
  const { advertencias } = validarCoherenciaObjetivo(plano);
  return advertencias.length ? { ...plano, _advertencias: advertencias } : plano;
}

/**
 * Conserva el `_id` de las metas que ya existían al guardar una plantilla.
 *
 * El formulario reconstruye cada meta desde cero y no manda el `_id`. Como el
 * update reemplaza el array entero, Mongoose le asignaba uno nuevo a cada una,
 * y todos los resultados ya cargados —que guardan `metaId`— quedaban apuntando
 * a una meta inexistente. El sistema los rescataba por nombre, así que el daño
 * aparecía recién cuando alguien renombraba una meta: ahí se perdía su
 * historial en pantalla.
 *
 * Emparejamos cada meta entrante con la existente por `_id` si vino, y si no
 * por nombre. Las nuevas reciben su id de Mongoose como siempre.
 */
function conservarIdsDeMetas(metasActuales = [], metasEntrantes) {
  if (!Array.isArray(metasEntrantes)) return metasActuales;

  const porId = new Map();
  const porNombre = new Map();
  for (const m of metasActuales) {
    porId.set(String(m._id), m);
    const n = String(m.nombre || "").trim();
    // Con nombres repetidos nos quedamos con el primero: emparejar mal sería
    // peor que crear una meta nueva.
    if (n && !porNombre.has(n)) porNombre.set(n, m);
  }

  const usados = new Set();
  return metasEntrantes.map((entrante) => {
    const idEntrante = entrante?._id ? String(entrante._id) : null;
    let previa = idEntrante ? porId.get(idEntrante) : null;
    if (!previa) {
      const n = String(entrante?.nombre || "").trim();
      const candidata = n ? porNombre.get(n) : null;
      if (candidata && !usados.has(String(candidata._id))) previa = candidata;
    }
    if (!previa) return entrante; // meta nueva: que Mongoose le asigne el id
    usados.add(String(previa._id));
    return { ...entrante, _id: previa._id };
  });
}

/**
 * Alta de un objetivo o aptitud.
 *
 * Antes esto era un `Plantilla.create({ ...req.body })`. Esa línea es la que
 * permitió que la clonación de objetivos del AF2025 al AF2026 escribiera
 * dentro de un año ya cerrado, con `createdAt` y `version` heredados del
 * original y metas compartiendo `_id`. Ahora el body pasa por cuatro filtros
 * —lista blanca, validación, año cerrado y duplicados— antes de tocar la base.
 */
export async function createPlantilla(req, res) {
  try {
    const bodyCrudo = req.body || {};
    const body = sanitizarPlantilla(bodyCrudo, { conservarMetaIds: false });

    const errores = validarPlantilla(body, { esCreacion: true });
    if (errores.length) {
      return res.status(400).json({ message: errores[0], errores });
    }

    const bloqueo = bloqueoPorAnioCerrado(body.year, req.user);
    if (bloqueo) {
      return res.status(403).json({ message: bloqueo, motivo: "anio_cerrado", year: body.year });
    }

    const incoherente = cortarPorCoherencia(body, res);
    if (incoherente) return incoherente;

    // Duplicados: mismo tipo, año, alcance y nombre. Atrapa tanto el clon
    // repetido a mano como el doble clic que manda dos POST seguidos.
    const duplicada = await buscarDuplicada(Plantilla, body);
    if (duplicada) {
      return res.status(409).json({
        message: `Ya existe "${duplicada.nombre}" con el mismo alcance en el AF ${duplicada.year}.`,
        motivo: "duplicado",
        existente: { _id: duplicada._id, nombre: duplicada.nombre, year: duplicada.year },
      });
    }

    const nueva = await Plantilla.create({
      ...body,
      fechaLimite: bodyCrudo.fechaLimite ? new Date(bodyCrudo.fechaLimite) : null,
      metas: body.metas || [],
    });

    // Si el cliente mandó campos que no le corresponden, queda dicho en el
    // log: sirve para descubrir pantallas viejas que siguen mandando de más.
    const ignorados = camposIgnorados(bodyCrudo);
    if (ignorados.length) {
      console.warn(
        `[createPlantilla] ${req.user?.email || "?"} mandó campos que se ignoraron: ${ignorados.join(", ")}`
      );
    }

    res.status(201).json(conAdvertencias(nueva));
  } catch (err) {
    console.error("createPlantilla error:", err);
    res.status(500).json({ message: "Error creando plantilla" });
  }
}

export async function updatePlantilla(req, res) {
  try {
    const { id } = req.params;
    const bodyCrudo = req.body || {};

    // Lista blanca primero: filtra `version`, `createdAt`, `estadoAprobacion`
    // y demás campos de identidad que el cliente no tiene por qué escribir.
    const body = sanitizarPlantilla(bodyCrudo, { conservarMetaIds: true });

    // ⚠️ PROTECCIÓN: El alcance (scope) de una plantilla no puede cambiar después de su creación.
    // Cambiar scopeType/scopeId afectaría a todos los empleados que ya la tienen por herencia.
    // Para cambiar el alcance hay que crear una nueva plantilla.
    delete body.scopeType;
    delete body.scopeId;
    delete body.year; // el año fiscal tampoco debe cambiar

    const actual = await Plantilla.findById(id);
    if (!actual) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    const errores = validarPlantilla(body, { esCreacion: false });
    if (errores.length) {
      return res.status(400).json({ message: errores[0], errores });
    }

    // El año no viene en el body (lo borramos arriba), así que se evalúa el
    // de la plantilla: editar el contenido de un objetivo de un año cerrado
    // es tan delicado como crearlo.
    const bloqueo = bloqueoPorAnioCerrado(actual.year, req.user);
    if (bloqueo) {
      return res.status(403).json({ message: bloqueo, motivo: "anio_cerrado", year: actual.year });
    }

    // Cambiar la frecuencia le cambia el calendario al objetivo: los períodos
    // viejos dejan de generarse y los resultados cargados ahí desaparecen de
    // la vista sin borrarse. Le pasó al objetivo de capacitación de
    // Pre-Analítica. No se prohíbe —a veces es lo correcto— pero exige que
    // quien lo hace haya visto el número. La confirmación se pide del lado
    // del servidor para que ningún cliente pueda saltearla.
    if (body.frecuencia && body.frecuencia !== actual.frecuencia && !bodyCrudo.confirmarImpacto) {
      const huerfanos = await huerfanosPorCambio(id, actual.toObject(), { ...actual.toObject(), ...body });
      if (huerfanos.total > 0) {
        return res.status(409).json({
          motivo: "impacto_no_confirmado",
          message:
            `Cambiar la frecuencia de "${actual.frecuencia}" a "${body.frecuencia}" deja fuera del ` +
            `calendario ${huerfanos.total} resultados ya cargados de ${huerfanos.empleados} personas ` +
            `(${huerfanos.periodos.join(", ")}). No se borran, pero dejan de verse y el objetivo pasa ` +
            `a computar como si no tuviera datos. Confirmá el cambio si es lo que querés hacer.`,
          impacto: huerfanos,
        });
      }
    }

    // La coherencia se evalúa sobre cómo queda el objetivo, no sobre el body:
    // una edición parcial que solo manda el nombre no trae metas, y validar el
    // body suelto diría "no tiene metas" en un objetivo que sí las tiene.
    const resultante = {
      ...actual.toObject(),
      ...body,
      metas: conservarIdsDeMetas(actual.metas, body.metas),
    };
    const incoherente = cortarPorCoherencia(resultante, res);
    if (incoherente) return incoherente;

    const updated = await Plantilla.findByIdAndUpdate(
      id,
      {
        ...body,
        fechaLimite: bodyCrudo.fechaLimite ? new Date(bodyCrudo.fechaLimite) : null,
        metas: conservarIdsDeMetas(actual.metas, body.metas),
      },
      { new: true }
    );

    res.json(conAdvertencias(updated));
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

// Borrado LÓGICO. Antes era findByIdAndDelete: una plantilla borrada por error
// no se podía recuperar ni saber quién la borró. En septiembre de 2026 se
// perdieron así 4 competencias del área Atención al cliente.
export async function deletePlantilla(req, res) {
  try {
    const { id } = req.params;
    const plantilla = await Plantilla.findById(id);
    if (!plantilla) return res.status(404).json({ message: "Plantilla no encontrada" });

    // updateOne y no save(): save() valida el documento ENTERO, así que una
    // plantilla vieja a la que le falte un campo hoy requerido no se podría
    // borrar nunca (devolvía 500). Marcar la baja no debería depender de que el
    // resto del documento cumpla el esquema actual. El modelo no tiene hooks de
    // save, así que es equivalente.
    await Plantilla.updateOne(
      { _id: plantilla._id },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: {
            usuarioId: req.user?._id || null,
            email: req.user?.email || null,
          },
          activo: false,
        },
      }
    );

    res.sendStatus(204);
  } catch (err) {
    console.error("deletePlantilla error:", err);
    res.status(500).json({ message: "Error eliminando plantilla" });
  }
}

// Deshace un borrado lógico.
export async function restaurarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const plantilla = await Plantilla.findById(id).setOptions({ incluirEliminadas: true });
    if (!plantilla) return res.status(404).json({ message: "Plantilla no encontrada" });
    if (!plantilla.deletedAt) {
      return res.status(409).json({ message: "La plantilla no está eliminada" });
    }

    plantilla.deletedAt = null;
    plantilla.deletedBy = { usuarioId: null, email: null };
    await plantilla.save();

    res.json(plantilla);
  } catch (err) {
    console.error("restaurarPlantilla error:", err);
    res.status(500).json({ message: "Error restaurando plantilla" });
  }
}

// Lista lo que está en la papelera, para poder recuperarlo desde la UI.
export async function listPlantillasEliminadas(req, res) {
  try {
    const { year } = req.query;
    const filtro = { deletedAt: { $ne: null } };
    if (year) filtro.year = Number(year);
    const items = await Plantilla.find(filtro)
      .setOptions({ incluirEliminadas: true })
      .sort({ deletedAt: -1 })
      .lean();
    res.json({ items, total: items.length });
  } catch (err) {
    console.error("listPlantillasEliminadas error:", err);
    res.status(500).json({ message: "Error listando plantillas eliminadas" });
  }
}

// =======================================================
// =============  SISTEMA DE VERSIONADO ==================
// =======================================================

export async function versionarPlantilla(req, res) {
  try {
    const { id } = req.params;
    const body = sanitizarPlantilla(req.body || {}, { conservarMetaIds: true });

    // 1. Obtener la plantilla original
    const plantillaOriginal = await Plantilla.findById(id);
    if (!plantillaOriginal) {
      return res.status(404).json({ message: "Plantilla original no encontrada" });
    }

    // Versionar un objetivo de un año cerrado crea un documento nuevo dentro
    // de ese ejercicio: mismo riesgo que crearlo de cero, misma restricción.
    const bloqueo = bloqueoPorAnioCerrado(plantillaOriginal.year, req.user);
    if (bloqueo) {
      return res.status(403).json({ message: bloqueo, motivo: "anio_cerrado", year: plantillaOriginal.year });
    }

    const errores = validarPlantilla(body, { esCreacion: false });
    if (errores.length) {
      return res.status(400).json({ message: errores[0], errores });
    }

    // Una versión es el mismo objetivo más adelante en el tiempo: no puede
    // mudarse de año ni de alcance. Si hace falta eso, es un objetivo nuevo.
    delete body.year;
    delete body.scopeType;
    delete body.scopeId;

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

    // Una versión nueva arranca de cero en cuanto a coherencia: hereda la
    // configuración del padre más los cambios del formulario, y esa mezcla
    // puede quedar incoherente aunque ninguna de las dos partes lo fuera.
    const incoherente = cortarPorCoherencia(nuevaPlantillaData, res);
    if (incoherente) return incoherente;

    const nuevaPlantilla = await Plantilla.create(nuevaPlantillaData);

    res.status(201).json({
      message: "Nueva versión creada (pendiente de aprobación)",
      plantilla: conAdvertencias(nuevaPlantilla)
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

/**
 * POST /api/templates/validar
 *
 * Valida un objetivo sin guardarlo. Es lo que consume el formulario para
 * mostrar los problemas mientras se carga.
 *
 * Existe para que haya UN solo juego de reglas. La alternativa —que el
 * formulario traiga su propia copia— es exactamente lo que venía pasando con
 * el cálculo: tres implementaciones que se iban separando de a poco, y nadie
 * se enteraba hasta que dos pantallas mostraban números distintos. Acá la
 * pantalla no sabe nada: pregunta y muestra lo que le responden.
 */
export async function validarObjetivoSinGuardar(req, res) {
  try {
    const body = sanitizarPlantilla(req.body || {}, { conservarMetaIds: true });

    // Si viene el id de un objetivo existente, se valida cómo QUEDARÍA: una
    // edición parcial no trae todos los campos y hay que juzgarla completa.
    let candidato = body;
    if (req.body?._id) {
      const actual = await Plantilla.findById(req.body._id).lean();
      if (actual) candidato = { ...actual, ...body, metas: body.metas ?? actual.metas };
    }

    const formales = validarPlantilla(candidato, { esCreacion: !req.body?._id });
    const { errores, advertencias, periodos, estricto } = validarCoherenciaObjetivo(candidato);

    res.json({
      valido: formales.length === 0 && errores.length === 0,
      formales,
      errores,
      advertencias,
      periodos,
      estricto,
    });
  } catch (err) {
    console.error("validarObjetivoSinGuardar error:", err);
    res.status(500).json({ message: "Error validando el objetivo" });
  }
}

/**
 * GET /api/templates/revision?year=2026
 *
 * Pasa el validador por todos los objetivos de un año. Es la vista de
 * conjunto: cuántos objetivos tienen problemas, de qué tipo, y cuáles.
 *
 * Se usa antes de arrancar un año fiscal, que es el momento en que corregir
 * todavía es barato: una vez que se empezaron a cargar resultados, cambiarle
 * la configuración a un objetivo arrastra todo lo cargado.
 */
export async function revisionObjetivos(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    const soloActivos = req.query.soloActivos === "true";

    const filtro = { year, tipo: "objetivo" };
    if (soloActivos) filtro.activo = true;

    const plantillas = await Plantilla.find(filtro)
      .select("nombre year frecuencia scopeType scopeId activo metas pesoBase fechaCierre fechaCierreCustom")
      .lean();

    res.json({ year, ...validarLote(plantillas) });
  } catch (err) {
    console.error("revisionObjetivos error:", err);
    res.status(500).json({ message: "Error revisando los objetivos" });
  }
}
