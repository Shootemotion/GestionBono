import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Sector from './src/models/Sector.model.js';

dotenv.config();

console.log("Starting Duplicate Detection Script...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        // 1. Find all active templates for 2025
        const templates = await Plantilla.find({ year: 2025, activo: true });

        // 2. Group by normalized name
        const grouped = {};
        for (const t of templates) {
            const key = t.nombre.trim().replace(/\s+/g, ' ').toLowerCase(); // Normalize spaces
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(t);
        }

        console.log(`\nAnalyzing ${templates.length} templates for duplicates...`);

        let duplicatesFound = 0;

        for (const [name, group] of Object.entries(grouped)) {
            if (group.length > 1) {
                duplicatesFound++;
                console.log(`\n⚠️  Possible Duplicate Group: "${name}" (${group.length} variations)`);

                for (const t of group) {
                    // Count Evaluations
                    const evalCount = await Evaluacion.countDocuments({ plantillaId: t._id });
                    // Count Overrides
                    const overrideCount = await OverrideObjetivo.countDocuments({ template: t._id });

                    // Get Scope Name
                    let scopeName = "Global";
                    if (t.scopeType === 'sector') {
                        const s = await Sector.findById(t.scopeId);
                        scopeName = s ? `Sector: ${s.nombre}` : 'Sector (Unknown)';
                    } else if (t.scopeType === 'area') {
                        // area fetch if needed
                        scopeName = `Area: ${t.scopeId}`;
                    }

                    const isGhost = evalCount === 0 && overrideCount > 0;

                    console.log(`   🔸 [${t._id}] Name: "${t.nombre}"`);
                    console.log(`      Scope: ${scopeName}`);
                    console.log(`      Evals: ${evalCount} | Overrides: ${overrideCount}`);
                    if (isGhost) console.log(`      🚨 GHOST CANDIDATE (Assigned but unused)`);
                }
            }
        }

        if (duplicatesFound === 0) {
            console.log("\n✅ No duplicates found.");
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
