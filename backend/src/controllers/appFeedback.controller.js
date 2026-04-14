import AppFeedback from "../models/AppFeedback.model.js";
import Empleado from "../models/Empleado.model.js";
import { sendFeedbackReplyEmail } from "../utils/mailer.js";

// GET /api/app-feedback
// Solo para roles con permisos (RRHH, Directivo, etc)
export const getFeedbacks = async (req, res, next) => {
    try {
        const feedbacks = await AppFeedback.find()
            .populate("empleado", "nombre apellido email fotoUrl")
            .sort({ createdAt: -1 })
            .lean();

        res.json(feedbacks);
    } catch (err) {
        next(err);
    }
};

// POST /api/app-feedback
export const createFeedback = async (req, res, next) => {
    try {
        const { tipo, mensaje } = req.body;
        const empleadoId = req.user?.empleadoId;

        if (!empleadoId) {
            return res.status(403).json({ message: "No se encontró el perfil de empleado del usuario." });
        }

        if (!tipo || !mensaje) {
            return res.status(400).json({ message: "Tipo y mensaje son requeridos." });
        }

        const newFeedback = await AppFeedback.create({
            empleado: empleadoId,
            tipo,
            mensaje,
            estado: "Pendiente",
        });

        res.status(201).json(newFeedback);
    } catch (err) {
        next(err);
    }
};

// PATCH /api/app-feedback/:id/status
export const updateFeedbackStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const feedback = await AppFeedback.findByIdAndUpdate(
            id,
            { estado },
            { new: true }
        ).populate("empleado", "nombre apellido email fotoUrl");

        if (!feedback) {
            return res.status(404).json({ message: "Feedback no encontrado." });
        }

        res.json(feedback);
    } catch (err) {
        next(err);
    }
};

// PATCH /api/app-feedback/:id/reply
export const replyFeedback = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { respuesta, estadoNuevo } = req.body;

        if (!respuesta) {
            return res.status(400).json({ message: "La respuesta es requerida." });
        }

        const feedback = await AppFeedback.findById(id).populate("empleado");

        if (!feedback) {
            return res.status(404).json({ message: "Feedback no encontrado." });
        }

        // Update the feedback record
        feedback.respuesta = respuesta;
        feedback.estado = estadoNuevo || "Contestado";
        await feedback.save();

        // Send email to the user
        const userEmail = feedback.empleado?.email;
        const userName = feedback.empleado?.nombre;

        if (userEmail) {
            await sendFeedbackReplyEmail(
                userEmail,
                userName,
                feedback.mensaje,
                respuesta,
                feedback.estado
            );
        } // If no email, it just updates the DB.

        res.json(feedback);
    } catch (err) {
        next(err);
    }
};
