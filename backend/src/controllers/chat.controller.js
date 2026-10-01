import mongoose from "mongoose";
import Mensaje from "../models/Mensaje.model.js";
import Usuario from "../models/Usuario.model.js";

// Devuelve el id de Usuario del solicitante, o null si es anónimo
function currentUserId(req) {
  const id = req.user?._id;
  if (!id || id === "anon" || !mongoose.isValidObjectId(id)) return null;
  return String(id);
}

// Normaliza un Usuario (con empleado poblado) a la forma que consume el chat
function toContacto(u) {
  const emp = u.empleado || null;
  return {
    _id: String(u._id),
    nombre: emp?.nombre || u.nombre || null,
    apellido: emp?.apellido || null,
    apodo: emp?.apodo || null,
    puesto: emp?.puesto || null,
    fotoUrl: emp?.fotoUrl || null,
    email: u.email || null,
  };
}

// GET /api/chat/contactos
// Todos los usuarios activos (menos yo). "Todos con todos", sin filtro de área.
export async function getContactos(req, res, next) {
  try {
    const me = currentUserId(req);
    if (!me) return res.status(401).json({ message: "No autenticado" });

    const usuarios = await Usuario.find({ activo: true, _id: { $ne: me } })
      .populate("empleado", "nombre apellido apodo puesto fotoUrl")
      .select("nombre email empleado")
      .lean();

    const contactos = usuarios
      .map(toContacto)
      .sort((a, b) =>
        `${a.apellido || ""} ${a.nombre || ""}`.localeCompare(`${b.apellido || ""} ${b.nombre || ""}`, "es")
      );

    res.json(contactos);
  } catch (e) { next(e); }
}

// GET /api/chat/conversaciones
// Bandeja de entrada: por cada persona con la que hablé, último mensaje + no leídos.
export async function getConversaciones(req, res, next) {
  try {
    const me = currentUserId(req);
    if (!me) return res.status(401).json({ message: "No autenticado" });
    const meId = new mongoose.Types.ObjectId(me);

    const convos = await Mensaje.aggregate([
      { $match: { $or: [{ de: meId }, { para: meId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$de", meId] }, "$para", "$de"] },
          ultimoMensaje: { $first: "$texto" },
          ultimaFecha: { $first: "$createdAt" },
          ultimoDe: { $first: "$de" },
          noLeidos: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$para", meId] }, { $eq: ["$leidoEn", null] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { ultimaFecha: -1 } },
    ]);

    if (convos.length === 0) return res.json([]);

    // Traer datos de los "otros" participantes en una sola query
    const otrosIds = convos.map((c) => c._id);
    const usuarios = await Usuario.find({ _id: { $in: otrosIds } })
      .populate("empleado", "nombre apellido apodo puesto fotoUrl")
      .select("nombre email empleado")
      .lean();
    const mapa = new Map(usuarios.map((u) => [String(u._id), toContacto(u)]));

    const salida = convos.map((c) => ({
      contacto: mapa.get(String(c._id)) || { _id: String(c._id), nombre: "Usuario" },
      ultimoMensaje: c.ultimoMensaje,
      ultimaFecha: c.ultimaFecha,
      ultimoEsMio: String(c.ultimoDe) === me,
      noLeidos: c.noLeidos,
    }));

    res.json(salida);
  } catch (e) { next(e); }
}

// GET /api/chat/mensajes/:otroId?desde=<ISO>
// Hilo con otra persona. Marca como leídos los mensajes entrantes.
export async function getMensajes(req, res, next) {
  try {
    const me = currentUserId(req);
    if (!me) return res.status(401).json({ message: "No autenticado" });

    const { otroId } = req.params;
    if (!mongoose.isValidObjectId(otroId)) {
      return res.status(400).json({ message: "ID de contacto inválido" });
    }

    const filter = {
      $or: [
        { de: me, para: otroId },
        { de: otroId, para: me },
      ],
    };
    if (req.query.desde) {
      const d = new Date(req.query.desde);
      if (!isNaN(d.getTime())) filter.createdAt = { $gt: d };
    }

    const mensajes = await Mensaje.find(filter).sort({ createdAt: 1 }).lean();

    // Marcar como leídos los que me mandó el otro y aún no leí
    await Mensaje.updateMany(
      { de: otroId, para: me, leidoEn: null },
      { $set: { leidoEn: new Date() } }
    );

    res.json(mensajes);
  } catch (e) { next(e); }
}

// POST /api/chat/mensajes   body: { para, texto }
export async function enviarMensaje(req, res, next) {
  try {
    const me = currentUserId(req);
    if (!me) return res.status(401).json({ message: "No autenticado" });

    const { para, texto } = req.body || {};
    if (!mongoose.isValidObjectId(para)) {
      return res.status(400).json({ message: "Destinatario inválido" });
    }
    const limpio = String(texto || "").trim();
    if (!limpio) return res.status(400).json({ message: "El mensaje no puede estar vacío" });
    if (limpio.length > 4000) return res.status(400).json({ message: "Mensaje demasiado largo" });
    if (String(para) === me) return res.status(400).json({ message: "No podés escribirte a vos mismo" });

    // El destinatario debe existir y estar activo
    const destino = await Usuario.exists({ _id: para, activo: true });
    if (!destino) return res.status(404).json({ message: "Destinatario no encontrado" });

    const msg = await Mensaje.create({ de: me, para, texto: limpio });
    res.status(201).json(msg.toObject());
  } catch (e) { next(e); }
}

// GET /api/chat/no-leidos  -> { total }  (para el badge del widget)
export async function getNoLeidos(req, res, next) {
  try {
    const me = currentUserId(req);
    if (!me) return res.status(401).json({ message: "No autenticado" });

    const total = await Mensaje.countDocuments({ para: me, leidoEn: null });
    res.json({ total });
  } catch (e) { next(e); }
}
