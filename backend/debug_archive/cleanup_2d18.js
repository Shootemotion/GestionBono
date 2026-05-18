import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';

dotenv.config();

console.log("Cleaning 2d18 Ghost...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        // 69721906fb55f69820fa2d18 (Capacitación... Analitica)
        const res = await OverrideObjetivo.deleteMany({ template: "69721906fb55f69820fa2d18" });
        console.log(`Deleted ${res.deletedCount} overrides for 'Capacitación...' (2d18).`);
        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
