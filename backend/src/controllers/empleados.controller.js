// backend/src/controllers/empleados.controller.js
import Empleado from '../models/Empleado.model.js';
import Carrera from '../models/Carrera.model.js';
import OverrideObjetivo from '../models/OverrideObjetivo.model.js';
import Plantilla from '../models/Plantilla.model.js';
import mongoose from "mongoose";

export const getEmpleados = async (req, res, next) => {
  try {

    // 🔎 filtros + búsqueda + paginación
    const {
      area,
      sector,
      q = "",
      page = 1,
      limit = 25,
      sort = "apellido,nombre", // "campo" o "-campo"
    } = req.query;

    const filter = {};
    if (area && mongoose.isValidObjectId(area)) filter.area = area;
    if (sector && mongoose.isValidObjectId(sector)) filter.sector = sector;
    if (q) {
      const safeQ = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
      const rx = new RegExp(safeQ, "i");
      filter.$or = [
        { nombre: rx },
        { apellido: rx },
        { email: rx },
        { dni: rx },
        { cuil: rx },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * pageSize;

    // sort multi-campo: "a,-b,c"
    const sortObj = {};
    String(sort)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => (sortObj[s.replace(/^-/, "")] = s.startsWith("-") ? -1 : 1));

    const [items, total] = await Promise.all([
      Empleado.find(filter)
        .select("nombre apellido email dni cuil puesto categoria area sector sueldoBase fotoUrl createdAt updatedAt celular apodo fechaIngreso domicilio genero")
        .populate("area", "nombre")
        .populate("sector", "nombre")
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Empleado.countDocuments(filter),
    ]);

    res.json({
      items,
      page: pageNum,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    });



  } catch (err) {
    next(err);
  }
};


export const createEmpleado = async (req, res, next) => {
  try {
    const {
      nombre,
      apellido,
      puesto,
      email,
      dni,
      cuil,
      fechaIngreso,
      area,
      sector,
      antiguedadReconocidaAnios,
      domicilio,
      celular,
      apodo,
      categoria,
      genero,
      sueldoBase, // { monto, moneda, vigenteDesde }
    } = req.body;

    if (!nombre || !apellido || !dni || !cuil || !fechaIngreso || !puesto || !area || !sector) {
      return res.status(400).json({ message: 'Faltan campos requeridos.' });
    }

    const empleado = await Empleado.create({
      nombre,
      apellido,
      puesto,
      email,
      dni,
      cuil,
      fechaIngreso,
      area,
      sector,
      antiguedadReconocidaAnios,
      domicilio,
      celular,
      apodo,
      categoria,
      genero,
      ...(sueldoBase ? { sueldoBase } : {}), // opcional, si viene lo guarda
    });

    // Crear registro inicial en Carrera (historial de puestos)
    await Carrera.create({
      empleado: empleado._id,
      puesto: empleado.puesto,
      area: empleado.area,
      sector: empleado.sector,
      desde: empleado.fechaIngreso, // fecha de inicio = fecha de ingreso
      hasta: null, // vigente
      motivo: "Inicio de relación laboral",
    });

    res.status(201).json(empleado);
  } catch (err) {
    // manejo simple de únicos duplicados
    if (err?.code === 11000) {
      return res.status(409).json({ message: "DNI o CUIL ya registrado", key: err.keyValue });
    }
    next(err);
  }
};

export const updateEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params;
    let updates = req.body;

    // Restricción para empleados editando su propio perfil
    const u = req.user;
    const isRRHH = u.isSuper || u.isRRHH || u.permisos?.includes("nomina:editar");

    if (!isRRHH) {
      // Si no es RRHH, solo permitimos editar email, celular y apodo
      const allowed = ["email", "celular", "apodo"];
      const filtered = {};
      Object.keys(updates).forEach(k => {
        if (allowed.includes(k)) filtered[k] = updates[k];
      });
      updates = filtered;
    }

    // ---------------------------------------------------------
    // AUTO-CIERRE DE CARRERA SI SE DESVINCULA
    // ---------------------------------------------------------
    if (updates.estadoLaboral === "DESVINCULADO") {
      const puestoActual = await Carrera.findOne({ empleado: id, hasta: null });
      if (puestoActual) {
        puestoActual.hasta = new Date();
        await puestoActual.save();
      }
    }

    // ---------------------------------------------------------
    // LIMPIEZA DE OVERRIDES AL CAMBIAR DE SECTOR
    // Solo borra overrides de INCLUSIÓN (excluido=false) de plantillas
    // del sector anterior. Los overrides de exclusión se preservan siempre.
    // ---------------------------------------------------------
    if (updates.sector) {
      const empActual = await Empleado.findById(id).select('sector').lean();
      const oldSectorId = empActual?.sector ? String(empActual.sector) : null;
      const newSectorId = String(updates.sector);

      if (oldSectorId && oldSectorId !== newSectorId) {
        // Encontrar todas las plantillas del sector anterior
        const plantillasViejo = await Plantilla.find(
          { scopeType: 'sector', scopeId: empActual.sector },
          { _id: 1 }
        ).lean();

        if (plantillasViejo.length > 0) {
          const tplIds = plantillasViejo.map(p => p._id);
          // Borrar SOLO los overrides de inclusión (excluido=false) de esas plantillas
          // Los overrides con excluido=true (exclusiones deliberadas) se mantienen
          const resultado = await OverrideObjetivo.deleteMany({
            empleado: id,
            template: { $in: tplIds },
            excluido: false,  // ← solo inclusiones, nunca exclusiones
          });
          if (resultado.deletedCount > 0) {
            console.log(
              `[SectorChange] Empleado ${id}: sector ${oldSectorId} → ${newSectorId}. ` +
              `Overrides de inclusión eliminados: ${resultado.deletedCount}`
            );
          }
        }
      }
    }

    const empleado = await Empleado.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: 'area',
        populate: { path: 'referentes', select: 'nombre apellido email celular' }
      })
      .populate('sector', 'nombre');

    if (!empleado) {
      return res.status(404).json({ message: 'Empleado no encontrado' });
    }

    res.json(empleado);
  } catch (err) {
    next(err);
  }
};

export const deleteEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params;

    const empleado = await Empleado.findByIdAndDelete(id);
    if (!empleado) {
      return res.status(404).json({ message: 'Empleado no encontrado' });
    }

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

export const subirFotoEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No se envió ninguna foto.' });

    const abs = String(req.file.path).replaceAll('\\', '/');
    const i = abs.lastIndexOf('/uploads/');
    const relative = i >= 0 ? abs.substring(i) : `/uploads/${req.file.filename}`;

    // 👇 clave: SIN barra inicial
    const publicUrl = String(relative).replace(/^\/+/, ''); // "uploads/empleados/xxx/perfil.jpg"

    const empleado = await Empleado.findByIdAndUpdate(
      id,
      { fotoUrl: publicUrl },
      { new: true }
    ).populate('area', 'nombre').populate('sector', 'nombre');

    return res.json(empleado);
  } catch (err) {
    return next(err);
  }
};


// =========================
// 💰 Actualizar sueldo con histórico
// =========================
export const actualizarSueldoEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params; // empleadoId
    const { monto, moneda = "ARS", vigenteDesde = new Date(), comentario = "" } = req.body || {};

    if (monto == null || isNaN(Number(monto))) {
      return res.status(400).json({ message: "monto requerido (number)" });
    }

    const empleado = await Empleado.findById(id);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    // Validar fecha posterior a la actual (no retroactiva)
    const newDate = new Date(vigenteDesde);
    const currentDate = empleado.sueldoBase?.vigenteDesde ? new Date(empleado.sueldoBase.vigenteDesde) : null;

    if (currentDate && newDate <= currentDate && empleado.sueldoBase.monto > 0) {
      return res.status(400).json({
        message: `La fecha de vigencia debe ser posterior a la actual (${currentDate.toLocaleDateString()}).`
      });
    }

    // push histórico del sueldo anterior (si había)
    const prev = empleado.sueldoBase || {};
    if (prev?.monto > 0) {
      empleado.sueldoBase.historico = empleado.sueldoBase.historico || [];
      // cerrar registro anterior si no tiene 'hasta'
      const last = empleado.sueldoBase.historico[empleado.sueldoBase.historico.length - 1];
      if (last && !last.hasta) last.hasta = new Date();
      // volcar el vigente actual como registro anterior
      empleado.sueldoBase.historico.push({
        monto: prev.monto,
        moneda: prev.moneda || "ARS",
        desde: prev.vigenteDesde || new Date(),
        hasta: new Date(),
        comentario: prev.comentario, // Guardamos el comentario que tenía ese sueldo
      });
    }

    // set nuevo vigente
    empleado.sueldoBase.monto = Number(monto);
    empleado.sueldoBase.moneda = String(moneda);
    empleado.sueldoBase.vigenteDesde = new Date(vigenteDesde);
    empleado.sueldoBase.comentario = comentario; // Guardamos el nuevo comentario

    await empleado.save();
    await empleado.save();
    const populated = await Empleado.findById(id)
      .populate({
        path: "area",
        populate: { path: "referentes", select: "nombre apellido email celular" }
      })
      .populate("sector", "nombre")
      .lean();

    res.json({ success: true, empleado: populated });
  } catch (err) {
    next(err);
  }
};

export const eliminarSueldoHistorico = async (req, res, next) => {
  try {
    const { id, subId } = req.params; // empId, historyId
    const empleado = await Empleado.findById(id);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    // Pull from historico
    empleado.sueldoBase.historico.pull(subId);
    await empleado.save();

    const populated = await Empleado.findById(id)
      .select("nombre apellido sueldoBase area sector")
      .populate("area", "nombre")
      .populate("sector", "nombre")
      .lean();

    res.json({ success: true, empleado: populated });
  } catch (err) {
    next(err);
  }
};

export const subirCVEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No se envió ningún archivo de CV.' });

    // normalizo la ruta a /uploads/...
    const abs = String(req.file.path).replaceAll('\\', '/');
    const i = abs.lastIndexOf('/uploads/');
    const relative = i >= 0 ? abs.substring(i) : `/uploads/${req.file.filename}`;
    const publicUrl = String(relative).replace(/^\/+/, ''); // sin barra inicial

    const empleado = await Empleado.findByIdAndUpdate(
      id,
      { cvUrl: publicUrl },
      { new: true }
    ).populate('area', 'nombre').populate('sector', 'nombre');

    return res.json(empleado);
  } catch (err) {
    return next(err);
  }
};

export {
  getEmpleados as obtenerEmpleados,
  createEmpleado as crearEmpleado,
  updateEmpleado as actualizarEmpleado,
  deleteEmpleado as eliminarEmpleado,
};
