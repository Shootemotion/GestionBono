
import mongoose from 'mongoose';
import { computeForEmployees } from './backend/src/controllers/dashboard.controller.js';
import Empleado from './backend/src/models/Empleado.model.js';
import Feedback from './backend/src/models/Feedback.model.js';
import './backend/src/models/Plantilla.model.js';
import './backend/src/models/OverrideObjetivo.model.js';
import './backend/src/models/Sector.model.js';
import './backend/src/models/Evaluacion.model.js';

async function debugBonusTrace() {
    try {
        const mongoUri = "mongodb+srv://Shootemotion:wn6n4nTmbCK476v5@clusterdiagnos.is3afvn.mongodb.net/?retryWrites=true&w=majority&appName=ClusterDiagnos";
        // Increase timeout and try simplified options
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
        });
        console.log("Connected to DB");

        const emp = await Empleado.findOne({ nombre: "Bruno", apellido: "Cleri" });
        if (!emp) { console.log("Bruno Cleri not found"); return; }

        const YEAR = 2025;
        console.log(`Checking ${emp.nombre} for year ${YEAR}...`);

        // 1. Inspect Raw Feedbacks
        const feedbacks = await Feedback.find({ empleado: emp._id, year: YEAR }).lean();
        console.log(`Found ${feedbacks.length} feedbacks.`);

        feedbacks.forEach(f => {
            console.log(`- [${f.periodo}] State: ${f.estado}, ScoreGlobal: ${f.scores?.global}`);
        });

        // 2. Run Computation Logic
        console.log("Running computeForEmployees...");
        const result = await computeForEmployees([emp._id], YEAR);
        const data = result[0];

        console.log("--- FINAL CALCULATION ---");
        console.log(`ScoreFinal: ${data.scoreFinal}`);
        console.log(`Bono String: ${data.bono}`);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

debugBonusTrace();
