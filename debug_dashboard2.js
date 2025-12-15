
import mongoose from 'mongoose';
import { computeForEmployees } from './backend/src/controllers/dashboard.controller.js';
import Empleado from './backend/src/models/Empleado.model.js';
import './backend/src/models/Plantilla.model.js';
import './backend/src/models/OverrideObjetivo.model.js';
import './backend/src/models/Sector.model.js';
import './backend/src/models/Evaluacion.model.js';
import './backend/src/models/Feedback.model.js';


async function debugDashboard() {
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

        const YEAR = 2023;
        console.log(`Checking ${emp.nombre} for year ${YEAR}...`);

        const result = await computeForEmployees([emp._id], YEAR);
        const data = result[0];

        console.log(`Obj Count: ${data.objetivos.count}`);
        console.log(`Feedbacks Length: ${data.feedbacks.length}`);

        if (data.objetivos.count === 0 && data.feedbacks.length > 0) {
            console.log("FAIL: Logic on disk is BROKEN.");
        } else if (data.objetivos.count === 0 && data.feedbacks.length === 0) {
            console.log("SUCCESS: Logic on disk is CORRECT.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

debugDashboard();
