// backend/src/controllers/reportes.controller.js
//
// Exportación de resultados de desempeño en Excel y PDF.
// El alcance del usuario se aplica dentro de construirDataset: un jefe que
// pida "toda la nómina" recibe solo su gente.

import mongoose from "mongoose";
import { construirDataset, listarAreas } from "../reportes/dataset.js";
import { generarExcel } from "../reportes/excel.js";
import { generarPDF } from "../reportes/pdf.js";

const ALCANCES = new Set(["nomina", "empleado", "area"]);
const FORMATOS = new Set(["xlsx", "pdf"]);

/** Nombre de archivo seguro: sin acentos, espacios ni barras. */
function nombreArchivo(data, formato, conId) {
  let detalle;
  if (data.alcance === "nomina") detalle = "nomina_completa";
  else if (!conId) detalle = data.alcance === "empleado" ? "todos_los_empleados" : "todas_las_areas";
  else detalle = (data.titulo.split("—")[0] || "").trim();

  return `desempeno_${data.anio}_${detalle}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 90) + (formato === "xlsx" ? ".xlsx" : ".pdf");
}

export async function exportarDesempeno(req, res) {
  try {
    const anio = Number(req.query.anio);
    if (!anio || Number.isNaN(anio)) {
      return res.status(400).json({ message: "Parámetro 'anio' requerido" });
    }

    const formato = String(req.query.formato || "xlsx").toLowerCase();
    if (!FORMATOS.has(formato)) {
      return res.status(400).json({ message: "Formato inválido: usar 'xlsx' o 'pdf'" });
    }

    const alcance = String(req.query.alcance || "nomina").toLowerCase();
    if (!ALCANCES.has(alcance)) {
      return res.status(400).json({ message: "Alcance inválido: usar 'nomina', 'empleado' o 'area'" });
    }

    // Vacío = "todos". Con id = solo ese empleado / esa área.
    const idCrudo = req.query.id ? String(req.query.id) : null;
    if (idCrudo && !mongoose.Types.ObjectId.isValid(idCrudo)) {
      return res.status(400).json({ message: "Parámetro 'id' inválido" });
    }

    const data = await construirDataset({
      user: req.user,
      anio,
      alcance,
      id: idCrudo,
      incluirDesvinculados: String(req.query.incluirDesvinculados || "") === "true",
    });

    // Pidió un empleado o un área puntual y no quedó nada: o no existe o está
    // fuera de su alcance. En los dos casos, 404 sin filtrar cuál de los dos.
    if (idCrudo && !data.empleados.length) {
      return res.status(404).json({ message: "Sin datos para el alcance solicitado" });
    }

    const archivo = nombreArchivo(data, formato, !!idCrudo);
    const buffer = formato === "xlsx" ? await generarExcel(data) : await generarPDF(data);

    res.setHeader(
      "Content-Type",
      formato === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${archivo}"`);
    res.setHeader("Content-Length", Buffer.byteLength(buffer));
    return res.end(Buffer.from(buffer));
  } catch (err) {
    console.error("exportarDesempeno error:", err);
    // El cliente espera un archivo; si ya se mandaron headers no hay vuelta atrás.
    if (res.headersSent) return res.end();
    return res.status(500).json({ message: "Error generando el reporte" });
  }
}

/** Áreas disponibles para el selector del panel de exportación. */
export async function areasParaReporte(req, res) {
  try {
    res.json(await listarAreas());
  } catch (err) {
    console.error("areasParaReporte error:", err);
    res.status(500).json({ message: "Error listando áreas" });
  }
}
