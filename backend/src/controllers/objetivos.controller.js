// backend/src/controllers/objetivos.controller.js
import Objetivo from '../models/Objetivo.model.js';
import Empleado from '../models/Empleado.model.js';

function httpErr(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/** Acepta:
 *  - scopeType='sector'  con sectorId (areaId opcional)
 *  - scopeType='empleado' con empleadoId
 */
const buildScopeFilter = (q) => {
  const { scopeType, sectorId, areaId, empleadoId } = q || {};
  if (!scopeType) return {};

  if (scopeType === 'sector') {
    if (!sectorId) throw httpErr('sectorId requerido para scopeType=sector');
    const f = { scopeType: 'sector', sectorId };
    if (areaId) f.areaId = areaId;
    return f;
  }

  if (scopeType === 'empleado') {
    if (!empleadoId) throw httpErr('empleadoId requerido para scopeType=empleado');
    return { scopeType: 'empleado', empleadoId };
  }

  throw httpErr('scopeType inválido (sector | empleado)');
};

function sanitizeCreate(body) {
  const out = { ...body };

  // normalizaciones
  out.anio = Number(out.anio);
  ['areaId', 'sectorId', 'empleadoId'].forEach(k => { if (!out[k]) delete out[k]; });
  if (out.peso !== undefined) out.peso = Number(out.peso) || 0;
  if ('fechaLimite' in out && !out.fechaLimite) out.fechaLimite = null;

  // valida alcance
  buildScopeFilter(out);
  return out;
}

function sanitizeUpdate(body) {
  const out = { ...body };
  if ('anio' in out) out.anio = Number(out.anio);
  if ('peso' in out) out.peso = Number(out.peso) || 0;
  if ('fechaLimite' in out && !out.fechaLimite) out.fechaLimite = null;

  if ('areaId' in out && !out.areaId) delete out.areaId;
  if ('sectorId' in out && !out.sectorId) delete out.sectorId;
  if ('empleadoId' in out && !out.empleadoId) delete out.empleadoId;

  if ('scopeType' in out) buildScopeFilter(out);
  return out;
}

export async function listarObjetivos(req, res, next) {
  try {
    const { anio } = req.query;
    if (!anio) throw httpErr('anio requerido');
    const filter = { anio: Number(anio), ...buildScopeFilter(req.query) };
    const docs = await Objetivo.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { next(err); }
}

export async function crearObjetivo(req, res, next) {
  try {
    console.log('>>> crearObjetivo BODY:', req.body); // DEBUG ÚTIL
    const clean = sanitizeCreate(req.body);
    const doc = await Objetivo.create(clean);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function editarObjetivo(req, res, next) {
  try {
    const { id } = req.params;
    const update = sanitizeUpdate(req.body);
    const doc = await Objetivo.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
}

export async function eliminarObjetivo(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await Objetivo.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    res.sendStatus(204);
  } catch (err) { next(err); }
}

/** Asignación masiva:
 *  Copia objetivos de plantilla (scopeType='sector') a cada empleado del sector.
 */
export async function asignacionMasiva(req, res, next) {
  try {
    const { anio, sectorId } = req.body;
    if (!anio) throw httpErr('anio es obligatorio');
    if (!sectorId) throw httpErr('sectorId es obligatorio');

    const plantilla = await Objetivo.find({ anio, scopeType: 'sector', sectorId });
    const empleados = await Empleado.find({ sector: sectorId });

    if (plantilla.length === 0 || empleados.length === 0) {
      return res.json({ creados: 0, omitidos: 0, empleados: empleados.length, plantilla: plantilla.length });
    }

    let creados = 0, omitidos = 0;
    const ops = [];

    for (const emp of empleados) {
      for (const p of plantilla) {
        const existe = await Objetivo.findOne({
          anio, scopeType: 'empleado', empleadoId: emp._id, nombre: p.nombre,
        });
        if (existe) { omitidos++; continue; }

        ops.push({
          anio,
          scopeType: 'empleado',
          empleadoId: emp._id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          kpi: p.kpi,
          target: p.target,
          peso: Number(p.peso) || 0,
          fechaLimite: p.fechaLimite || null,
          metodo: p.metodo,
        });
      }
    }

    if (ops.length) {
      await Objetivo.insertMany(ops, { ordered: false });
      creados = ops.length;
    }
    res.json({ creados, omitidos, empleados: empleados.length, plantilla: plantilla.length });
  } catch (err) { next(err); }
}
