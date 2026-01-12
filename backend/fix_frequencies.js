import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Plantilla from './src/models/Plantilla.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/desempeno-db";

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    const templates = await Plantilla.find({ frecuencia: 'anual' });
    console.log(`Found ${templates.length} templates with 'anual' frequency.`);

    for (const t of templates) {
        console.log(`Updating [${t.nombre}] to 'mensual'...`);
        t.frecuencia = 'mensual';
        await t.save();
    }

    console.log("Done.");
    process.exit();
}

run();
