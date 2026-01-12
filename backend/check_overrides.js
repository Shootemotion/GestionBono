import mongoose from 'mongoose';
import OverrideObjetivo from './src/models/OverrideObjetivo.model.js';
import Empleado from './src/models/Empleado.model.js';
import Plantilla from './src/models/Plantilla.model.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = "mongodb+srv://Diagnos_db:UGzcSj8d7BPcAezj@cluster0.fp4nzax.mongodb.net/GestionBono";

async function check() {
  await mongoose.connect(MONGO_URI);

  // Find Alejandra
  const emp = await Empleado.findOne({ apellido: "Rodriguez", nombre: "Alejandra" });
  if (!emp) {
    console.log("Empleado not found");
    process.exit();
  }
  console.log(`Empleado: ${emp.nombre} ${emp.apellido} (${emp._id})`);
  console.log(`Area: ${emp.area}`);
  // Check overrides
  const overrides = await OverrideObjetivo.find({ empleado: emp._id, year: 2025 });
  console.log(`Overrides count: ${overrides.length}`);
  overrides.forEach(o => {
    console.log(` - Tpl: ${o.template} | Excluido: ${o.excluido} | Peso: ${o.peso}`);
  });

  // Check Templates for "Comité de Gestión"
  // First get Area ID
  const areaId = emp.area;
  console.log("Area ID:", areaId);

  // Fetch full area with referents
  const Area = (await import('./src/models/Area.model.js')).default;
  const areaDoc = await Area.findById(areaId);
  console.log(`Area Nombre: ${areaDoc.nombre}`);
  console.log(`Area Referentes: ${areaDoc.referentes}`);

  const isRef = areaDoc.referentes.map(String).includes(String(emp._id));
  console.log(`Is Alejandra Referente of this Area? ${isRef}`);

  const templates = await Plantilla.find({ scopeType: 'area', scopeId: areaId, year: 2025 });
  console.log(`Area Templates count: ${templates.length}`);
  templates.forEach(t => {
    console.log(` - [${t._id}] ${t.nombre} | Tipo: '${t.tipo}' | Frecuencia: '${t.frecuencia}'`);
  });

  process.exit();
  const { isTemplateApplicable } = await import('./src/controllers/dashboard.controller.js');

  const empIdStr = String(emp._id);
  const areaIdStr = String(emp.area);
  const sectorIdStr = emp.sector ? String(emp.sector) : null;

  // NOTE: In dashboard.controller.js, isAreaReferent is calculated using populated area.referentes
  // We calculated isRef = false above.

  console.log(`\nTesting Logic with isAreaReferent=${isRef}:`);

  for (const t of templates) {
    const result = isTemplateApplicable(t, empIdStr, areaIdStr, sectorIdStr, isRef, false, []);
    console.log(` - Tpl [${t.nombre}] -> Result: ${result}`);
  }

  console.log("\n--- Debugging via API ---");
  try {
    const url = `http://localhost:5007/api/dashboard/empleado/${empIdStr}?anio=2025`;
    console.log("Fetching:", url);
    const res = await fetch(url);
    if (!res.ok) {
      console.error("API Error:", res.status, res.statusText);
      const txt = await res.text();
      console.error(txt);
    } else {
      const data = await res.json();
      console.log("API Objetivos Count:", data.objetivos?.count);
      if (data.objetivos?.items) {
        console.log("Items Returned:");
        data.objetivos.items.forEach(i => console.log(` - ${i.nombre}`));
      }
      if (data._debugLogs) {
        console.log("\nServer Debug Logs:");
        data._debugLogs.forEach(l => console.log(l));
      } else {
        console.log("No _debugLogs found in response.");
      }
    }
  } catch (e) {
    console.error("Fetch failed:", e.message);
  }

  process.exit();
}

check();
