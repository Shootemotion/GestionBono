// backend/src/controllers/aptitudes.controller.js
import Aptitud from '../models/Aptitud.model.js';
import Empleado from '../models/Empleado.model.js';

function httpErr(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

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
  ['areaId', 'sectorId', 'empleadoId'].forEach(k => { if (!out[k]) delete out[k]; });
  if ('fechaLimite' in out && !out.fechaLimite) out.fechaLimite = null;
  buildScopeFilter(out);
  return out;
}

function sanitizeUpdate(body) {
  const out = { ...body };
  if ('fechaLimite' in out && !out.fechaLimite) out.fechaLimite = null;
  if ('areaId' in out && !out.areaId) delete out.areaId;
  if ('sectorId' in out && !out.sectorId) delete out.sectorId;
  if ('empleadoId' in out && !out.empleadoId) delete out.empleadoId;
  if ('scopeType' in out) buildScopeFilter(out);
  return out;
}

export async function listarAptitudes(req, res, next) {
  try {
    const filter = buildScopeFilter(req.query);
    const docs = await Aptitud.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { next(err); }
}

export async function crearAptitud(req, res, next) {
  try {
    console.log('>>> crearAptitud BODY:', req.body);
    const clean = sanitizeCreate(req.body);
    const doc = await Aptitud.create(clean);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export const getTotalesAptitudes = async (req, res) => {
  try {
    const { anio, scopeType, areaId, sectorId, empleadoId } = req.query;

    // filtra aptitudes para ese scope
    const filtros = { anio, scopeType };
    if (areaId) filtros.areaId = areaId;
    if (sectorId) filtros.sectorId = sectorId;
    if (empleadoId) filtros.empleadoId = empleadoId;

    const aptitudes = await Aptitud.find(filtros);

    // suma pesos por tipo
    const totalCorporativas = aptitudes
      .filter(a => a.tipo === 'corporativa')
      .reduce((acc, a) => acc + (a.peso || 0), 0);

    const totalEspeciales = aptitudes
      .filter(a => a.tipo === 'especial')
      .reduce((acc, a) => acc + (a.peso || 0), 0);

    // recuerda: 100% de corporativas = 50% global
    const totalCorporativasGlobal = totalCorporativas * 0.5 / 100 * 100;
    const totalEspecialesGlobal = totalEspeciales * 0.5 / 100 * 100;

    res.json({
      totalCorporativas,
      totalEspeciales,
      totalCorporativasGlobal,
      totalEspecialesGlobal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export async function editarAptitud(req, res, next) {
  try {
    const { id } = req.params;
    const update = sanitizeUpdate(req.body);
    const doc = await Aptitud.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
}

export async function eliminarAptitud(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await Aptitud.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    res.sendStatus(204);
  } catch (err) { next(err); }
}
export const asignacionMasivaEmpleados = async (req, res, next) => {
  try {
    const { anio, empleadoIds, aptitud } = req.body;
    if (!anio || !Array.isArray(empleadoIds) || empleadoIds.length === 0) {
      return res.status(400).json({ message: 'anio y empleadoIds[] requeridos' });
    }
    if (!aptitud?.nombre) return res.status(400).json({ message: 'aptitud.nombre requerido' });

    const docs = empleadoIds
      .filter(Boolean)
      .map(eid => ({
        anio: Number(anio),
        scopeType: 'empleado',
        empleadoId: eid,
        nombre: aptitud.nombre,
        descripcion: aptitud.descripcion || '',
        peso: Number(aptitud.peso) || 0,
        metodo: aptitud.metodo || 'anual',
        fechaLimite: aptitud.fechaLimite || null,
      }));

    if (docs.length === 0) return res.status(400).json({ message: 'Sin empleados válidos' });

    const result = await Aptitud.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: result.length });
  } catch (err) { next(err); }
};
