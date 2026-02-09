import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';
import Sector from './src/models/Sector.model.js';

dotenv.config();

console.log("Starting Debug Script...");

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to Mongo");

        const tplPre = await Plantilla.findById('69710fbefb55f69820fa29a9'); // Evaluated
        const tplAna = await Plantilla.findById('697217e8fb55f69820fa2cdd'); // Vencido

        const sPre = await Sector.findById(tplPre.scopeId);
        const sAna = await Sector.findById(tplAna.scopeId);

        console.log(`\nTEMPLATE 1 (Karina uses this):`);
        console.log(`ID: ${tplPre._id}`);
        console.log(`Name: "${tplPre.nombre}"`);
        console.log(`Scope: ${tplPre.scopeType} -> ${sPre?.nombre} (${tplPre.scopeId})`);

        console.log(`\nTEMPLATE 2 (The Vencido/Duplicate):`);
        console.log(`ID: ${tplAna._id}`);
        console.log(`Name: "${tplAna.nombre}"`);
        console.log(`Scope: ${tplAna.scopeType} -> ${sAna?.nombre} (${tplAna.scopeId})`);

        process.exit();
    })
    .catch(err => {
        console.error("Connection Error:", err);
        process.exit(1);
    });
