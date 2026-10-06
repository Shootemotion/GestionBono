// backend/src/contratos/documento.js
//
// Convierte el catálogo en docs/CONTRATOS.md.
//
// El documento se genera, no se escribe: así no puede existir la versión de la
// documentación que dice una cosa y el código que hace otra, que es como se
// mueren los documentos de reglas. Si alguien agrega un contrato y no lo
// documenta, el documento se desactualiza en el próximo `--md` y se nota.

import { CONTRATOS, CAPA } from "./catalogo.js";

const ETIQUETA_CAPA = {
  [CAPA.GUARD]: "**Impuesto** — el backend lo rechaza",
  [CAPA.VALIDACION]: "**Avisado** — se muestra, se puede guardar igual",
  [CAPA.REVISION]: "**Revisado** — solo se detecta al verificar",
};

const GRUPOS = [
  ["OBJ", "Configuración de objetivos"],
  ["EVA", "Resultados cargados"],
  ["NOTA", "La nota"],
  ["TRZ", "Trazabilidad"],
  ["ACC", "Acceso"],
];

const ENCABEZADO = [
  "# Contratos del sistema",
  "",
  "> Generado desde `backend/src/contratos/catalogo.js`.",
  "> No editar a mano: se regenera con `npm run contratos -- --md`.",
  "",
  "Cada contrato es una promesa que el sistema hace y no puede romper. Ninguno",
  "es una buena intención: todos nacen de algo que pasó en el AF2025, dicen",
  "dónde se hacen cumplir, y se verifican contra la base real.",
  "",
  "```",
  "npm run contratos                  # el año fiscal en curso",
  "npm run contratos -- --year 2026",
  "npm run contratos -- --detalle     # todas las violaciones, no una muestra",
  "npm run contratos -- --listar      # el catálogo, sin tocar la base",
  "```",
  "",
  "El comando sale con código 1 si hay alguna violación crítica, así que sirve",
  "como control antes de abrir un ciclo o antes de desplegar.",
  "",
  "## Las tres capas",
  "",
  "Un contrato puede sostenerse de tres formas, y la diferencia importa:",
  "",
  "| Capa | Qué significa |",
  "|---|---|",
  "| **Impuesto** | El backend lo rechaza: 400/403/409 y no escribe. Es la única capa que garantiza algo. |",
  "| **Avisado** | Se detecta y se muestra, pero se puede guardar igual. Para lo que a veces es legítimo. |",
  "| **Revisado** | Solo se verifica después. Son los que todavía no se pueden imponer sin romper datos que ya existen. |",
  "",
  "Un contrato en **Revisado** no es un olvido: es una deuda declarada, y",
  "aparece como tal en el reporte.",
  "",
  "---",
  "",
];

const CIERRE = [
  "## Agregar un contrato",
  "",
  "Se agrega a `backend/src/contratos/catalogo.js` con cinco campos —`titulo`,",
  "`promesa`, `porque`, `seImpone` y `verificar`— y se regenera este documento.",
  "",
  "Si no se puede verificar contra datos, como los de acceso, `verificar`",
  "devuelve `[]` y se completa `verificadoPor` con el test que lo cubre.",
  "",
  "El campo que no hay que saltear es **`porque`**. Un contrato sin el caso real",
  "que lo motivó se discute en la primera reunión en que moleste, y se termina",
  "sacando.",
  "",
];

/** @returns {String} el contenido completo de docs/CONTRATOS.md */
export function generarMarkdown(contratos = CONTRATOS) {
  const lineas = [...ENCABEZADO];

  for (const [prefijo, titulo] of GRUPOS) {
    const delGrupo = contratos.filter((c) => c.id.startsWith(prefijo));
    if (!delGrupo.length) continue;

    lineas.push(`## ${titulo}`, "");
    for (const c of delGrupo) {
      lineas.push(`### ${c.id} — ${c.titulo}`, "");
      lineas.push(c.promesa, "");
      lineas.push(`**Por qué existe.** ${c.porque}`, "");
      lineas.push(`**Cómo se sostiene.** ${c.seImpone}`, "");
      lineas.push(`${ETIQUETA_CAPA[c.capa]} · severidad ${c.severidad}`, "");
      if (c.verificadoPor) lineas.push(`Verificado por: \`${c.verificadoPor}\``, "");
      lineas.push("---", "");
    }
  }

  lineas.push(...CIERRE);
  return lineas.join("\n");
}
