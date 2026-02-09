
import mongoose from "mongoose";
import dotenv from "dotenv";
import Evaluacion from "./src/models/Evaluacion.model.js";
import Empleado from "./src/models/Empleado.model.js";

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    // Find Berta Toro
    const emp = await Empleado.findOne({ apellido: /Toro/i, nombre: /Berta/i });
    if (!emp) {
        console.log("No found Berta");
        process.exit();
    }
    console.log("Found Berta:", emp._id);

    // Find 2025M09 Eval
    const ev = await Evaluacion.findOne({
        empleado: emp._id,
        year: 2025,
        periodo: "2025M09"
    }).lean();

    if (!ev) {
        console.log("No eval found for 2025M09");
    } else {
        console.log("EVAL 2025M09 TIMELINE SCAN:");
        if (ev.timeline && ev.timeline.length) {
            ev.timeline.forEach((t, i) => {
                console.log(`[${i}] ${t.action} @ ${t.at}`);
                if (t.snapshot) {
                    console.log("   SNAPSHOT FOUND:", JSON.stringify(t.snapshot).slice(0, 200) + "...");
                    if (t.snapshot.metasResultados) {
                        console.log("   METAS:", JSON.stringify(t.snapshot.metasResultados));
                    }
                }
            });
        } else {
            console.log("No timeline or empty.");
        }
        console.log("CURRENT METAS:", JSON.stringify(ev.metasResultados, null, 2));
    }

    process.exit();
}

run();
