// backend/scripts/contratos.js
//
// Verifica los contratos del sistema contra la base real.
//
//   npm run contratos                  → el año fiscal en curso
//   npm run contratos -- --year 2026
//   npm run contratos -- --detalle     → lista todas las violaciones
//   npm run contratos -- --listar      → solo el catálogo, sin tocar la base
//
// Sale con código 1 si hay alguna violación CRÍTICA, así que sirve como
// control antes de abrir un ciclo o antes de desplegar.
//
// No escribe nada: se puede correr en producción sin pensarlo.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import mongoose from "mongoose";
import Empleado from "../src/models/Empleado.model.js";
import Plantilla from "../src/models/Plantilla.model.js";
import Evaluacion from "../src/models/Evaluacion.model.js";
import Feedback from "../src/models/Feedback.model.js";
import { computeForEmployees } from "../src/controllers/dashboard.controller.js";
import { CONTRATOS, CAPA, SEVERIDAD } from "../src/contratos/catalogo.js";
import { generarMarkdown } from "../src/contratos/documento.js";
import { verificarContratos } from "../src/contratos/verificador.js";
import { anioFiscalActual, etiquetaAnioFiscal } from "../src/lib/fiscalYear.js";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};
const tiene = (f) => process.argv.includes(`--${f}`);

const ROJO = "\x1b[31m", AMARILLO = "\x1b[33m", VERDE = "\x1b[32m";
const GRIS = "\x1b[90m", NEGRITA = "\x1b[1m", FIN = "\x1b[0m";

const ICONO_CAPA = {
  [CAPA.GUARD]: "🔒",
  [CAPA.VALIDACION]: "⚠️ ",
  [CAPA.REVISION]: "👁️ ",
};
const ETIQUETA_CAPA = {
  [CAPA.GUARD]: "el backend lo impide",
  [CAPA.VALIDACION]: "se avisa, se puede guardar",
  [CAPA.REVISION]: "solo se revisa acá",
};

function listarCatalogo() {
  console.log(`\n${NEGRITA}CONTRATOS DEL SISTEMA${FIN}\n`);
  for (const c of CONTRATOS) {
    console.log(`${NEGRITA}${c.id}${FIN}  ${c.titulo}`);
    console.log(`    ${c.promesa}`);
    console.log(`    ${GRIS}por qué: ${c.porque}${FIN}`);
    console.log(`    ${GRIS}cómo:    ${c.seImpone}${FIN}`);
    console.log(`    ${ICONO_CAPA[c.capa]} ${ETIQUETA_CAPA[c.capa]}   ·   ${c.severidad}`);
    if (c.verificadoPor) console.log(`    ${GRIS}tests:   ${c.verificadoPor}${FIN}`);
    console.log("");
  }
  console.log(`${CONTRATOS.length} contratos.\n`);
}

async function main() {
  if (tiene("listar")) {
    listarCatalogo();
    return 0;
  }

  if (tiene("md")) {
    const destino = new URL("../../docs/CONTRATOS.md", import.meta.url);
    writeFileSync(destino, generarMarkdown(), "utf8");
    console.log(`docs/CONTRATOS.md regenerado desde el catálogo (${CONTRATOS.length} contratos).`);
    return 0;
  }

  const year = Number(arg("year", anioFiscalActual()));
  const detalle = tiene("detalle");
  const MAX = detalle ? Infinity : 4;

  await mongoose.connect(process.env.MONGO_URI);

  // La consola y la pantalla corren exactamente lo mismo.
  const r = await verificarContratos(year);

  console.log(`
${"═".repeat(74)}`);
  console.log(`  CONTRATOS — ${etiquetaAnioFiscal(year)}`);
  console.log(`  ${r.universo.personas} personas · ${r.universo.objetivos} objetivos · ${r.universo.resultados} resultados · ${r.universo.feedbacks} feedbacks`);
  console.log(`${"═".repeat(74)}
`);

  for (const c of r.contratos) {
    if (c.estado === "no_verificable") {
      console.log(`${AMARILLO}?${FIN} ${NEGRITA}${c.id}${FIN}  ${c.titulo}`);
      console.log(`    ${AMARILLO}no se pudo verificar: ${c.error}${FIN}
`);
      continue;
    }

    if (c.estado === "cumplido") {
      console.log(`${VERDE}✓${FIN} ${NEGRITA}${c.id}${FIN}  ${c.titulo}`);
      if (c.verificadoPor) console.log(`    ${GRIS}${c.verificadoPor}${FIN}`);
      console.log("");
      continue;
    }

    const esCritico = c.severidad === SEVERIDAD.CRITICO;
    const color = esCritico ? ROJO : AMARILLO;
    console.log(`${color}✗${FIN} ${NEGRITA}${c.id}${FIN}  ${c.titulo}   ${color}${c.cantidad} caso(s)${FIN}`);
    console.log(`    ${GRIS}${c.promesa}${FIN}`);
    console.log(`    ${ICONO_CAPA[c.capa]} ${GRIS}${ETIQUETA_CAPA[c.capa]}${FIN}`);
    for (const v of c.violaciones.slice(0, MAX)) {
      console.log(`      · ${v.que}${v.detalle ? ` — ${GRIS}${v.detalle}${FIN}` : ""}`);
    }
    if (c.cantidad > MAX) {
      console.log(`      ${GRIS}… y ${c.cantidad - MAX} más (--detalle para verlos)${FIN}`);
    }
    console.log("");
  }

  const cumplidos = r.cumplidos;
  const rotos = r.incumplidos;
  const criticosRotos = r.criticosRotos;

  console.log(`${"─".repeat(74)}`);
  console.log(`  ${VERDE}${cumplidos} cumplidos${FIN}   ${rotos ? `${ROJO}${rotos} con violaciones${FIN}` : "0 con violaciones"}   de ${CONTRATOS.length}`);
  if (criticosRotos) {
    console.log(`  ${ROJO}${NEGRITA}${criticosRotos} contrato(s) CRÍTICOS incumplidos.${FIN}`);
  }
  console.log(`${"─".repeat(74)}\n`);

  await mongoose.disconnect();
  return criticosRotos > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("La verificación falló:", e);
    process.exit(2);
  });
