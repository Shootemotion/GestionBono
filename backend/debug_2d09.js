import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import Empleado from './src/models/Empleado.model.js';

dotenv.config();

console.log("Starting Debug Script for 2d09...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        const targetId = '697218d0fb55f69820fa2d09';
        const targetTpl = await Plantilla.findById(targetId);

        if (!targetTpl) {
            console.error("Template 2d09 not found!");
            process.exit(1);
        }

        console.log(`\nTarget Template: "${targetTpl.nombre}" (${targetId})`);
        console.log(`Scope: ${targetTpl.scopeType} -> ${targetTpl.scopeId}`);
        console.log(`Active: ${targetTpl.activo}`);

        // Check for Duplicates/Siblings
        const siblings = await Plantilla.find({
            nombre: targetTpl.nombre,
            year: targetTpl.year
        });

        console.log(`\nFound ${siblings.length} templates with this name:`);
        siblings.forEach(s => {
            console.log(`- [${s._id}] Scope: ${s.scopeType} -> ${s.scopeId}`);
        });

        // Check Usage
        const evalCount = await Evaluacion.countDocuments({ plantillaId: targetId });
        const overrideCount = await OverrideObjetivo.countDocuments({ template: targetId });
        console.log(`\nStats for 2d09: Evals=${evalCount}, Overrides=${overrideCount}`);

        // Check specifically for Karina
        const karina = await Empleado.findOne({ nombre: /Karina/i });
        if (karina) {
            const karinaOv = await OverrideObjetivo.findOne({ empleado: karina._id, template: targetId });
            console.log(`\nKarina Override for 2d09: ${karinaOv ? 'YES (Wt: ' + karinaOv.peso + ')' : 'NO'}`);

            // Does Karina have evaluations for ANY of the siblings?
            for (const s of siblings) {
                const kEvals = await Evaluacion.countDocuments({
                    empleado: karina._id,
                    plantillaId: s._id
                });
                console.log(`- Evaluated on sibling [${s._id}]? ${kEvals} evals.`);
            }
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
