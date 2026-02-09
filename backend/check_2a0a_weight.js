import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';

dotenv.config();

console.log("Checking Sibling Weight...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        // Sibling ID from previous output: 697112e1fb55f69820fa2a0a
        const tpl = await Plantilla.findById('697112e1fb55f69820fa2a0a');
        console.log(`Template: ${tpl.nombre}`);
        console.log(`Base Weight: ${tpl.pesoBase}`);
        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
