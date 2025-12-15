
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
        // Add timeout options
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
        console.log("Connected to DB");

        // Bruno Cleri
        const emp = await Empleado.findOne({ nombre: "Bruno", apellido: "Cleri" });

        if (!emp) {
            console.log("Employee 'Bruno Cleri' not found. Trying generic...");
            const anyEmp = await Empleado.findOne();
            if (anyEmp) console.log(`Found generic: ${anyEmp.nombre}`);
            else { console.log("No employees found."); return; }
        } else {
            console.log(`Found: ${emp.nombre} ${emp.apellido} (${emp._id})`);
            const YEAR = 2025;

            console.log(`COMPUTING FOR YEAR: ${YEAR}`);
            const result = await computeForEmployees([emp._id], YEAR);
            const data = result[0];

            console.log("---------------------------------------------------");
            console.log(`YEAR ${YEAR} RESULT for Bruno Cleri:`);
            console.log("Objetivos Count:", data.objetivos.count);
            console.log("Sum Pesos:", data.objetivos.sumPeso);

            data.objetivos.items.forEach(obj => {
                console.log(`OBJ: "${obj.nombre}" | Peso: ${obj.peso} | Target: ${obj.target}`);
            });
            console.log("---------------------------------------------------");

        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

debugDashboard();
