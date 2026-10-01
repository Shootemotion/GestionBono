// backend/src/controllers/restaurador.controller.js
//
// Restauración por empleado desde un backup.
//
// QUÉ RESTAURA Y QUÉ NO
// ─────────────────────
// Restaura SOLO los overrides del empleado: qué objetivos tiene asignados y
// con qué peso. Nada más.
//
// NO toca evaluaciones, feedbacks ni notas cerradas. Los resultados cargados y
// las notas ya comunicadas quedan exactamente como están. Lo que se corrige es
// la configuración —la lista de objetivos y sus pesos— para devolverla al
// estado previo al desorden. La nota en vivo cambia como consecuencia de que
// los pesos vuelvan a ser los correctos, no porque se toquen los resultados.
//
// Por qué solo overrides: son el único objeto que existe por empleado. Una
// plantilla de sector la comparten diez personas, así que modificarla para
// arreglar a una rompería a las otras nueve. Las plantillas duplicadas se
// manejan desde "Objetivos sin Datos", que sí razona a nivel plantilla.
//
// Siempre hay vista previa: el front pide el plan, lo muestra, y recién
// entonces se ejecuta de a un empleado por vez.

import mongoose from "mongoose";
import AdmZip from "adm-zip";
import Empleado from "../models/Empleado.model.js";
import Plantilla from "../models/Plantilla.model.js";
import Evaluacion from "../models/Evaluacion.model.js";
import OverrideObjetivo from "../models/OverrideObjetivo.model.js";
import Area from "../models/Area.model.js";
import Sector from "../models/Sector.model.js";
import Auditoria from "../models/Auditoria.model.js";

/** Lee una colección del zip del backup. */
export function leerColeccion(zip, nombre) {
  const e = zip.getEntries().find((x) => x.entryName.split("/").pop() === `${nombre}.json`);
  if (!e) return null;
  try { return JSON.parse(e.getData().toString("utf8")); } catch { return null; }
}

export function abrirZip(buffer) {
  try { return new AdmZip(buffer); } catch { return null; }
}

/**
 * Objetivos que le aplican a un empleado, con la misma regla que el dashboard:
 * un override incluyente fuerza la inclusión; si no, alcance o historial.
 */
export function resolverObjetivos(emp, plantillas, overrides, historial, anio) {
  const mios = overrides.filter(
    (o) => String(o.empleado) === String(emp._id) && Number(o.year) === anio
  );
  const out = [];
  for (const p of plantillas) {
    if (Number(p.year) !== anio || p.tipo !== "objetivo") continue;
    const ov = mios.find((o) => String(o.template) === String(p._id));
    if (ov?.excluido) continue;
    const forzado = ov && !ov.excluido;
    const sticky = historial.has(`${emp._id}_${p._id}`);
    const enAlcance = p.activo !== false && !p.deletedAt && (
      (p.scopeType === "sector" && String(p.scopeId) === String(emp.sector)) ||
      (p.scopeType === "area" && String(p.scopeId) === String(emp.area)) ||
      (["empleado", "employee"].includes(p.scopeType) && String(p.scopeId) === String(emp._id))
    );
    if (!forzado && !sticky && !enAlcance) continue;
    out.push({
      plantillaId: String(p._id),
      nombre: p.nombre,
      peso: (ov && ov.peso != null) ? Number(ov.peso) : Number(p.pesoBase || 0),
      origen: forzado ? "override" : sticky ? "historial" : "alcance",
    });
  }
  out.sort((a, b) => b.peso - a.peso || String(a.nombre).localeCompare(String(b.nombre), "es"));
  return out;
}

/** Operaciones necesarias para llevar los overrides del empleado al backup. */
export function planDeOverrides(empId, anio, ovBackup, ovActual) {
  const mios = (arr) => arr.filter(
    (o) => String(o.empleado) === String(empId) && Number(o.year) === anio
  );
  const bk = new Map(mios(ovBackup).map((o) => [String(o.template), o]));
  const ac = new Map(mios(ovActual).map((o) => [String(o.template), o]));

  const ops = [];
  for (const [tpl, o] of bk) {
    const actual = ac.get(tpl);
    if (!actual) {
      ops.push({ op: "recrear", template: tpl, excluido: !!o.excluido, peso: o.peso ?? null });
    } else if (!!actual.excluido !== !!o.excluido || (actual.peso ?? null) !== (o.peso ?? null)) {
      ops.push({
        op: "ajustar", template: tpl, _id: String(actual._id),
        de: { excluido: !!actual.excluido, peso: actual.peso ?? null },
        a: { excluido: !!o.excluido, peso: o.peso ?? null },
      });
    }
  }
  for (const [tpl, o] of ac) {
    if (!bk.has(tpl)) {
      ops.push({ op: "eliminar", template: tpl, _id: String(o._id), excluido: !!o.excluido, peso: o.peso ?? null });
    }
  }
  return ops;
}

/**
 * Vista previa: para cada empleado del alcance pedido, cómo quedarían sus
 * objetivos si se restaurara su configuración desde el backup.
 */
export async function previoRestauracion(req, res) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "Falta el archivo .zip del backup" });
    const anio = Number(req.query.anio);
    if (!anio) return res.status(400).json({ message: "Parámetro 'anio' requerido" });

    const zip = abrirZip(req.file.buffer);
    if (!zip) return res.status(400).json({ message: "El archivo no es un .zip válido" });

    const plBk = leerColeccion(zip, "plantillas");
    const ovBk = leerColeccion(zip, "overrideobjetivos");
    if (!plBk || !ovBk) {
      return res.status(400).json({ message: "El backup no contiene plantillas y overrides" });
    }

    const filtro = {};
    if (req.query.empleadoId && mongoose.Types.ObjectId.isValid(req.query.empleadoId)) {
      filtro._id = req.query.empleadoId;
    }
    if (req.query.areaId && mongoose.Types.ObjectId.isValid(req.query.areaId)) {
      filtro.area = req.query.areaId;
    }
    if (req.query.incluirDesvinculados !== "true") filtro.estadoLaboral = "VINCULADO";

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
    const nArea = new Map(areas.map((a) => [String(a._id), a.nombre]));
    const nSector = new Map(sectores.map((s) => [String(s._id), s.nombre]));

    const items = empleados.map((e) => {
      const ahora = resolverObjetivos(e, plNow, ovNow, historial, anio);
      // CÓMO QUEDARÍA: plantillas de HOY con los overrides del backup.
      // Restaurar solo toca overrides, así que las plantillas siguen siendo las
      // actuales. Calcularlo con las plantillas del backup mostraría un estado
      // que no va a ocurrir —por ejemplo, ocultaría un duplicado creado después
      // del backup, que en realidad va a reaparecer.
      const despues = resolverObjetivos(e, plNow, ovBk, historial, anio);
      // El estado del backup tal cual, solo como referencia de contexto.
      const backup = resolverObjetivos(e, plBk, ovBk, historial, anio);
      const ops = planDeOverrides(e._id, anio, ovBk, ovNow);

      const idsA = new Set(ahora.map((x) => x.plantillaId));
      const idsB = new Set(despues.map((x) => x.plantillaId));
      const mapA = new Map(ahora.map((x) => [x.plantillaId, x]));

      const sumaAhora = ahora.reduce((a, x) => a + x.peso, 0);
      const sumaDespues = despues.reduce((a, x) => a + x.peso, 0);
      const sumaBackup = backup.reduce((a, x) => a + x.peso, 0);

      // Marca los que tienen resultados cargados: restaurar no borra nada,
      // pero si un objetivo ya evaluado saliera de la lista hay que mirarlo.
      const seQuitan = ahora
        .filter((x) => !idsB.has(x.plantillaId))
        .map((x) => ({ ...x, tieneDatos: conDato.has(`${e._id}_${x.plantillaId}`) }));
      const seAgregan = despues
        .filter((x) => !idsA.has(x.plantillaId))
        .map((x) => ({ ...x, tieneDatos: conDato.has(`${e._id}_${x.plantillaId}`) }));
      const cambianPeso = despues
        .filter((x) => idsA.has(x.plantillaId) && mapA.get(x.plantillaId).peso !== x.peso)
        .map((x) => ({ ...x, pesoAhora: mapA.get(x.plantillaId).peso }));

      return {
        empleadoId: String(e._id),
        nombre: `${e.apellido || ""} ${e.nombre || ""}`.trim(),
        area: nArea.get(String(e.area)) || "—",
        areaId: String(e.area || ""),
        sector: nSector.get(String(e.sector)) || "—",
        ahora: { objetivos: ahora, suma: sumaAhora },
        despues: { objetivos: despues, suma: sumaDespues },
        backup: { objetivos: backup, suma: sumaBackup },
        seQuitan, seAgregan, cambianPeso,
        operaciones: ops,
        // Solo hay algo para restaurar si hay operaciones sobre overrides.
        cambia: ops.length > 0,
        // La suma no vuelve al backup aunque se restaure: la diferencia que
        // queda viene de plantillas creadas o borradas después, que son
        // compartidas y no se arreglan por empleado.
        quedaDiferenciaPorPlantillas: sumaDespues !== sumaBackup,
        riesgo: seQuitan.some((x) => x.tieneDatos),
      };
    });

    items.sort((a, b) =>
      Number(b.cambia) - Number(a.cambia) ||
      String(a.area).localeCompare(String(b.area), "es") ||
      String(a.nombre).localeCompare(String(b.nombre), "es"));

    res.json({
      anio,
      archivo: req.file.originalname,
      total: items.length,
      conCambios: items.filter((i) => i.cambia).length,
      conRiesgo: items.filter((i) => i.riesgo).length,
      items,
    });
  } catch (err) {
    console.error("previoRestauracion error:", err);
    res.status(500).json({ message: "Error calculando la vista previa" });
  }
}

/**
 * Aplica la restauración de asignaciones de UN empleado. Deja registro en la
 * auditoría con el estado previo completo, así que se puede deshacer.
 */
export async function restaurarEmpleado(req, res) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "Falta el archivo .zip del backup" });
    const anio = Number(req.query.anio);
    const empleadoId = req.query.empleadoId;
    if (!anio || !empleadoId) return res.status(400).json({ message: "Se requieren 'anio' y 'empleadoId'" });
    if (!mongoose.Types.ObjectId.isValid(empleadoId)) {
      return res.status(400).json({ message: "empleadoId inválido" });
    }

    const zip = abrirZip(req.file.buffer);
    if (!zip) return res.status(400).json({ message: "El archivo no es un .zip válido" });
    const ovBk = leerColeccion(zip, "overrideobjetivos");
    if (!ovBk) return res.status(400).json({ message: "El backup no contiene overrides" });

    const empleado = await Empleado.findById(empleadoId, "nombre apellido").lean();
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    const ovNow = await OverrideObjetivo.find({ year: anio, empleado: empleadoId }).lean();
    const ops = planDeOverrides(empleadoId, anio, ovBk, ovNow);
    if (!ops.length) {
      return res.json({ message: "No hay nada que restaurar", aplicadas: 0, operaciones: [] });
    }

    const aplicadas = [];
    for (const op of ops) {
      if (op.op === "recrear") {
        await OverrideObjetivo.updateOne(
          { empleado: empleadoId, year: anio, template: op.template },
          { $set: { excluido: op.excluido, peso: op.peso, meta: null } },
          { upsert: true }
        );
      } else if (op.op === "ajustar") {
        await OverrideObjetivo.updateOne(
          { _id: op._id },
          { $set: { excluido: op.a.excluido, peso: op.a.peso } }
        );
      } else if (op.op === "eliminar") {
        await OverrideObjetivo.deleteOne({ _id: op._id });
      }
      aplicadas.push(op);
    }

    await Auditoria.create({
      usuarioId: req.user?._id || null,
      email: req.user?.email || null,
      rol: req.user?.rol || null,
      accion: "RESTAURAR",
      entidad: "override",
      documentoId: null,
      resumen: `Restauración de asignaciones de "${empleado.apellido} ${empleado.nombre}" (AF ${anio}) desde ${req.file.originalname}: ${aplicadas.length} operaciones`,
      antes: ovNow,
      cambios: { anio, empleadoId, archivo: req.file.originalname, operaciones: aplicadas },
      metodo: req.method,
      ruta: String(req.originalUrl || "").split("?")[0],
      statusCode: 200,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      message: `Restauradas ${aplicadas.length} asignaciones de ${empleado.apellido} ${empleado.nombre}`,
      aplicadas: aplicadas.length,
      operaciones: aplicadas,
    });
  } catch (err) {
    console.error("restaurarEmpleado error:", err);
    res.status(500).json({ message: "Error restaurando" });
  }
}
