import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Empleado from './src/models/Empleado.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import Plantilla from './src/models/Plantilla.model.js';

dotenv.config();

console.log("Starting Debug Script for Toro Berta...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        // 1. Find Employee
        const emp = await Empleado.findOne({ nombre: /Berta/i, apellido: /Toro/i });
        if (!emp) { console.error("Toro Berta not found"); process.exit(1); }
        console.log(`Employee: ${emp.nombre} ${emp.apellido} (${emp._id})`);

        // 2. Find Evaluation for "Cumplimiento de protocolos de limpieza"
        // I don't know the ID, but I can search by template name in the evaluation populate?
        // Or searching Plantilla first.
        const tpls = await Plantilla.find({
            nombre: /protocolos de limpieza/i,
            year: 2025
        });

        if (tpls.length === 0) { console.error("Template not found"); process.exit(1); }

        console.log(`\nFound ${tpls.length} templates. Checking logic for each...`);

        for (const tpl of tpls) {
            console.log(`\nTEMPLATE: "${tpl.nombre}" (${tpl._id})`);
            console.log(`- Scope: ${tpl.scopeType} -> ${tpl.scopeId}`);
            // Inspect Metas
            tpl.metas?.forEach((m, i) => {
                console.log(`  Meta [${i}]:`);
                console.log(`    - ID: ${m._id} (metaId: ${m.metaId})`);
                console.log(`    - Esperado: ${m.esperado}`);
                console.log(`    - Operador: ${m.operador}`);
                console.log(`    - ReglaCierre: ${m.reglaCierre}`);
                console.log(`    - UmbralPeriodos: ${m.umbralPeriodos}`);
                console.log(`    - ReconoceEsfuerzo: ${m.reconoceEsfuerzo}`);
                console.log(`    - Tolerancia: ${m.tolerancia}`);
            });

            // Find Evaluation
            const ev = await Evaluacion.findOne({ empleado: emp._id, plantillaId: tpl._id });
            if (ev) {
                console.log(`  EVALUATION FOUND: ${ev._id}`);
                console.log(`    - Period: ${ev.periodo}`);
                console.log(`    - Actual: ${ev.actual}`);

                // Check Metas Resultados
                ev.metasResultados?.forEach(mr => {
                    console.log(`    - MetaRes [${mr.metaId}]: Result=${mr.resultado} (Type: ${typeof mr.resultado})`);
                });

                // Does this evaluation have Hitos embedded if it's the parent?
                // Usually Evaluations are per period.
                // Check all evaluations for this template/employee
                const allEvals = await Evaluacion.find({ empleado: emp._id, plantillaId: tpl._id });
                console.log(`    - Total Period Evaluations: ${allEvals.length}`);
                allEvals.forEach(e => {
                    console.log(`      * Period: ${e.periodo} | Actual: ${e.actual} | MetaRes: ${JSON.stringify(e.metasResultados)}`);
                });

            } else {
                console.log("  NO EVALUATION for this template/employee.");
            }
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
