// backend/src/reportes/excel.js
//
// Genera el libro de Excel del reporte de desempeño.
//
// Criterio de formato: tablas planas, una fila por hecho. En Excel eso vale
// mucho más que una hoja por persona, porque permite filtrar y armar tablas
// dinámicas. La separación por persona o por área se hace con las columnas
// Empleado / Área, que van en todas las hojas.

import ExcelJS from "exceljs";
import { PERIODOS_FEEDBACK } from "./dataset.js";

const AZUL = "FF1E3A8A";
const GRIS = "FFF1F5F9";

const fecha = (d) => (d ? new Date(d) : null);

/** Encabezado con estilo y anchos, más autofiltro y panel congelado. */
function encabezar(hoja, columnas) {
  hoja.columns = columnas.map((c) => ({ key: c.key, width: c.width || 16 }));
  const fila = hoja.addRow(columnas.map((c) => c.header));
  fila.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  fila.alignment = { vertical: "middle", wrapText: true };
  fila.height = 28;
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnas.length },
  };
}

function zebra(hoja) {
  hoja.eachRow((fila, i) => {
    if (i === 1) return;
    if (i % 2 === 0) {
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    }
    fila.alignment = { vertical: "top", wrapText: false };
  });
}

/* ───────────────── Hoja 1: Resumen ───────────────── */
function hojaResumen(wb, data) {
  const hoja = wb.addWorksheet("Resumen");
  const cols = [
    { header: "Empleado", key: "emp", width: 30 },
    { header: "Puesto", key: "puesto", width: 26 },
    { header: "Área", key: "area", width: 24 },
    { header: "Sector", key: "sector", width: 22 },
    { header: "Referente directo", key: "ref", width: 26 },
    { header: "Estado", key: "estadoLab", width: 14 },
    { header: "Σ peso objetivos", key: "spo", width: 15 },
    { header: "Σ peso competencias", key: "spc", width: 17 },
  ];
  for (const p of PERIODOS_FEEDBACK) {
    cols.push({ header: `${p} Obj.`, key: `${p}o`, width: 9 });
    cols.push({ header: `${p} Comp.`, key: `${p}c`, width: 10 });
    cols.push({ header: `${p} Global`, key: `${p}g`, width: 10 });
    cols.push({ header: `${p} Estado`, key: `${p}e`, width: 20 });
  }
  encabezar(hoja, cols);

  for (const e of data.empleados) {
    const fila = {
      emp: e.nombreCompleto, puesto: e.puesto, area: e.area, sector: e.sector,
      ref: (e.referentes || []).join(" / "), estadoLab: e.estadoLaboral, spo: e.sumaPesoObjetivos, spc: e.sumaPesoCompetencias,
    };
    for (const p of PERIODOS_FEEDBACK) {
      const f = e.feedback[p];
      fila[`${p}o`] = f?.obj ?? null;
      fila[`${p}c`] = f?.comp ?? null;
      fila[`${p}g`] = f?.global ?? null;
      fila[`${p}e`] = f?.estadoLabel ?? "";
    }
    const r = hoja.addRow(fila);
    // Un Σ de pesos distinto de 100 distorsiona la nota: que salte a la vista.
    for (const k of ["spo", "spc"]) {
      const v = r.getCell(k).value;
      if (v !== 100) r.getCell(k).font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }
  zebra(hoja);
  return hoja;
}

/* ───────────────── Hoja 2: Objetivos ───────────────── */
function hojaObjetivos(wb, data) {
  const hoja = wb.addWorksheet("Objetivos");
  encabezar(hoja, [
    { header: "Empleado", key: "emp", width: 30 },
    { header: "Área", key: "area", width: 22 },
    { header: "Sector", key: "sector", width: 20 },
    { header: "Objetivo", key: "obj", width: 46 },
    { header: "Peso", key: "peso", width: 8 },
    { header: "Frecuencia", key: "frec", width: 13 },
    { header: "Regla de cierre", key: "regla", width: 16 },
    { header: "Meta", key: "meta", width: 40 },
    { header: "Unidad", key: "unidad", width: 14 },
    { header: "Operador", key: "op", width: 10 },
    { header: "Esperado", key: "esp", width: 10 },
    { header: "Peso meta", key: "pmeta", width: 10 },
    { header: "Período", key: "per", width: 11 },
    { header: "Resultado cargado", key: "res", width: 16 },
    { header: "Cumple", key: "cumple", width: 9 },
    { header: "Avance del objetivo (calculado)", key: "prog", width: 26 },
  ]);

  for (const e of data.empleados) {
    for (const o of e.objetivos) {
      if (!o.metas.length) {
        hoja.addRow({
          emp: e.nombreCompleto, area: e.area, sector: e.sector, obj: o.nombre,
          peso: o.peso, frec: o.frecuencia, regla: o.reglaCierre,
          meta: "(sin metas configuradas)", prog: o.progreso,
        });
        continue;
      }
      for (const m of o.metas) {
        const resultados = m.resultados.length ? m.resultados : [{ periodo: "", resultado: null, cumple: null }];
        for (const r of resultados) {
          hoja.addRow({
            emp: e.nombreCompleto, area: e.area, sector: e.sector,
            obj: o.nombre, peso: o.peso, frec: o.frecuencia, regla: o.reglaCierre,
            meta: m.nombre, unidad: m.unidad, op: m.operador, esp: m.esperado, pmeta: m.pesoMeta,
            per: r.periodo,
            res: r.resultado,
            cumple: r.cumple === null ? "" : r.cumple ? "Sí" : "No",
            prog: o.progreso,
          });
        }
      }
    }
  }
  zebra(hoja);
}

/* ───────────────── Hoja 3: Competencias ───────────────── */
function hojaCompetencias(wb, data) {
  const hoja = wb.addWorksheet("Competencias");
  encabezar(hoja, [
    { header: "Empleado", key: "emp", width: 30 },
    { header: "Área", key: "area", width: 22 },
    { header: "Sector", key: "sector", width: 20 },
    { header: "Competencia", key: "comp", width: 42 },
    { header: "Peso", key: "peso", width: 8 },
    { header: "Período", key: "per", width: 11 },
    { header: "Puntuación", key: "punt", width: 12 },
    { header: "Promedio anual (calculado)", key: "prom", width: 22 },
  ]);

  for (const e of data.empleados) {
    for (const c of e.competencias) {
      const resultados = c.resultados.length ? c.resultados : [{ periodo: "", puntuacion: null }];
      for (const r of resultados) {
        hoja.addRow({
          emp: e.nombreCompleto, area: e.area, sector: e.sector,
          comp: c.nombre, peso: c.peso, per: r.periodo, punt: r.puntuacion, prom: c.puntuacion,
        });
      }
    }
  }
  zebra(hoja);
}

/* ───────────────── Hoja 4: Feedback ───────────────── */
function hojaFeedback(wb, data) {
  const hoja = wb.addWorksheet("Feedback");
  encabezar(hoja, [
    { header: "Empleado", key: "emp", width: 30 },
    { header: "Área", key: "area", width: 22 },
    { header: "Período", key: "per", width: 9 },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Evaluado por", key: "evaluador", width: 26 },
    { header: "Referente directo", key: "ref", width: 26 },
    { header: "Objetivos", key: "obj", width: 10 },
    { header: "Competencias", key: "comp", width: 12 },
    { header: "Global", key: "glob", width: 9 },
    { header: "Enviado", key: "env", width: 12 },
    { header: "Cerrado", key: "cer", width: 12 },
    { header: "Respuesta del empleado", key: "ack", width: 20 },
    { header: "Fecha respuesta", key: "ackf", width: 14 },
    { header: "Motivo de desacuerdo", key: "motivo", width: 40 },
    { header: "Comentario del jefe", key: "cj", width: 60 },
    { header: "Comentario del empleado", key: "ce", width: 60 },
    { header: "Comentario de RRHH", key: "cr", width: 40 },
  ]);

  for (const e of data.empleados) {
    for (const p of PERIODOS_FEEDBACK) {
      const f = e.feedback[p];
      if (!f) continue;
      const r = hoja.addRow({
        emp: e.nombreCompleto, area: e.area, per: p, estado: f.estadoLabel,
        evaluador: f.evaluador || "", ref: (e.referentes || []).join(" / "),
        obj: f.obj, comp: f.comp, glob: f.global,
        env: fecha(f.enviado), cer: fecha(f.cerrado),
        ack: f.ackLabel, ackf: fecha(f.ackFecha), motivo: f.motivoDesacuerdo,
        cj: f.comentario, ce: f.comentarioEmpleado, cr: f.comentarioRRHH,
      });
      for (const k of ["env", "cer", "ackf"]) r.getCell(k).numFmt = "dd/mm/yyyy";
    }
  }
  zebra(hoja);
}

/* ───────────────── Hoja 5: Áreas ───────────────── */
function hojaAreas(wb, data) {
  const hoja = wb.addWorksheet("Áreas");
  const cols = [
    { header: "Área", key: "area", width: 32 },
    { header: "Empleados", key: "n", width: 11 },
    { header: "Con nota", key: "cn", width: 10 },
    { header: "Pesos ≠ 100%", key: "mal", width: 13 },
    { header: "Avance objetivos", key: "ao", width: 15 },
    { header: "Avance competencias", key: "ac", width: 17 },
  ];
  // Objetivos y competencias por separado, no solo el global: ver un promedio
  // global sin sus componentes no deja saber de qué lado viene el número.
  for (const p of PERIODOS_FEEDBACK) {
    cols.push({ header: `${p} obj.`, key: `${p}o`, width: 9 });
    cols.push({ header: `${p} comp.`, key: `${p}c`, width: 10 });
    cols.push({ header: `${p} global`, key: `${p}g`, width: 10 });
  }
  encabezar(hoja, cols);

  const agregar = (nombre, r, cantidad, negrita) => {
    const fila = {
      area: nombre, n: cantidad, cn: r.conNota, mal: r.pesosFueraDe100,
      ao: r.avanceObjetivos, ac: r.avanceCompetencias,
    };
    for (const p of PERIODOS_FEEDBACK) {
      fila[`${p}o`] = r.promedios[p]?.obj ?? null;
      fila[`${p}c`] = r.promedios[p]?.comp ?? null;
      fila[`${p}g`] = r.promedios[p]?.global ?? null;
    }
    const row = hoja.addRow(fila);
    if (negrita) row.font = { bold: true };
    return row;
  };

  for (const a of data.areas) agregar(a.nombre, a, a.empleados.length, false);
  if (data.totales) agregar("TOTAL", data.totales, data.empleados.length, true);
  zebra(hoja);
}

/* ───────────────── Portada ───────────────── */
function hojaPortada(wb, data) {
  const hoja = wb.addWorksheet("Informe");
  hoja.columns = [{ width: 30 }, { width: 70 }];
  const titulo = hoja.addRow(["Resultados de desempeño"]);
  titulo.font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.addRow([]);
  const filas = [
    ["Año fiscal", data.anioLabel],
    ["Alcance", data.titulo],
    ["Empleados incluidos", data.empleados.length],
    ["Generado", data.generadoEl],
    [],
    ["Notas por período", "Se toman del feedback guardado: es lo que efectivamente se le comunicó a cada persona. No se recalculan."],
    ["Resultados por período", "Valores cargados tal como quedaron guardados, junto con la configuración de cada meta."],
    ["Columnas 'calculado'", "Avance del objetivo y promedio de competencia son derivados, no forman parte del registro oficial."],
    ["Σ de pesos", "En rojo cuando no suma 100: ese empleado tiene techo (por debajo) o puede superar el 100% (por encima)."],
  ];
  for (const [k, v] of filas) {
    const r = hoja.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (k === "Generado") r.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
  }
}

export async function generarExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de Desempeño";
  wb.created = data.generadoEl;

  hojaPortada(wb, data);
  hojaResumen(wb, data);
  if (data.areas.length > 1) hojaAreas(wb, data);
  hojaObjetivos(wb, data);
  hojaCompetencias(wb, data);
  hojaFeedback(wb, data);

  return wb.xlsx.writeBuffer();
}
