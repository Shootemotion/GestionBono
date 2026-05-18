
import mongoose from "mongoose";
import dotenv from "dotenv";
import Evaluacion from "./src/models/Evaluacion.model.js";

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    // Find modified in last 20 mins
    const since = new Date(Date.now() - 20 * 60 * 1000);

    const damaged = await Evaluacion.find({ updatedAt: { $gt: since } }).lean();
    console.log(`Found ${damaged.length} potentially damaged evaluations.`);

    let recoverable = 0;

    for (const ev of damaged) {
        // Check timeline for any snapshot with 'metasResultados'
        // We look for the LAST snapshot before the damage.
        // Filter timeline for actions that have snapshots.
        const snaps = ev.timeline?.filter(t => t.snapshot && t.snapshot.metasResultados) || [];

        if (snaps.length > 0) {
            recoverable++;
            // console.log(`Eval ${ev._id} HAS ${snaps.length} snapshots. Latest: ${snaps[snaps.length-1].action}`);
        }
    }

    console.log(`Total Recoverable (via Snapshots): ${recoverable} / ${damaged.length}`);

    process.exit();
}

run();
