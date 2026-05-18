import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Empleado from './src/models/Empleado.model.js';
import Sector from './src/models/Sector.model.js';

dotenv.config();

console.log("Starting Analysis Script...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        const ghostTemplates = [
            '697217e8fb55f69820fa2cdd', // Disminuir (Analitica)
            '6972186ffb55f69820fa2cf6', // Mejorar  (Analitica)
            '6973e9a4fb55f69820fa51fc', // Stock    (Analitica)
            '6978a4c9fb55f69820fa8bfb', // Stock    (Post-Analitica)
        ];

        for (const ghostId of ghostTemplates) {
            const tGhost = await Plantilla.findById(ghostId);
            if (!tGhost) continue;

            console.log(`\nAnalyzing Ghost Template: "${tGhost.nombre}" (${ghostId})`);

            // Find overrides for this ghost
            const overrides = await OverrideObjetivo.find({ template: ghostId }).populate('empleado');

            for (const ov of overrides) {
                const emp = ov.empleado;
                if (!emp) continue;

                // Find the "Correct" template for this employee's sector with the SAME NAME
                const empSectorId = emp.sector; // Assumed populated or just ID

                // Look for a template with same name in employee's sector
                const sibling = await Plantilla.findOne({
                    year: tGhost.year,
                    nombre: tGhost.nombre, // Exact name match? Might be slight diff
                    scopeType: 'sector',
                    scopeId: empSectorId
                });

                console.log(`  - Override for: ${emp.nombre} ${emp.apellido} (Sector: ${empSectorId})`);

                if (sibling) {
                    console.log(`    ✅ Found Sibling in their sector: ${sibling._id} ("${sibling.nombre}")`);

                    // Does emp already have an override for the sibling?
                    const siblingOv = await OverrideObjetivo.findOne({
                        empleado: emp._id,
                        template: sibling._id
                    });

                    if (siblingOv) {
                        console.log(`    ❌ Employee ALREADY has override for sibling! (Weight: ${siblingOv.peso})`);
                        console.log(`       RECOMMENDATION: DELETE Ghost Override (Duplicate).`);
                    } else {
                        console.log(`    ✨ No override for sibling.`);
                        console.log(`       RECOMMENDATION: SWAP Ghost Override -> Sibling ID.`);
                    }
                } else {
                    console.log(`    ⚠️  No sibling found in their sector. Maybe name mismatch?`);
                    // Try fuzzy search?
                }
            }
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
