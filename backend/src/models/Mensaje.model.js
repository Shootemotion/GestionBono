import mongoose from "mongoose";

const mensajeSchema = new mongoose.Schema(
  {
    // Emisor y receptor (ambos son Usuarios que loguean)
    de:   { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
    para: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },

    texto: { type: String, required: true, trim: true, maxlength: 4000 },

    // null = no leído por el receptor
    leidoEn: { type: Date, default: null },
  },
  { timestamps: true }
);

// Traer un hilo entre dos personas y ordenar cronológicamente
mensajeSchema.index({ de: 1, para: 1, createdAt: -1 });
// Contar / marcar no leídos del receptor de forma barata
mensajeSchema.index({ para: 1, leidoEn: 1 });

const Mensaje = mongoose.model("Mensaje", mensajeSchema);
export default Mensaje;
