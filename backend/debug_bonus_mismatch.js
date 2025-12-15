
import mongoose from "mongoose";
import { computeForEmployees } from "./src/controllers/dashboard.controller.js";
import Empleado from "./src/models/Empleado.model.js";

import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:admin@clusterdiagnos.is3afvn.mongodb.net/test?retryWrites=true&w=majority";

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        // Find the user "Bruno Cleri" or similar from the screenshot
        const emp = await Empleado.findOne({ apellido: "Cleri" });
        if (!emp) {
            console.log("Empleado not found");
            return;
        }
        console.log(`Found Empleado: ${emp.nombre} ${emp.apellido} (${emp._id})`);

        // Compute 2025
        const year = 2025;
        const [metrics] = await computeForEmployees([emp._id], year);

        console.log("\n--- METRICS ---");
        console.log(JSON.stringify(metrics, null, 2));

        console.log("\n--- EXPLANATION ---");
        console.log(`Score Objectivos: ${metrics.scoreObj}`);
        console.log(`Score Competencias: ${metrics.scoreApt}`);
        console.log(`Score Final (Calculated): ${metrics.scoreFinal}`);

        // Manual check
        const mix = (metrics.scoreObj * 0.7) + (metrics.scoreApt * 0.3);
        console.log(`Manual Mix (70/30): ${mix}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
