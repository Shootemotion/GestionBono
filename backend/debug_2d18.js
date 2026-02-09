import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import Empleado from './src/models/Empleado.model.js';

dotenv.config();

console.log("Starting Debug Script for 2d18...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        // Target Template: 2d18
        // I need to find the specific ID ending in 2d18.
        // Since I don't have the full ID, I'll search by regex on _id if possible, or search by name if I knew it.
        // Wait, the user usually gives me the last 4 chars.
        // I can't query _id with regex easily in standard findById.
        // I'll search all templates and filter in JS or use a library if needed, but easier to search by name if I knew it.
        // Let's assume the user saw "2d18" in the tooltip.

        // I will fetch all 2025 templates and find the one ending in 2d18.
        const allTemplates = await Plantilla.find({ year: 2025 }).select('_id nombre scopeType scopeId');
        const targetTpl = allTemplates.find(t => t._id.toString().endsWith('2d18'));

        if (!targetTpl) {
            console.error("Template ...2d18 not found!");
            process.exit(1);
        }

        console.log(`\nTarget Template: "${targetTpl.nombre}" (${targetTpl._id})`);
        console.log(`Scope: ${targetTpl.scopeType} -> ${targetTpl.scopeId}`);

        // Check usage
        const evalCount = await Evaluacion.countDocuments({ plantillaId: targetTpl._id });
        const overrideCount = await OverrideObjetivo.countDocuments({ template: targetTpl._id });
        console.log(`Global Usage: Evals=${evalCount}, Overrides=${overrideCount}`);

        // Check specifically for Leonela
        const leonela = await Empleado.findOne({ nombre: /Leonela/i });
        if (!leonela) {
            console.log("Leonela not found.");
        } else {
            console.log(`\nEmployee: ${leonela.nombre} ${leonela.apellido} (Sector: ${leonela.sector})`);

            const ov = await OverrideObjetivo.findOne({
                empleado: leonela._id,
                template: targetTpl._id
            });
            console.log(`Override for 2d18: ${ov ? 'YES (Wt: ' + ov.peso + ')' : 'NO'}`);

            // Check for siblings in her sector
            const siblings = await Plantilla.find({
                year: 2025,
                nombre: targetTpl.nombre,
                scopeType: 'sector',
                scopeId: leonela.sector
            });

            console.log(`\nSiblings in her sector (${siblings.length}):`);
            for (const s of siblings) {
                const isTarget = s._id.equals(targetTpl._id) ? " [TARGET]" : "";
                const sEvals = await Evaluacion.countDocuments({ empleado: leonela._id, plantillaId: s._id });
                console.log(`- ${s._id}${isTarget} | Evals: ${sEvals}`);
            }
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
