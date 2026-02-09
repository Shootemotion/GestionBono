import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Empleado from './src/models/Empleado.model.js';

dotenv.config();

console.log("Starting Weight Check Script...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        const emp = await Empleado.findOne({ nombre: /Karina/i });
        if (!emp) { process.exit(1); }

        const correctTemplateId = '69710fbefb55f69820fa29a9'; // Single space (Pre-Analitica)
        const badTemplateId = '697217e8fb55f69820fa2cdd';      // Double space (Analitica)

        // 1. Check Correct Template Base Weight
        const correctTpl = await Plantilla.findById(correctTemplateId);
        console.log(`\nCorrect Template Base Weight: ${correctTpl.pesoBase}`);

        // 2. Check if she already has an override for the Correct Template
        const correctOv = await OverrideObjetivo.findOne({
            empleado: emp._id,
            template: correctTemplateId
        });
        console.log(`Current Override for Correct Template:`, correctOv ? `YES (Weight: ${correctOv.peso})` : "NO");

        // 3. Check the Bad Override
        const badOv = await OverrideObjetivo.findOne({
            empleado: emp._id,
            template: badTemplateId
        });
        console.log(`Current Override for Bad Template:`, badOv ? `YES (Weight: ${badOv.peso})` : "NO");

        // 4. Calculate total without the bad one
        // ... skipping complex accumulation, just purely looking at this swap logic

        // Logic:
        // If BadOv.peso is 40, and CorrectOv is Null, and CorrectTpl.pesoBase is, say, 20...
        // Then removing BadOv leaves her short. We must create CorrectOv with weight 40.

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
