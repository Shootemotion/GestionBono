// backend/src/controllers/depuracion.controller.js
//
// Depuración de objetivos duplicados, empleado por empleado y en dos pasos.
//
// EL PROBLEMA
// En enero de 2026 se clonaron los objetivos de varios sectores del Área
// Técnica. Los clones quedaron con alcance de sector, así que a cada persona le
// aparecen hoy DOS veces los mismos objetivos: el original —que tiene sus
// evaluaciones cargadas— y el clon, que nunca se evaluó. Eso lleva las sumas de
// pesos a 190%, 220% o 250%. Además, entre el 22 y el 24 de septiembre se
// borraron 29 overrides que fijaban el peso correcto de los objetivos reales.
//
// EL PLAN, EN DOS PASOS QUE NO SE PUEDEN INVERTIR
//   PASO 1  Devolver los overrides de peso desde un backup previo al desorden.
//   PASO 2  Excluir, para esa persona, los objetivos sin ninguna evaluación
//           con resultado cargado.
//
// El orden importa: las exclusiones del paso 2 se calculan sobre los pesos ya
// corregidos. Si se purga primero, los pesos quedan mal y hay que rehacerlo.
// Por eso el paso 2 se rechaza con 409 mientras el paso 1 tenga pendientes: la
// restricción vive en el backend, no en la pantalla.
//
// Verificado sobre los 27 del Área Técnica: los dos pasos dejan a los 27 en
// 100% exacto. El criterio "sin evaluaciones" funciona porque en estos datos
// nadie cargó resultados sobre un clon — es un hecho comprobado de este caso,
// no una regla universal. Por eso siempre se muestra qué se conserva y qué se
// excluye antes de aplicar.
//
// Solo se escriben overrides: nunca se tocan evaluaciones, feedbacks ni notas.

import mongoose from "mongoose";
import Empleado from "../models/Empleado.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import OverrideObjetivo from "../models/OverrideObjetivo.model.js";
import Area from "../models/Area.model.js";
import Sector from "../models/Sector.model.js";
import Auditoria from "../models/Auditoria.model.js";
import { abrirZip, leerColeccion, resolverObjetivos, planDeOverrides } from "./restaurador.controller.js";

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();

/**
 * Marca de los overrides que crea el paso 2.
 *
 * Hace falta porque los dos pasos se pisarían: el paso 2 crea exclusiones que
 * el backup no tiene, y el paso 1 —que reconcilia contra el backup— las vería
 * como sobrantes y las borraría, deshaciendo la purga. El empleado volvería a
 * aparecer como pendiente para siempre.
 *
 * Con la marca, el paso 1 las ignora: son decisiones tomadas después del
 * backup, no restos del desorden.
 */
export const MARCA_PASO2 = "depuracion:sin-evaluaciones";

/** Como planDeOverrides, pero sin proponer borrar lo que puso el paso 2. */
function planPaso1(empId, anio, ovBackup, ovActual) {
  const sinMarca = ovActual.filter((o) => o.notas !== MARCA_PASO2);
  return planDeOverrides(empId, anio, ovBackup, sinMarca);
}

/** Contexto común: empleados del alcance + todo lo necesario para resolver. */
async function contexto({ anio, areaId, empleadoId, incluirDesvinculados }) {
  const filtro = {};
  if (empleadoId && mongoose.Types.ObjectId.isValid(empleadoId)) filtro._id = empleadoId;
  if (areaId && mongoose.Types.ObjectId.isValid(areaId)) filtro.area = areaId;
  if (!incluirDesvinculados) filtro.estadoLaboral = "VINCULADO";

  const [empleados, plNow, ovNow, evals, areas, sectores] = await Promise.all([
    Empleado.find(filtro, "nombre apellido area sector").lean(),
    Plantilla.find({}).lean(),
    OverrideObjetivo.find({ year: anio }).lean(),
    Evaluacion.find({}, "empleado plantillaId metasResultados").lean(),
    Area.find({}, "nombre").lean(),
    Sector.find({}, "nombre").lean(),
  ]);

  const historial = new Set(evals.map((v) => `${v.empleado}_${v.plantillaId}`));
  const conDato = new Set();
  for (const v of evals) {
    if ((v.metasResultados || []).some((m) => m.resultado !== null && m.resultado !== undefined)) {
      conDato.add(`${v.empleado}_${v.plantillaId}`);
    }
  }
  return {
    empleados, plNow, ovNow, historial, conDato,
    nArea: new Map(areas.map((a) => [String(a._id), a.nombre])),
    nSector: new Map(sectores.map((s) => [String(s._id), s.nombre])),
  };
}

const suma = (l) => l.reduce((a, x) => a + x.peso, 0);

/** Marca cuáles son duplicados por nombre dentro de la lista de una persona. */
function marcarDuplicados(lista) {
  const cuenta = new Map();
  for (const o of lista) cuenta.set(norm(o.nombre), (cuenta.get(norm(o.nombre)) || 0) + 1);
  return lista.map((o) => ({ ...o, duplicado: cuenta.get(norm(o.nombre)) > 1 }));
}

/**
 * Estado y plan de un empleado. Si viene el backup, calcula el paso 1; si no,
 * asume que ya está hecho y solo calcula el paso 2.
 */
function planEmpleado(e, ctx, anio, ovBk) {
  const { plNow, ovNow, historial, conDato, nArea, nSector } = ctx;

  const conDatos = (l) => l.map((o) => ({ ...o, tieneDatos: conDato.has(`${e._id}_${o.plantillaId}`) }));

  const actual = marcarDuplicados(conDatos(resolverObjetivos(e, plNow, ovNow, historial, anio)));

  // PASO 1 — pesos desde el backup.
  // La proyección combina los overrides del backup con las exclusiones que ya
  // dejó el paso 2: si no, los objetivos purgados reaparecerían acá y el
  // empleado volvería a figurar como pendiente después de haberlo corregido.
  const ops1 = ovBk ? planPaso1(e._id, anio, ovBk, ovNow) : [];
  const marcas = ovNow.filter(
    (o) => o.notas === MARCA_PASO2 && String(o.empleado) === String(e._id)
  );
  const trasPaso1 = ovBk
    ? marcarDuplicados(conDatos(resolverObjetivos(e, plNow, [...ovBk, ...marcas], historial, anio)))
    : actual;

  // PASO 2 — excluir lo que no tiene ninguna evaluación cargada
  const conserva = trasPaso1.filter((o) => o.tieneDatos);
  const excluye = trasPaso1.filter((o) => !o.tieneDatos);

  return {
    empleadoId: String(e._id),
    nombre: `${e.apellido || ""} ${e.nombre || ""}`.trim(),
    area: nArea.get(String(e.area)) || "—",
    sector: nSector.get(String(e.sector)) || "—",
    actual: { objetivos: actual, suma: suma(actual) },
    paso1: {
      pendiente: ops1.length > 0,
      operaciones: ops1,
      resultado: { objetivos: trasPaso1, suma: suma(trasPaso1) },
    },
    paso2: {
      pendiente: excluye.length > 0,
      conserva, excluye,
      resultado: { objetivos: conserva, suma: suma(conserva) },
    },
    // Cierra en 100 si se hacen los dos pasos: la señal de que quedó prolijo.
    cierraEn100: suma(conserva) === 100,
    listo: ops1.length === 0 && excluye.length === 0,
  };
}

/** Plan para todos los empleados del alcance (requiere el zip del backup). */
export async function planDepuracion(req, res) {
  try {
    const anio = Number(req.query.anio);
    if (!anio) return res.status(400).json({ message: "Parámetro 'anio' requerido" });

    let ovBk = null;
    if (req.file?.buffer) {
      const zip = abrirZip(req.file.buffer);
      if (!zip) return res.status(400).json({ message: "El archivo no es un .zip válido" });
      ovBk = leerColeccion(zip, "overrideobjetivos");
      if (!ovBk) return res.status(400).json({ message: "El backup no contiene overrides" });
    }

    const ctx = await contexto({
      anio,
      areaId: req.query.areaId,
      empleadoId: req.query.empleadoId,
      incluirDesvinculados: req.query.incluirDesvinculados === "true",
    });

    const items = ctx.empleados
      .map((e) => planEmpleado(e, ctx, anio, ovBk))
      .filter((i) => i.actual.objetivos.length > 0);

    items.sort((a, b) =>
      Number(b.paso1.pendiente || b.paso2.pendiente) - Number(a.paso1.pendiente || a.paso2.pendiente) ||
      String(a.nombre).localeCompare(String(b.nombre), "es"));

    res.json({
      anio,
      conBackup: !!ovBk,
      archivo: req.file?.originalname || null,
      total: items.length,
      listos: items.filter((i) => i.listo).length,
      pendientesPaso1: items.filter((i) => i.paso1.pendiente).length,
      pendientesPaso2: items.filter((i) => i.paso2.pendiente).length,
      noCierran: items.filter((i) => !i.cierraEn100).length,
      items,
    });
  } catch (err) {
    console.error("planDepuracion error:", err);
    res.status(500).json({ message: "Error calculando el plan" });
  }
}

/** PASO 1: devolver los overrides de peso de un empleado desde el backup. */
export async function aplicarPaso1(req, res) {
  try {
    const anio = Number(req.query.anio);
    const empleadoId = req.query.empleadoId;
    if (!anio || !empleadoId) return res.status(400).json({ message: "Se requieren 'anio' y 'empleadoId'" });
    if (!mongoose.Types.ObjectId.isValid(empleadoId)) return res.status(400).json({ message: "empleadoId inválido" });
    if (!req.file?.buffer) return res.status(400).json({ message: "El paso 1 necesita el .zip del backup" });

    const zip = abrirZip(req.file.buffer);
    if (!zip) return res.status(400).json({ message: "El archivo no es un .zip válido" });
    const ovBk = leerColeccion(zip, "overrideobjetivos");
    if (!ovBk) return res.status(400).json({ message: "El backup no contiene overrides" });

    const empleado = await Empleado.findById(empleadoId, "nombre apellido").lean();
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    const ovNow = await OverrideObjetivo.find({ year: anio, empleado: empleadoId }).lean();
    const ops = planPaso1(empleadoId, anio, ovBk, ovNow);
    if (!ops.length) return res.json({ message: "El paso 1 ya estaba hecho", aplicadas: 0 });

    for (const op of ops) {
      if (op.op === "recrear") {
        await OverrideObjetivo.updateOne(
          { empleado: empleadoId, year: anio, template: op.template },
          { $set: { excluido: op.excluido, peso: op.peso, meta: null } },
          { upsert: true }
        );
      } else if (op.op === "ajustar") {
        await OverrideObjetivo.updateOne({ _id: op._id }, { $set: { excluido: op.a.excluido, peso: op.a.peso } });
      } else if (op.op === "eliminar") {
        await OverrideObjetivo.deleteOne({ _id: op._id });
      }
    }

    await Auditoria.create({
      usuarioId: req.user?._id || null, email: req.user?.email || null, rol: req.user?.rol || null,
      accion: "RESTAURAR", entidad: "override", documentoId: null,
      resumen: `Depuración paso 1 (pesos) de "${empleado.apellido} ${empleado.nombre}" AF ${anio} desde ${req.file.originalname}: ${ops.length} operaciones`,
      antes: ovNow,
      cambios: { paso: 1, anio, empleadoId, archivo: req.file.originalname, operaciones: ops },
      metodo: req.method, ruta: String(req.originalUrl || "").split("?")[0],
      statusCode: 200, ip: req.ip, userAgent: req.get("user-agent"),
    });

    res.json({ message: `Paso 1 aplicado: ${ops.length} pesos restaurados`, aplicadas: ops.length });
  } catch (err) {
    console.error("aplicarPaso1 error:", err);
    res.status(500).json({ message: "Error aplicando el paso 1" });
  }
}

/**
 * PASO 2: excluir los objetivos sin ninguna evaluación cargada.
 * Se rechaza si el paso 1 sigue pendiente — el orden no es opcional.
 */
export async function aplicarPaso2(req, res) {
  try {
    const anio = Number(req.query.anio);
    const empleadoId = req.query.empleadoId;
    if (!anio || !empleadoId) return res.status(400).json({ message: "Se requieren 'anio' y 'empleadoId'" });
    if (!mongoose.Types.ObjectId.isValid(empleadoId)) return res.status(400).json({ message: "empleadoId inválido" });

    // Si mandan el backup, se verifica que el paso 1 esté saldado.
    if (req.file?.buffer) {
      const zip = abrirZip(req.file.buffer);
      const ovBk = zip ? leerColeccion(zip, "overrideobjetivos") : null;
      if (ovBk) {
        const ovNow = await OverrideObjetivo.find({ year: anio, empleado: empleadoId }).lean();
        const pend = planPaso1(empleadoId, anio, ovBk, ovNow);
        if (pend.length) {
          return res.status(409).json({
            message: `El paso 1 todavía tiene ${pend.length} operaciones pendientes. Hay que restaurar los pesos antes de purgar, porque las exclusiones se calculan sobre los pesos corregidos.`,
            pendientes: pend.length,
          });
        }
      }
    }

    const ctx = await contexto({ anio, empleadoId, incluirDesvinculados: true });
    const emp = ctx.empleados[0];
    if (!emp) return res.status(404).json({ message: "Empleado no encontrado" });

    const plan = planEmpleado(emp, ctx, anio, null);
    const aExcluir = plan.paso2.excluye;
    if (!aExcluir.length) return res.json({ message: "No hay objetivos para excluir", aplicadas: 0 });

    const antes = await OverrideObjetivo.find({ year: anio, empleado: empleadoId }).lean();
    for (const o of aExcluir) {
      await OverrideObjetivo.updateOne(
        { empleado: empleadoId, year: anio, template: o.plantillaId },
        { $set: { excluido: true, peso: null, meta: null, notas: MARCA_PASO2 } },
        { upsert: true }
      );
    }

    await Auditoria.create({
      usuarioId: req.user?._id || null, email: req.user?.email || null, rol: req.user?.rol || null,
      accion: "EDITAR", entidad: "override", documentoId: null,
      resumen: `Depuración paso 2 (duplicados) de "${emp.apellido} ${emp.nombre}" AF ${anio}: ${aExcluir.length} objetivos sin evaluaciones excluidos`,
      antes,
      cambios: {
        paso: 2, anio, empleadoId,
        excluidos: aExcluir.map((o) => ({ plantillaId: o.plantillaId, nombre: o.nombre, peso: o.peso })),
        conservados: plan.paso2.conserva.map((o) => ({ nombre: o.nombre, peso: o.peso })),
        sumaFinal: plan.paso2.resultado.suma,
      },
      metodo: req.method, ruta: String(req.originalUrl || "").split("?")[0],
      statusCode: 200, ip: req.ip, userAgent: req.get("user-agent"),
    });

    res.json({
      message: `Paso 2 aplicado: ${aExcluir.length} duplicados excluidos. ${emp.apellido} queda en ${plan.paso2.resultado.suma}%`,
      aplicadas: aExcluir.length,
      sumaFinal: plan.paso2.resultado.suma,
    });
  } catch (err) {
    console.error("aplicarPaso2 error:", err);
    res.status(500).json({ message: "Error aplicando el paso 2" });
  }
}
