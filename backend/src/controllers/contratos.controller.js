// backend/src/controllers/contratos.controller.js
//
// El estado de los contratos, para la pantalla.
//
// Corre exactamente lo mismo que `npm run contratos`: las dos cosas llaman a
// `verificarContratos`. Si la pantalla y la consola pudieran diferir, el día
// que lo hicieran nadie sabría cuál creer.

import { verificarContratos } from "../contratos/verificador.js";
import { anioFiscalActual } from "../lib/fiscalYear.js";

/**
 * GET /api/contratos?year=2026
 *
 * Lectura pura: no escribe nada y se puede pedir cuando sea.
 */
export async function estadoContratos(req, res) {
  try {
    const year = Number(req.query.year) || anioFiscalActual();
    res.json(await verificarContratos(year));
  } catch (err) {
    console.error("estadoContratos error:", err);
    res.status(500).json({ message: "Error verificando los contratos" });
  }
}
