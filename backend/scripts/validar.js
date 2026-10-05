// backend/scripts/validar.js
//
// Revisión de coherencia por consola:  npm run validar -- --year 2026
//
// Las mismas reglas que bloquean el guardado y que alimentan la pantalla de
// Control de Datos, pasadas por toda la base de una. Sirve para lo que una
// pantalla no sirve: mirar el año entero antes de arrancarlo, y para dejar
// la salida pegada en un ticket.
//
// No escribe nada. Se puede correr en producción sin pensarlo.

import "dotenv/config";
import mongoose from "mongoose";
import Plantilla from "../src/models/Plantilla.model.js";
import Evaluacion from "../src/models/Evaluacion.model.js";
import Empleado from "../src/models/Empleado.model.js";
import { validarLote } from "../src/lib/validacionObjetivos.js";
import { validarLoteEvaluaciones } from "../src/lib/validacionEvaluaciones.js";
import { anioFiscalActual, etiquetaAnioFiscal } from "../src/lib/fiscalYear.js";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};

const year = Number(arg("year", anioFiscalActual()));
const detalle = process.argv.includes("--detalle");
const MAX_SIN_DETALLE = 5;

const ROJO = "\x1b[31m";
const AMARILLO = "\x1b[33m";
const GRIS = "\x1b[90m";
const FIN = "\x1b[0m";

function titulo(texto) {
  console.log(`\n${"═".repeat(72)}\n  ${texto}\n${"═".repeat(72)}`);
}

function imprimirResumen(resumen) {
  if (!resumen.length) {
    console.log("  Sin hallazgos.");
    return;
  }
  for (const r of resumen) {
    const color = r.nivel === "error" ? ROJO : AMARILLO;
    const etiqueta = r.nivel === "error" ? "ERROR  " : "aviso  ";
    console.log(`  ${color}${etiqueta}${FIN} ${String(r.cantidad).padStart(4)}  ${r.codigo}`);
  }
}

function imprimirItems(items, describir) {
  const conErrores = items.filter((i) => i.errores.length);
  const aMostrar = detalle ? conErrores : conErrores.slice(0, MAX_SIN_DETALLE);

  for (const item of aMostrar) {
    console.log(`\n  ${describir(item)}`);
    for (const e of item.errores) {
      console.log(`    ${ROJO}✗${FIN} ${e.mensaje}`);
      if (e.efecto) console.log(`      ${GRIS}${e.efecto}${FIN}`);
    }
  }

  const ocultos = conErrores.length - aMostrar.length;
  if (ocultos > 0) {
    console.log(`\n  ${GRIS}... y ${ocultos} más. Corré con --detalle para verlos todos.${FIN}`);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  titulo(`Revisión de ${etiquetaAnioFiscal(year)}`);

  /* ---------------- Objetivos ---------------- */
  const plantillas = await Plantilla.find({ year, tipo: "objetivo" }).lean();
  const objetivos = validarLote(plantillas);

  console.log(`\nOBJETIVOS: ${objetivos.revisadas} revisados, ` +
    `${objetivos.conErrores} con errores, ` +
    `${objetivos.conHallazgos - objetivos.conErrores} solo con avisos.\n`);
  imprimirResumen(objetivos.resumen);
  imprimirItems(
    objetivos.items,
    (i) => `${i.nombre}  ${GRIS}(${i.frecuencia}, ${i.scopeType}${i.activo ? "" : ", inactivo"})${FIN}`
  );

  /* ---------------- Evaluaciones ---------------- */
  const porId = new Map(plantillas.map((p) => [String(p._id), p]));
  const [evaluaciones, empleados] = await Promise.all([
    Evaluacion.find({ plantillaId: { $in: [...porId.keys()] } })
      .select("empleado plantillaId periodo year estado metasResultados")
      .lean(),
    Empleado.find({}).select("nombre apellido fechaIngreso").lean(),
  ]);

  const ingresoPorEmpleado = new Map(
    empleados.filter((e) => e.fechaIngreso).map((e) => [String(e._id), e.fechaIngreso])
  );
  const nombres = new Map(
    empleados.map((e) => [String(e._id), `${e.apellido ?? ""}, ${e.nombre ?? ""}`.trim()])
  );

  const cargados = validarLoteEvaluaciones(evaluaciones, porId, { ingresoPorEmpleado });

  console.log(`\n\nRESULTADOS CARGADOS: ${cargados.revisadas} revisados, ` +
    `${cargados.conErrores} con errores, ` +
    `${cargados.conHallazgos - cargados.conErrores} solo con avisos.\n`);
  imprimirResumen(cargados.resumen);
  imprimirItems(
    cargados.items,
    (i) => `${nombres.get(i.empleado) || i.empleado} — ${i.objetivo} ${GRIS}(${i.periodo})${FIN}`
  );

  /* ---------------- Cierre ---------------- */
  const errores = objetivos.conErrores + cargados.conErrores;
  console.log(`\n${"─".repeat(72)}`);
  if (errores === 0) {
    console.log(`  Sin errores en ${etiquetaAnioFiscal(year)}.`);
  } else {
    console.log(`  ${ROJO}${errores} elementos con errores${FIN} en ${etiquetaAnioFiscal(year)}.`);
  }
  console.log(`${"─".repeat(72)}\n`);

  await mongoose.disconnect();

  // Código de salida distinto de 0 si hay errores: así sirve en un hook o en
  // una verificación antes de abrir el año.
  process.exit(errores > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("La revisión falló:", e);
  process.exit(2);
});
