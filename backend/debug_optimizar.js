import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Evaluacion from './src/models/Evaluacion.model.js';
import Empleado from './src/models/Empleado.model.js';

dotenv.config();

console.log("Starting Optimizar Search...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        const optimizarTpl = await Plantilla.findOne({
            nombre: /Optimizar.*tiempo/i,
            year: 2025
        });

        if (optimizarTpl) {
            console.log(`\nFound Sibling Template: "${optimizarTpl.nombre}" (${optimizarTpl._id})`);
            console.log(`Scope: ${optimizarTpl.scopeType} -> ${optimizarTpl.scopeId}`);

            const emp = await Empleado.findOne({ nombre: /Karina/i });
            const evals = await Evaluacion.countDocuments({
                empleado: emp._id,
                plantillaId: optimizarTpl._id
            });
            console.log(`Karina Evaluations for this Sibling: ${evals}`);

            const ov = await OverrideObjetivo.findOne({
                empleado: emp._id,
                template: optimizarTpl._id
            });
            console.log(`Karina Override for this Sibling: ${ov ? 'YES (Wt: ' + ov.peso + ')' : 'NO'}`);

        } else {
            console.log("No template found matching /Optimizar.*tiempo/");
        }

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
