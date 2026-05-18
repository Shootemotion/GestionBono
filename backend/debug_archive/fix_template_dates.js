
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gestion-bono";

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Connected to DB");

        // Find all templates for 2025
        const templates = await Plantilla.find({ year: 2025 });
        console.log(`Found ${templates.length} templates for 2025 to fix.`);

        let updatedCount = 0;

        for (const t of templates) {
            // Enforce FISCAL Year 2025-2026
            // Start: Sep 1, 2025
            // End: Aug 31, 2026
            const newStart = new Date(2025, 8, 1); // Month 8 is September
            const newEnd = new Date(2026, 7, 31, 23, 59, 59, 999); // Month 7 is August

            t.fechaInicioFiscal = newStart;
            t.fechaCierre = newEnd;

            await t.save();
            console.log(`Fixed: ${t.nombre} -> Fiscal Start: ${t.fechaInicioFiscal.toISOString().slice(0, 10)}`);
            updatedCount++;
        }

        console.log(`Migration Complete. Fixed ${updatedCount} templates.`);
        process.exit(0);
    })
    .catch(err => console.error(err));
