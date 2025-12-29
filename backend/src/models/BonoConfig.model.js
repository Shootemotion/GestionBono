import mongoose from "mongoose";

const BonoConfigSchema = new mongoose.Schema(
    {
        anio: {
            type: Number,
            required: true,
            unique: true,
        },
        // Pesos globales eliminados: Se usa el Score Final del Dashboard
        // pesos: { ... },
        // Escala de bono (lineal, tramos, etc.)
        escala: {
            tipo: { type: String, enum: ["lineal", "tramos"], default: "lineal" },
            // Params para lineal
            minPct: { type: Number, default: 0 },
            maxPct: { type: Number, default: 0.3 }, // 30% del sueldo
            umbral: { type: Number, default: 60 },  // score mínimo para cobrar
            // Params para tramos (array de { gte: 90, pct: 0.2 })
            tramos: [
                {
                    gte: { type: Number },
                    pct: { type: Number },
                },
            ],
        },
        // Bono Target: Multiplicador del sueldo (ej: 1.0 = 1 sueldo, 1.5 = 1.5 sueldos)
        // Esto se usa como base antes de aplicar el % de desempeño.
        // Si el desempeño es 100%, cobra bonoTarget * Sueldo.
        bonoTarget: { type: Number, default: 0 },

        fechas: {
            calculo: { type: Date },
            pago: { type: Date },
        },

        // Overrides para Areas o Empleados específicos
        overrides: [
            {
                type: { type: String, enum: ["area", "empleado"], required: true },
                targetId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID de Area o Empleado
                targetName: String, // Helper para mostrar nombre en UI sin poblar todo
                // Config específica que pisa la global
                escala: {
                    tipo: { type: String, enum: ["lineal", "tramos"] },
                    minPct: Number,
                    maxPct: Number,
                    umbral: Number,
                    tramos: [{ gte: Number, pct: Number }]
                },
                bonoTarget: Number,
            }
        ],

        // Auditoría
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    },
    { timestamps: true }
);

export default mongoose.model("BonoConfig", BonoConfigSchema);
