import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';

dotenv.config();

console.log("Checking Base Weight...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        const tpl = await Plantilla.findById('697111d1fb55f69820fa29e9');
        console.log(`Template: ${tpl.nombre}`);
        console.log(`Base Weight: ${tpl.pesoBase}`);
        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
