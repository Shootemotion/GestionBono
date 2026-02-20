import mongoose from "mongoose";
import dotenv from "dotenv";
import Empleado from "../src/models/Empleado.model.js";
import Evaluacion from "../src/models/Evaluacion.model.js";
import Plantilla from "../src/models/Plantilla.model.js";

dotenv.config({ path: 'backend/.env' });

const run = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is missing in .env");
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        // 1. Find Bruno
        const empleado = await Empleado.findOne({ nombre: { $regex: "Bruno", $options: "i" } });
        if (!empleado) {
            console.log("Bruno not found");
            return;
        }
        console.log(`Found Empleado: ${empleado.nombre} ${empleado.apellido} (${empleado._id})`);

        // 2. Fetch Template to map IDs
        // Try to find the template for this employee (search ALL, not just active)
        const templates = await mongoose.model("Plantilla").find({});
        console.log(`Found ${templates.length} templates in total.`);

        const metaMap = {};
        templates.forEach(t => {
            t.metas.forEach(m => {
                metaMap[m.metaId || m._id] = m.nombre;
                // Also map regex for safety if IDs drifted
                if (m.nombre.toLowerCase().includes("ticket")) {
                    console.log(`[DEBUG] Found Ticket Meta in template ${t.nombre}: ${m.nombre} (${m.metaId || m._id})`);
                }
            });
        });

        // 3. Get Evaluations
        const evals = await Evaluacion.find({
            empleado: empleado._id
        }).sort({ periodo: -1 }).lean();

        console.log(`Found ${evals.length} evaluations.`);

        evals.forEach(ev => {
            const str = JSON.stringify(ev);
            // Search for ":8" or ": 8" or "8" as value
            // Regex might be safer but string includes is fast
            if (str.includes(":8,") || str.includes(":8}") || str.includes(": 8") || str.includes("Result: 8")) {
                console.log(`\n>>> FOUND '8' IN DOCUMENT for ${ev.periodo}:`);
                console.log(JSON.stringify(ev, null, 2));
            }
            // Also print normal output for context
            console.log(`\n--- EVALUATION: ${ev.periodo} (Year: ${ev.anio}) ---`);

            const metas = ev.metasResultados || ev.metas || [];
            if (metas.length > 0) {
                metas.forEach(m => {
                    const name = metaMap[m.metaId || m._id] || "Unknown Meta";
                    const isTicket = name.toLowerCase().includes("ticket");

                    if (isTicket || m.resultado == 8) {
                        console.log(`>>> [MATCH] ${name} (ID: ${m.metaId}) | Result: ${m.resultado}`);
                    } else {
                        console.log(`    ${name} (ID: ${m.metaId}) | Result: ${m.resultado}`);
                    }
                });
            } else {
                console.log("No metas results.");
            }
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
