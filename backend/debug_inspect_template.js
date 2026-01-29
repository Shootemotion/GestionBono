
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import { generarHitos } from './src/utils/generarHitos.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gestion-bono";

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Connected to DB");

        // Find templates for 2025
        const templates = await Plantilla.find({ year: 2025 }).lean();
        console.log(`Found ${templates.length} templates for 2025`);

        templates.forEach(t => {
            console.log("--------------------------------------------------");
            console.log(`Template: ${t.nombre} (_id: ${t._id})`);
            console.log(`Year: ${t.year}`);
            console.log(`Frecuencia: ${t.frecuencia}`);
            console.log(`FechaInicioFiscal: ${t.fechaInicioFiscal}`);
            console.log(`FechaCierre: ${t.fechaCierre}`);

            const hitos = generarHitos(t);
            console.log("Generated Hitos (First 3 and Last 3):");
            if (hitos.length > 6) {
                console.log(hitos.slice(0, 3));
                console.log("...");
                console.log(hitos.slice(-3));
            } else {
                console.log(hitos);
            }
        });

        process.exit(0);
    })
    .catch(err => console.error(err));
