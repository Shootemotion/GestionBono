import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';

dotenv.config();

console.log("Cleaning 2d09 Ghost...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        // 697218d0fb55f69820fa2d09 (Disminuir el tiempo... Analitica)
        const res = await OverrideObjetivo.deleteMany({ template: "697218d0fb55f69820fa2d09" });
        console.log(`Deleted ${res.deletedCount} overrides for 'Disminuir tiempo...' (2d09).`);
        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
