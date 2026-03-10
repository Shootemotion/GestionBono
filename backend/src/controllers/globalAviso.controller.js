import GlobalAviso from "../models/GlobalAviso.model.js";
import Empleado from "../models/Empleado.model.js";

// --- CRUD FOR ADMIN/RRHH ---

export const createAviso = async (req, res, next) => {
    try {
        const { titulo, mensaje, alcance, targetId, targetName, fechaInicio, fechaFin, tipo } = req.body;

        const aviso = new GlobalAviso({
            titulo,
            mensaje,
            alcance,
            tipo: tipo || "RRHH",
            targetId: targetId || null,
            targetModel: alcance === "AREA" ? "Area" : alcance === "SECTOR" ? "Sector" : undefined,
            targetName,
            fechaInicio: new Date(fechaInicio),
            fechaFin: new Date(fechaFin),
            creadoPor: req.user._id
        });

        await aviso.save();
        res.status(201).json(aviso);
    } catch (error) {
        next(error);
    }
};

export const getAvisosHistory = async (req, res, next) => {
    try {
        const avisos = await GlobalAviso.find().sort({ createdAt: -1 }).limit(100);
        res.json(avisos);
    } catch (error) {
        next(error);
    }
};

export const deleteAviso = async (req, res, next) => {
    try {
        const { id } = req.params;
        await GlobalAviso.findByIdAndDelete(id);
        res.json({ message: "Aviso eliminado" });
    } catch (error) {
        next(error);
    }
};

export const toggleAvisoStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const aviso = await GlobalAviso.findById(id);
        if (!aviso) return res.status(404).json({ message: "No encontrado" });

        aviso.activo = !aviso.activo;
        await aviso.save();
        res.json(aviso);
    } catch (error) {
        next(error);
    }
};

// --- CONSUMER ENDPOINT ---

export const getMyAvisos = async (req, res, next) => {
    try {
        // req.user already has areaId and sectorId populated by authenticateJWT
        // We can use these directly to filter messages.

        const now = new Date();
        const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

        const query = {
            activo: true,
            fechaInicio: { $lte: now },
            fechaFin: { $gt: now }, // Strict: Expire at 00:00 of the Date sent.
            // If user sets "Until 15th", it is stored as 15th 00:00.
            // On 15th 00:01, it will be hidden. This matches "cuando llega la fecha se va".

            $or: [
                { alcance: "GLOBAL" }
            ]
        };

        // If user has Area
        if (req.user.areaId) {
            query.$or.push({ alcance: "AREA", targetId: req.user.areaId });
        }

        // If user has Sector
        if (req.user.sectorId) {
            query.$or.push({ alcance: "SECTOR", targetId: req.user.sectorId });
        }

        const avisos = await GlobalAviso.find(query).sort({ createdAt: -1 });
        res.json(avisos);
    } catch (error) {
        next(error);
    }
};
