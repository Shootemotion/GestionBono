// backend/src/controllers/seguimiento.controller.js
import Empleado from "../models/Empleado.model.js";
import Area from "../models/Area.model.js";
import Plantilla from "../models/Plantilla.model.js";

const httpErr = (msg, status = 400) =>
  Object.assign(new Error(msg), { statusCode: status });

/**
 * Resumen ejecutivo por Área (Departamento)
 * - objetivosAvg: promedio de "cobertura de configuración" por empleado
 *   cobertura = min(1, totalPeso / 100)
 *   Si el empleado no tiene objetivos propios, se usa el total del sector (plantilla) si existe.
 */
export async function seguimientoEjecutivo(req, res, next) {
  try {
    const { anio, areaId } = req.query;
    if (!anio) throw httpErr("anio requerido");

    // 1) Áreas (departamentos)
    const areas = await Area.find(areaId ? { _id: areaId } : {}, "_id nombre")
      .sort({ nombre: 1 })
      .lean();

    // 2) Empleados por área (sólo vinculados — los desvinculados no cuentan en KPIs vigentes)
    const baseFilter = areaId
      ? { area: areaId }
      : { area: { $in: areas.map((a) => a._id) } };
    const empleados = await Empleado.find(
      { ...baseFilter, estadoLaboral: { $ne: "DESVINCULADO" } },
      "_id area sector rol"
    ).lean();

    // Agrupar empleados por área
    const areaToEmps = new Map();
    for (const e of empleados) {
      const aid = String(e.area);
      if (!areaToEmps.has(aid)) areaToEmps.set(aid, []);
      areaToEmps.get(aid).push(e);
    }

    // 3) Plantillas del año (empleado + sector para fallback)
    const empIds = empleados.map((e) => e._id);
    const [tplsEmpleado, tplsSector] = await Promise.all([
      Plantilla.find(
        { year: Number(anio), scopeType: "empleado", scopeId: { $in: empIds } },
        "scopeId pesoBase"
      ).lean(),
      Plantilla.find(
        { year: Number(anio), scopeType: "sector" },
        "scopeId pesoBase"
      ).lean(),
    ]);

    // Mapas de pesos
    const pesoPorEmp = new Map(); // empleadoId -> suma pesoBase
    for (const t of tplsEmpleado) {
      const k = String(t.scopeId);
      pesoPorEmp.set(k, (pesoPorEmp.get(k) || 0) + (Number(t.pesoBase) || 0));
    }

    const pesoPorSector = new Map(); // sectorId -> suma pesoBase
    for (const t of tplsSector) {
      if (!t.scopeId) continue;
      const k = String(t.scopeId);
      pesoPorSector.set(k, (pesoPorSector.get(k) || 0) + (Number(t.pesoBase) || 0));
    }

    // 4) Armar filas por área
    const rows = [];
    for (const area of areas) {
      const list = areaToEmps.get(String(area._id)) || [];
      const empleadosCount = list.length;

      // supervisores estimados (ajustá roles si usás otros nombres)
      const supervisores = list.filter((e) =>
        ["jefe_area", "jefe_sector", "supervisor"].includes(e.rol)
      ).length;

      // promedio de cobertura de configuración de objetivos
      let acumCobertura = 0;
      for (const e of list) {
        const empPeso = pesoPorEmp.get(String(e._id)) || 0;
        const plantillaPeso = pesoPorSector.get(String(e.sector)) || 0;
        const totalConfig = empPeso > 0 ? empPeso : plantillaPeso; // si no tiene propios, usa plantilla
        const cobertura = Math.max(0, Math.min(1, totalConfig / 100)); // 0..1
        acumCobertura += cobertura;
      }
      const objetivosAvg = empleadosCount ? acumCobertura / empleadosCount : 0;

      rows.push({
        id: String(area._id),
        nombre: area.nombre,
        empleados: empleadosCount,
        supervisores,
        objetivosAvg, // 0..1
        aptitudesAvg: 0, // (pendiente)
        bono: 0, // (pendiente)
        alerts: objetivosAvg < 0.7 ? 1 : 0, // alerta simple: debajo de 70%
        topPerformer: null, // (pendiente)
      });
    }

    // 5) Resumen
    const totEmps = rows.reduce((a, r) => a + r.empleados, 0);
    const objetivosProm = rows.length
      ? (rows.reduce((a, r) => a + r.objetivosAvg, 0) / rows.length) * 100
      : 0;

    res.json({
      anio: Number(anio),
      departamentoId: areaId || null,
      resumen: {
        empleados: totEmps,
        objetivosProm,
        aptitudesProm: 0,
        bonos: 0,
        departamentos: rows.length,
      },
      departamentos: rows,
    });
  } catch (err) {
    if (err.statusCode)
      return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
}
