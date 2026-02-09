import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';

dotenv.config();

console.log("Starting Cleanup Script...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        // 1. Fix for Karina Esnoz (and any others with the 2cdd ghost)
        // BAD Template: 697217e8fb55f69820fa2cdd (Disminuir errores... Analitica double space)
        const badTemplateId = "697217e8fb55f69820fa2cdd";

        const result = await OverrideObjetivo.deleteMany({ template: badTemplateId });
        console.log(`\nDeleted ${result.deletedCount} overrides for the ghost template '2cdd' (Disminuir errores...).`);
        console.log("This should fix Karina Esnoz and the other 14 employees reported previously.");

        // 2. Fix for the other Ghost Templates identified in 'detect_duplicates.js' as having 0 evals

        // Ghost: Implementar modulo de reglas de Kern (2 variations)
        // 6973e872fb55f69820fa4e40
        // 6973e87dfb55f69820fa4ea0
        const resKern = await OverrideObjetivo.deleteMany({
            template: { $in: ["6973e872fb55f69820fa4e40", "6973e87dfb55f69820fa4ea0"] }
        });
        console.log(`Deleted ${resKern.deletedCount} overrides for 'Kern Rules' ghost templates.`);

        // Ghost: Control de stock (Analitica & Post-Analitica versions unused)
        // 6973e9a4fb55f69820fa51fc
        // 6978a4c9fb55f69820fa8bfb
        const resStock = await OverrideObjetivo.deleteMany({
            template: { $in: ["6973e9a4fb55f69820fa51fc", "6978a4c9fb55f69820fa8bfb"] }
        });
        console.log(`Deleted ${resStock.deletedCount} overrides for 'Control de stock' ghost templates.`);

        // Ghost: Mejorar porcentaje... (Analitica, unused version)
        // 6972186ffb55f69820fa2cf6
        const resInformes = await OverrideObjetivo.deleteMany({ template: "6972186ffb55f69820fa2cf6" });
        console.log(`Deleted ${resInformes.deletedCount} overrides for 'Mejorar informes' ghost template.`);

        console.log("\nCleanup Complete.");
        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
