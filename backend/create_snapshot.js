import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import Empleado from './src/models/Empleado.model.js';
import { computeForEmployees } from './src/controllers/dashboard.controller.js';

dotenv.config();

async function run() {
  try {
    console.log("Conectando a MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log("Obteniendo empleados activos...");
    const empleados = await Empleado.find({ estadoLaboral: { $ne: "DESVINCULADO" } }, { _id: 1, nombre: 1, apellido: 1 }).lean();
    const ids = empleados.map(e => e._id);
    
    console.log(`Calculando scores para ${ids.length} empleados (Año 2025)...`);
    const data = await computeForEmployees(ids, 2025);
    
    const snapshot = data.map(d => ({
      id: d.empleado._id,
      nombre: d.empleado.nombre,
      apellido: d.empleado.apellido,
      scoreObj: d.scoreObj,
      scoreApt: d.scoreApt,
      scoreFinal: d.scoreFinal,
      bono: d.bono
    }));
    
    fs.writeFileSync('snapshot_scores_before.json', JSON.stringify(snapshot, null, 2));
    console.log(`¡Exito! Snapshot guardado en backend/snapshot_scores_before.json con ${snapshot.length} registros.`);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

run();
