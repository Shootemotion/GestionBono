
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import { generarHitos } from './src/utils/generarHitos.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gestion-bono";

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Connected to DB");

        const names = [
            "Implementar modulo de reglas de Kern",
            "Cumplimiento de protocolos de limpieza"
        ];

        const templates = await Plantilla.find({
            nombre: { $regex: /Kern|limpieza/i }
        }).lean();

        console.log(`Found ${templates.length} templates matching names`);

        templates.forEach(t => {
            console.log("==================================================");
            console.log(`Nombre: ${t.nombre}`);
            console.log(`_id: ${t._id}`);
            console.log(`Year (DB): ${t.year}`);
            console.log(`Frecuencia (DB): ${t.frecuencia}`);
            console.log(`FechaInicioFiscal: ${t.fechaInicioFiscal}`);

            const hitos = generarHitos(t);
            console.log(`Generated Hitos Count: ${hitos.length}`);
            if (hitos.length > 0) {
                console.log("First:", hitos[0]);
                console.log("Last:", hitos[hitos.length - 1]);
            }
        });

        process.exit(0);
    })
    .catch(err => console.error(err));
