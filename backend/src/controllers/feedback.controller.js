import Feedback from "../models/Feedback.model.js";

export const getFeedbacksByEmpleado = async (req, res) => {
    try {
        const { empleadoId } = req.params;
        const { year } = req.query;

        const query = { empleado: empleadoId };
        if (year) query.year = Number(year);

        const feedbacks = await Feedback.find(query)
            .populate({
                path: "creadoPor",
                select: "nombre email empleado",
                populate: {
                    path: "empleado",
                    select: "nombre apellido fotoUrl"
                }
            })
            .sort({ periodo: 1 });
        res.json(feedbacks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener feedbacks" });
    }
};

export const saveFeedback = async (req, res) => {
    try {
        const {
            empleado, year, periodo,
            comentario, estado, fechaRealizacion,
            comentarioEmpleado, empleadoAck,
            scores // Scores calculated by frontend
        } = req.body;

        if (!empleado || !year || !periodo) {
            return res.status(400).json({ message: "Faltan datos obligatorios" });
        }

        // Check existing
        let existing = await Feedback.findOne({ empleado, year, periodo });
        let correctionCount = existing?.correctionCount || 0;

        const isEmployee = req.user?.empleadoId && String(req.user.empleadoId) === String(empleado);

        const data = {
            empleado,
            year,
            periodo,
            comentario,
            estado,
            fechaRealizacion: fechaRealizacion || new Date(),
            comentarioEmpleado,
            empleadoAck,
            scores,
        };

        // Determine if this is a "Manager Action" (creating/updating feedback content)

        // This allows capturing the creator even if the user is evaluating themselves (isEmployee === true)
        // This allows capturing the creator even if the user is evaluating themselves (isEmployee === true)
        // We set creadoPor if it's not set yet, or if it's a manager acting on someone else.
        if (!isEmployee || (!existing?.creadoPor && (estado === "SENT" || estado === "DRAFT"))) {
            if (!existing?.creadoPor || !isEmployee) {
                data.creadoPor = req.user?._id;
            }

            // Logic for correction limit (Manager sending feedback)
            if (!isEmployee && existing && ["SENT", "ACKNOWLEDGED", "CLOSED"].includes(existing.estado)) {
                // If trying to update an already sent feedback
                if (correctionCount >= 1) {
                    return res.status(400).json({ message: "Solo se permite una corrección después de enviar el feedback." });
                }
                correctionCount += 1;
            }
            data.correctionCount = correctionCount;
        }

        // Si cambia a SENT, setear fecha envio si no existe
        if (estado === "SENT" && (!existing || !existing.submittedToEmployeeAt)) {
            data.submittedToEmployeeAt = new Date();
        }
        // Si cambia a CLOSED, setear fecha cierre
        if (estado === "CLOSED") {
            data.closedAt = new Date();
        }



        const updated = await Feedback.findOneAndUpdate(
            { empleado, year, periodo },
            { $set: data },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al guardar feedback" });
    }
};

export const getPendingFeedbacks = async (req, res) => {
    try {
        const { periodo, year } = req.query;
        const query = { estado: { $in: ["PENDING_HR", "CLOSED"] } };

        if (periodo) query.periodo = periodo;
        if (year) query.year = Number(year);

        const feedbacks = await Feedback.find(query)
            .populate("empleado", "nombre apellido area sector")
            .populate({
                path: "creadoPor",
                select: "nombre email empleado",
                populate: { path: "empleado", select: "nombre apellido" }
            })
            .sort({ "empleado.apellido": 1 });

        res.json(feedbacks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener feedbacks pendientes" });
    }
};

export const closeFeedbacksBulk = async (req, res) => {
    try {
        const { ids, comentarioRRHH } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "Se requieren IDs para cerrar" });
        }

        const updateData = {
            estado: "CLOSED",
            closedAt: new Date()
        };

        if (comentarioRRHH) {
            updateData.comentarioRRHH = comentarioRRHH;
        }

        const result = await Feedback.updateMany(
            { _id: { $in: ids } },
            { $set: updateData }
        );

        res.json({ message: "Feedbacks cerrados correctamente", modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al cerrar feedbacks" });
    }
};
