import mongoose from 'mongoose';

const uri = "mongodb+srv://Shootemotion:wn6n4nTmbCK476v5@clusterdiagnos.is3afvn.mongodb.net/?retryWrites=true&w=majority&appName=ClusterDiagnos";
const targetId = '691cd132fd36771828f1e7ee';

async function run() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to Mongo Cluster");

        const dbName = 'test'; // We found it here before
        console.log(`Using DB: ${dbName}`);
        const conn = mongoose.connection.useDb(dbName);

        // List collections
        const collections = await conn.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        // Evaluate collection name guess
        const evalCollName = collections.find(c => c.name.startsWith('eval'))?.name || 'evaluaciones';
        console.log(`Using Evaluacion collection: ${evalCollName}`);

        const Evaluacion = conn.model('Evaluacion', new mongoose.Schema({}, { strict: false }), evalCollName);

        // Query by String and ObjectId just in case
        const evals = await Evaluacion.find({
            $or: [
                { plantillaId: targetId },
                { plantillaId: new mongoose.Types.ObjectId(targetId) }
            ]
        }).lean();

        console.log(`Found ${evals.length} evaluations.`);

        if (evals.length > 0) {
            console.log("Sample Eval metasResultados:");
            console.log(JSON.stringify(evals[0].metasResultados, null, 2));

            // Check for the ghost meta string
            const searchStr = "automatizados";
            const regex = new RegExp(searchStr, 'i');
            const foundGhost = evals[0].metasResultados?.some(m => regex.test(m.nombre));
            console.log(`Does specific evaluation contain "automatizados"? ${foundGhost}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
