/**
 * ═══════════════════════════════════════════════════════════════════════
 *  RECALCULADOR DE SCORES DE FEEDBACKS — MODO SEGURO
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  SOLO modifica el campo `scores` de los feedbacks en BD.
 *  NO toca: estado, comentario, empleadoAck, closedAt, comentarioEmpleado.
 *  El empleado NO ve ningún cambio visible.
 *
 *  MODO DRY-RUN (por defecto — NUNCA escribe en BD):
 *    node recalculate_feedback_scores.js
 *    node recalculate_feedback_scores.js --apellido="Fitz Patrick"
 *
 *  MODO APPLY (escribe en BD — solo después de revisar el dry-run):
 *    node recalculate_feedback_scores.js --apellido="Fitz Patrick" --apply
 *
 *  OPCIONES:
 *    --apellido="Apellido"   Filtrar por apellido (parcial, case-insensitive)
 *    --periodo=Q1            Solo corregir Q1 / Q2 / Q3 / FINAL
 *    --apply                 Aplicar cambios en BD
 *    --year=2025             Año fiscal (default: 2025)
 * ═══════════════════════════════════════════════════════════════════════
 */

import mongoose from "mongoose";
import Feedback from "./src/models/Feedback.model.js";
import Empleado from "./src/models/Empleado.model.js";
import { computeForEmployees } from "./src/controllers/dashboard.controller.js";
import dotenv from "dotenv";
dotenv.config();

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = !args.includes("--apply");
const YEAR     = parseInt(args.find(a => a.startsWith("--year="))?.split("=")[1] || "2025");
const APELLIDO = args.find(a => a.startsWith("--apellido="))?.split("=").slice(1).join("=") || null;
const PERIODO  = args.find(a => a.startsWith("--periodo="))?.split("=")[1] || null;

const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb+srv://admin:admin@clusterdiagnos.is3afvn.mongodb.net/test?retryWrites=true&w=majority";

// ─── Helper: mes fiscal del período ──────────────────────────────────────────
function getPeriodMonth(p) {
    if (!p) return 0;
    if (p === "Q1")    return 3;
    if (p === "Q2")    return 6;
    if (p === "Q3")    return 9;
    if (p === "FINAL") return 12;
    const suffix = p.length > 4 && !isNaN(p.slice(0, 4)) ? p.slice(4) : p;
    if (suffix.startsWith("M")) { const m = parseInt(suffix.slice(1)); return m >= 9 ? m - 8 : m + 4; }
    if (suffix.startsWith("Q")) return parseInt(suffix.slice(1)) * 3;
    return 12;
}

// ─── Calcula los scores correctos para un período dado ───────────────────────
// Usa computeForEmployees (que ya trae todos los hitos) y luego filtra por período.
function calcularScoresParaPeriodo(metrics, period) {
    const feedbackLimit = getPeriodMonth(period);

    // OBJETIVOS: filtrar hitos hasta el período y recalcular
    const objetivos = metrics.objetivos?.items || metrics.objetivos || [];
    let totalObjScore = 0, totalObjWeight = 0;

    objetivos.forEach(obj => {
        // Solo hitos con datos hasta el límite del período
        const hitosRelevantes = (obj.hitos || []).filter(
            h => h.actual !== null && h.actual !== undefined
              && getPeriodMonth(h.periodo) <= feedbackLimit
        );
        if (hitosRelevantes.length === 0) return;

        // Promedio simple de los hitos disponibles hasta el período
        // (replica la lógica de scoreHelpers.js que usa calculateObjectiveProgress)
        const suma = hitosRelevantes.reduce((acc, h) => acc + Number(h.actual ?? 0), 0);
        const promedio = suma / hitosRelevantes.length;

        totalObjScore  += promedio * (obj.peso || 0);
        totalObjWeight += (obj.peso || 0);
    });

    const scoreObjRaw     = totalObjWeight > 0 ? totalObjScore / totalObjWeight : 0;
    const scoreObjWeighted = scoreObjRaw * 0.7;

    // COMPETENCIAS: filtrar hitos hasta el período, promedio simple
    const aptitudes = metrics.aptitudes?.items || metrics.aptitudes || [];
    let totalCompScore = 0, compCount = 0;

    aptitudes.forEach(apt => {
        const hitosRelevantes = (apt.hitos || []).filter(
            h => h.actual !== null && h.actual !== undefined
              && getPeriodMonth(h.periodo) <= feedbackLimit
        );
        if (hitosRelevantes.length === 0) return;

        const avg = hitosRelevantes.reduce((s, h) => s + Number(h.actual ?? 0), 0) / hitosRelevantes.length;
        totalCompScore += avg;
        compCount++;
    });

    const scoreCompRaw     = compCount > 0 ? totalCompScore / compCount : 0;
    const scoreCompWeighted = scoreCompRaw * 0.3;

    return {
        obj:    +(scoreObjWeighted.toFixed(4)),
        comp:   +(scoreCompWeighted.toFixed(4)),
        global: +((scoreObjWeighted + scoreCompWeighted).toFixed(4)),
    };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGO_URI);

    console.log("✅ Conectado a MongoDB");
    console.log(`\n  Modo  : ${DRY_RUN ? "DRY-RUN — solo preview, NO se escribe nada" : "⚠️  APPLY — SE ESCRIBIRÁ EN BD"}`);
    console.log(`  Año   : ${YEAR}`);
    if (APELLIDO) console.log(`  Filt. : apellido contiene "${APELLIDO}"`);
    if (PERIODO)  console.log(`  Filt. : solo período ${PERIODO}`);
    console.log();

    // Buscar empleados
    const filtro = APELLIDO ? { apellido: { $regex: APELLIDO, $options: "i" } } : {};
    const empleados = await Empleado.find(filtro).lean();

    if (empleados.length === 0) {
        console.log("❌ No se encontraron empleados con ese filtro.");
        await mongoose.disconnect();
        return;
    }
    console.log(`👥 Empleados a procesar: ${empleados.length}\n`);

    let totalRevisados = 0;
    let totalConDiff   = 0;
    let totalAplicados = 0;

    for (const emp of empleados) {
        console.log(`${"─".repeat(68)}`);
        console.log(`  👤  ${emp.apellido}, ${emp.nombre}  (${emp._id})`);
        console.log(`${"─".repeat(68)}`);

        // Obtener métricas completas (todos los hitos del año)
        let metricsArr;
        try {
            metricsArr = await computeForEmployees([emp._id], YEAR);
        } catch (e) {
            console.log(`  ⚠️  Error computando métricas: ${e.message}\n`);
            continue;
        }
        const metrics = metricsArr?.[0];
        if (!metrics) {
            console.log("  Sin métricas disponibles.\n");
            continue;
        }

        // Buscar feedbacks de este empleado
        const feedbackQuery = { empleado: emp._id, year: YEAR };
        if (PERIODO) feedbackQuery.periodo = PERIODO;

        const feedbacks = await Feedback.find(feedbackQuery).lean();
        feedbacks.sort((a, b) => getPeriodMonth(a.periodo) - getPeriodMonth(b.periodo));

        if (feedbacks.length === 0) {
            console.log("  Sin feedbacks almacenados para este año.\n");
            continue;
        }

        for (const fb of feedbacks) {
            totalRevisados++;
            const actual   = fb.scores || {};
            const correcto = calcularScoresParaPeriodo(metrics, fb.periodo);

            const diffObj  = Math.abs((actual.obj    ?? 0) - correcto.obj)    > 0.1;
            const diffComp = Math.abs((actual.comp   ?? 0) - correcto.comp)   > 0.1;
            const diffGlob = Math.abs((actual.global ?? 0) - correcto.global) > 0.1;

            console.log(`\n  📋 ${fb.periodo}  |  Estado: ${fb.estado}`);
            console.log(`     BD actual  → OBJ: ${(actual.obj    ?? "N/A").toString().slice(0,6).padEnd(8)}  COMP: ${(actual.comp   ?? "N/A").toString().slice(0,6).padEnd(8)}  GLOBAL: ${(actual.global ?? "N/A").toString().slice(0,6)}`);
            console.log(`     Correcto   → OBJ: ${correcto.obj.toString().slice(0,6).padEnd(8)}  COMP: ${correcto.comp.toString().slice(0,6).padEnd(8)}  GLOBAL: ${correcto.global.toString().slice(0,6)}`);

            if (!diffObj && !diffComp && !diffGlob) {
                console.log(`     ✅ Sin diferencia. No requiere corrección.`);
                continue;
            }

            totalConDiff++;
            const cambios = [];
            if (diffObj)  cambios.push(`OBJ ${actual.obj ?? "N/A"} → ${correcto.obj}`);
            if (diffComp) cambios.push(`COMP ${actual.comp ?? "N/A"} → ${correcto.comp}`);
            if (diffGlob) cambios.push(`GLOBAL ${actual.global ?? "N/A"} → ${correcto.global}`);
            console.log(`     ❌ CAMBIO: ${cambios.join("  |  ")}`);

            if (!DRY_RUN) {
                // Parche quirúrgico — SOLO el campo scores
                await Feedback.updateOne(
                    { _id: fb._id },
                    {
                        $set: {
                            "scores.obj":    correcto.obj,
                            "scores.comp":   correcto.comp,
                            "scores.global": correcto.global,
                        }
                    }
                );
                totalAplicados++;
                console.log(`     💾 GUARDADO en BD (solo campo scores).`);
            } else {
                console.log(`     ⏸️  DRY-RUN: no guardado. Usa --apply para aplicar.`);
            }
        }
        console.log();
    }

    console.log(`\n${"═".repeat(68)}`);
    console.log(" RESUMEN FINAL");
    console.log(`${"═".repeat(68)}`);
    console.log(`  Feedbacks revisados   : ${totalRevisados}`);
    console.log(`  Con diferencia (bugs) : ${totalConDiff}`);
    console.log(`  Modo                  : ${DRY_RUN ? "DRY-RUN (nada escrito)" : `APPLY (${totalAplicados} corregidos en BD)`}`);

    if (DRY_RUN && totalConDiff > 0) {
        console.log(`\n  Para aplicar los cambios:`);
        const cmd = [
            "node recalculate_feedback_scores.js",
            APELLIDO ? `--apellido="${APELLIDO}"` : "",
            PERIODO  ? `--periodo=${PERIODO}` : "",
            `--year=${YEAR}`,
            "--apply"
        ].filter(Boolean).join(" ");
        console.log(`  → ${cmd}`);
    }

    await mongoose.disconnect();
    console.log("\n✅ Listo.\n");
}

run().catch(err => {
    console.error("❌ Error:", err.message || err);
    process.exit(1);
});
