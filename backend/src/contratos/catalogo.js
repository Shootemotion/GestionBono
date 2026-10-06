// backend/src/contratos/catalogo.js
//
// ============================================================================
//  CONTRATOS DEL SISTEMA
// ============================================================================
//
//  Cada entrada de acá es una promesa que el sistema hace y que no puede
//  romper. No son buenas intenciones: cada una nace de algo que efectivamente
//  pasó en el AF2025, dice dónde se hace cumplir, y trae una función que la
//  verifica contra la base real.
//
//  CÓMO SE USA
//    npm run contratos              → verifica el año en curso
//    npm run contratos -- --year 2026
//    npm run contratos -- --detalle
//
//  Sale con código 1 si hay alguna violación crítica, así que sirve como
//  control antes de abrir un ciclo o antes de un deploy.
//
//  LAS TRES CAPAS
//  Un contrato puede sostenerse de tres formas, y la diferencia importa:
//
//    GUARD      el backend lo impide: devuelve 400/403/409 y no escribe.
//               Es la única capa que de verdad garantiza algo.
//    VALIDACIÓN se detecta y se muestra, pero se puede guardar igual. Sirve
//               para lo que a veces es legítimo.
//    REVISIÓN   sólo se verifica después, con esta herramienta. Son los
//               contratos que todavía no se pueden imponer sin romper datos
//               existentes, y están marcados como tales a propósito.
//
//  Si un contrato está en REVISIÓN, eso no es un olvido: es una deuda
//  declarada, y figura así en el reporte.
// ============================================================================

import mongoose from "mongoose";
import { anioFiscalCerrado, etiquetaAnioFiscal } from "../lib/fiscalYear.js";
import { validarCoherenciaObjetivo } from "../lib/validacionObjetivos.js";
import { validarEvaluacion } from "../lib/validacionEvaluaciones.js";
import { resolverNotaOficial, ESTADO } from "../lib/notaOficial.js";
import { motivosFueraDeRango } from "../lib/feedbackScores.js";

export const CAPA = { GUARD: "guard", VALIDACION: "validacion", REVISION: "revision" };
export const SEVERIDAD = { CRITICO: "critico", ALTO: "alto", MEDIO: "medio" };

/** Marca de inserción real; el cliente no la puede falsificar. */
const creadoEl = (doc) => {
  try {
    return new mongoose.Types.ObjectId(String(doc._id)).getTimestamp();
  } catch {
    return doc?.createdAt ? new Date(doc.createdAt) : null;
  }
};

const nombreDe = (ctx, id) =>
  ctx.nombrePorEmpleado.get(String(id)) || "(fuera del alcance)";

/* ==================================================================== *
 *  EL CATÁLOGO
 * ==================================================================== */

export const CONTRATOS = [
  /* ---------------- Configuración de objetivos ---------------- */
  {
    id: "OBJ-01",
    titulo: "No se escribe sobre un año fiscal cerrado",
    promesa:
      "Una vez que empezó el ciclo siguiente, nadie puede crear, editar ni versionar objetivos del anterior, salvo RRHH y dirección.",
    porque:
      "Clonar objetivos del AF2026 sobre el AF2025 corrompió las notas ya comunicadas de 27 personas del Área Técnica. El sistema no tenía ninguna noción de 'año cerrado'.",
    seImpone: "bloqueoPorAnioCerrado() en crear, actualizar y versionar objetivos → 403",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar(ctx) {
      // Lo verificable sin auditoría completa: objetivos creados después de
      // que su propio año fiscal terminara.
      const violaciones = [];
      for (const p of ctx.plantillas) {
        if (!anioFiscalCerrado(p.year)) continue;
        const creado = creadoEl(p);
        // El año fiscal `year` termina el 31/08 de year+1.
        const finDelCiclo = new Date(Number(p.year) + 1, 7, 31, 23, 59, 59);
        if (creado && creado > finDelCiclo) {
          violaciones.push({
            que: `"${String(p.nombre).slice(0, 50)}" (${etiquetaAnioFiscal(p.year)})`,
            detalle: `creado el ${creado.toISOString().slice(0, 10)}, con el ciclo ya terminado`,
          });
        }
      }
      return violaciones;
    },
  },

  {
    id: "OBJ-02",
    titulo: "Un objetivo no se duplica dentro del mismo alcance",
    promesa:
      "No pueden existir dos objetivos con el mismo nombre, tipo, año y alcance.",
    porque:
      "Las clonaciones dejaron el mismo objetivo dos veces sobre la misma gente: el original con sus resultados y un clon vacío que arrastraba el promedio. Sumas de peso en 190%, 250%.",
    seImpone: "buscarDuplicada() en la creación → 409. También atrapa el doble clic.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const vistos = new Map();
      const violaciones = [];
      for (const p of ctx.plantillas) {
        const clave = [p.tipo, p.year, p.scopeType, String(p.scopeId), String(p.nombre).trim().toLowerCase()].join("|");
        if (vistos.has(clave)) {
          violaciones.push({
            que: `"${String(p.nombre).slice(0, 50)}"`,
            detalle: `duplicado en ${p.scopeType} (${etiquetaAnioFiscal(p.year)})`,
          });
        } else vistos.set(clave, p);
      }
      return violaciones;
    },
  },

  {
    id: "OBJ-03",
    titulo: "La configuración de un objetivo produce la nota que se quiso pedir",
    promesa:
      "No se guarda un objetivo cuya configuración haga que el motor devuelva un número que no corresponde al desempeño: un 0 inalcanzable o un 100 regalado.",
    porque:
      "Había objetivos con umbral de 9 períodos sobre un calendario trimestral de 4 —imposible, 0 garantizado todo el año— y metas porcentuales sin valor esperado, que comparan contra 0 y dan 100% con cualquier carga.",
    seImpone: "validarCoherenciaObjetivo() en alta, edición y versionado → 400. Rige desde el AF2026.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar(ctx) {
      const violaciones = [];
      for (const p of ctx.plantillas) {
        if (p.tipo !== "objetivo") continue;
        const { errores } = validarCoherenciaObjetivo(p);
        for (const e of errores) {
          violaciones.push({
            que: `"${String(p.nombre).slice(0, 44)}"`,
            detalle: `${e.codigo}: ${e.mensaje}`,
          });
        }
      }
      return violaciones;
    },
  },

  {
    id: "OBJ-04",
    titulo: "Los pesos de una persona suman 100",
    promesa: "La suma de los pesos de los objetivos de alguien es 100%.",
    porque:
      "Con los pesos en 190% o 265% el reparto deja de significar lo que dice, y las dos formas de normalizar que convivían daban notas distintas —hasta 23 puntos— para la misma persona.",
    seImpone:
      "Todavía NO se bloquea: hay gente con los pesos mal cargados hoy y cortarles el guardado los dejaría sin poder editar nada. Se detecta y se muestra.",
    capa: CAPA.REVISION,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const violaciones = [];
      for (const d of ctx.dash) {
        const objs = d.objetivos?.items ?? d.objetivos ?? [];
        if (!objs.length) continue;
        const suma = objs.reduce((s, o) => s + Number(o.peso || 0), 0);
        if (Math.abs(suma - 100) > 0.5) {
          violaciones.push({
            que: nombreDe(ctx, d.empleado._id),
            detalle: `los pesos suman ${Math.round(suma * 10) / 10}%`,
          });
        }
      }
      return violaciones;
    },
  },

  /* ---------------- Resultados cargados ---------------- */
  {
    id: "EVA-01",
    titulo: "Un resultado vive en un período que existe",
    promesa:
      "Todo resultado cargado corresponde a un período del calendario de su objetivo.",
    porque:
      "Cambiar un objetivo de mensual a trimestral dejó 5 resultados colgados de períodos inexistentes en 20 personas, sin un solo aviso: no se borran, dejan de verse y el objetivo computa como vacío.",
    seImpone:
      "Cambiar la frecuencia con datos cargados exige confirmar el impacto → 409. Los que ya quedaron colgados se listan acá.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const violaciones = [];
      for (const ev of ctx.evaluaciones) {
        const p = ctx.plantillaPorId.get(String(ev.plantillaId));
        // Solo objetivos: una aptitud se evalúa con otro calendario.
        if (!p || p.tipo !== "objetivo") continue;
        const hallazgos = validarEvaluacion(ev, p, {}).filter(
          (h) => h.codigo === "PERIODO_FUERA_DE_CALENDARIO"
        );
        for (const h of hallazgos) {
          violaciones.push({
            que: `${nombreDe(ctx, ev.empleado)} — ${String(p.nombre).slice(0, 36)}`,
            detalle: h.mensaje,
          });
        }
      }
      return violaciones;
    },
  },

  {
    id: "EVA-02",
    titulo: "Un resultado apunta a una meta que existe",
    promesa: "Todo resultado cargado referencia una meta presente en su objetivo.",
    porque:
      "Renombrar una meta sin conservar su identificador dejaba 710 resultados apuntando a metas inexistentes. El motor los busca por id, no los encuentra, y la meta computa como si nunca se hubiera cargado.",
    seImpone:
      "El formulario manda el _id de las metas que ya existen (conservarIdsDeMetas). Los huérfanos viejos se listan acá.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const violaciones = [];
      const porObjetivo = new Map();
      for (const ev of ctx.evaluaciones) {
        const p = ctx.plantillaPorId.get(String(ev.plantillaId));
        if (!p || p.tipo !== "objetivo") continue;
        const n = validarEvaluacion(ev, p, {}).filter((h) => h.codigo === "META_HUERFANA").length;
        if (!n) continue;
        const k = String(p._id);
        porObjetivo.set(k, { nombre: p.nombre, n: (porObjetivo.get(k)?.n || 0) + n });
      }
      // Se agrupa por objetivo: 710 líneas sueltas no se leen, 12 objetivos sí.
      for (const { nombre, n } of porObjetivo.values()) {
        violaciones.push({ que: `"${String(nombre).slice(0, 48)}"`, detalle: `${n} resultado(s) huérfanos` });
      }
      return violaciones;
    },
  },

  {
    id: "EVA-03",
    titulo: "No se evalúa a alguien antes de que entrara",
    promesa:
      "No hay resultados cargados en períodos anteriores a la fecha de ingreso de la persona.",
    porque:
      "Había 52 evaluaciones en períodos previos al ingreso. A una persona le restaban 21 puntos por desempeño de meses en los que no trabajaba acá.",
    seImpone: "updateHito() devuelve 409 salvo que se confirme explícitamente.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const violaciones = [];
      for (const ev of ctx.evaluaciones) {
        const p = ctx.plantillaPorId.get(String(ev.plantillaId));
        const ingreso = ctx.ingresoPorEmpleado.get(String(ev.empleado));
        if (!p || !ingreso) continue;
        const hallazgos = validarEvaluacion(ev, p, { fechaIngreso: ingreso }).filter(
          (h) => h.codigo === "PERIODO_PREVIO_AL_INGRESO"
        );
        for (const h of hallazgos) {
          violaciones.push({ que: nombreDe(ctx, ev.empleado), detalle: h.mensaje });
        }
      }
      return violaciones;
    },
  },

  /* ---------------- La nota ---------------- */
  {
    id: "NOTA-01",
    titulo: "Una nota está dentro de la escala",
    promesa: "Ninguna nota guardada supera 100 ni es negativa.",
    porque:
      "Había dos feedbacks CERRADOS con 112 y 116,8. El número lo calculaba el navegador y se guardaba sin que nadie lo mirara.",
    seImpone: "motivosFueraDeRango() valida el rango al guardar un feedback → 400.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar(ctx) {
      const violaciones = [];
      for (const fb of ctx.feedbacks) {
        const motivos = motivosFueraDeRango(fb.scores);
        for (const m of motivos) {
          violaciones.push({ que: `${nombreDe(ctx, fb.empleado)} (${fb.periodo})`, detalle: m });
        }
      }
      return violaciones;
    },
  },

  {
    id: "NOTA-02",
    titulo: "La nota que ve la persona es la que paga el bono",
    promesa:
      "El número del feedback, el de Mi Desempeño, el de la Sala de Evaluación, el del bono y el de los reportes son el mismo.",
    porque:
      "Había cinco formas distintas de responder 'cuál es la nota'. Once personas veían un número en su pantalla y habrían cobrado otro; en dos casos la diferencia pasaba los 20 puntos.",
    seImpone:
      "notaDelFeedback() y resolverNotaOficial() son el único lugar donde se decide, y lo llaman todas las salidas.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar(ctx) {
      const violaciones = [];
      for (const d of ctx.dash) {
        const fb = (d.feedbacks || []).find((f) => f.periodo === "FINAL" && f.estado === "CLOSED");
        if (!fb) continue;
        const oficial = fb.oficial?.confirmada ? fb.oficial.nota?.global : fb.scores?.global;
        if (oficial == null || d.scoreFinal == null) continue;
        if (Math.abs(Number(d.scoreFinal) - Number(oficial)) > 0.3) {
          violaciones.push({
            que: nombreDe(ctx, d.empleado._id),
            detalle: `la nota dice ${oficial} y el dashboard/bono ${d.scoreFinal}`,
          });
        }
      }
      return violaciones;
    },
  },

  {
    id: "NOTA-03",
    titulo: "El cierre anual tiene nota, y es la del cierre",
    promesa:
      "Nadie cobra un bono sobre la nota de un trimestre: la nota del año sale del feedback FINAL.",
    porque:
      "Seis personas sin FINAL cerrado tenían el bono saliendo de Q2 o Q3. A una le daba 41,7 cuando su cálculo anual era 74,5.",
    seImpone:
      "resolverNotaOficial() marca esos casos como 'sin cierre anual' y NO deja confirmarlos. El número no se cambia solo: la decisión es de RRHH.",
    capa: CAPA.VALIDACION,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      const violaciones = [];
      for (const [empId, fbs] of ctx.feedbacksPorEmpleado) {
        const r = resolverNotaOficial(fbs);
        if (r.estado === ESTADO.SIN_CIERRE_ANUAL) {
          violaciones.push({
            que: nombreDe(ctx, empId),
            detalle: `su nota sale de ${r.periodo} (${r.nota?.global}), que es de mitad de año`,
          });
        }
      }
      return violaciones;
    },
  },

  /* ---------------- Trazabilidad ---------------- */
  {
    id: "TRZ-01",
    titulo: "Todo cambio deja el documento previo",
    promesa:
      "Cada escritura sobre objetivos, pesos, evaluaciones y feedbacks queda registrada con el estado anterior completo.",
    porque:
      "Reconstruir qué había pasado con los objetivos del Área Técnica llevó horas de scripts, y 162 de los 274 cierres del AF2025 siguen sin poder reconstruirse porque son anteriores al registro.",
    seImpone: "auditarEscrituras() montado antes de todos los routers en server.js.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.ALTO,
    async verificar(ctx) {
      // El contrato se cumple hacia adelante. Lo que se verifica es que el
      // registro esté activo y recibiendo.
      const total = await ctx.db.collection("auditorias").countDocuments();
      const ultimos30 = await ctx.db.collection("auditorias").countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      });
      if (total === 0) return [{ que: "auditoría", detalle: "no hay ningún registro" }];
      if (ultimos30 === 0)
        return [{ que: "auditoría", detalle: "sin registros en los últimos 30 días: puede estar desconectada" }];
      return [];
    },
  },

  {
    id: "TRZ-02",
    titulo: "Hay un backup reciente y verificado",
    promesa: "Existe un backup de menos de 48 horas que se puede abrir y leer.",
    porque:
      "El backup fallaba callado desde 3 frentes: el cron solo dispara si el proceso está vivo a las 03:00 y no recupera lo perdido, el zip se escribía en su destino final mientras se armaba, y nadie verificaba el resultado. Entre el 25 y el 28/09/2026 la máquina estuvo apagada a esa hora: 4 días sin copia, sin error y sin nada que lo dijera.",
    seImpone:
      "verificarBackup() abre el zip y comprueba las colecciones; backupSiHaceFalta() corre al arrancar si el último válido tiene más de 24 h.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar() {
      const { ultimoBackupValido } = await import("../../scripts/backup.js");
      const ultimo = await ultimoBackupValido();
      if (!ultimo) return [{ que: "backup", detalle: "no hay ningún backup válido" }];
      const horas = (Date.now() - new Date(ultimo.fecha).getTime()) / 3600000;
      if (horas > 48) {
        return [{ que: "backup", detalle: `el último válido tiene ${Math.round(horas)} h (${ultimo.archivo})` }];
      }
      return [];
    },
  },

  /* ---------------- Acceso ---------------- */
  {
    id: "ACC-01",
    titulo: "Cada jefe ve solo a su gente",
    promesa:
      "Un referente accede al desempeño de las personas de sus áreas y sectores, y de nadie más.",
    porque:
      "dashBySector no verificaba nada: cualquier jefe accedía al dashboard de cualquiera de los 17 sectores —con las notas de toda esa gente— cambiando el id en la URL. Al cerrarlo se taparon 162 combinaciones jefe×sector que estaban abiertas, sin que ninguno de los 11 jefes perdiera el acceso a su propia gente. Además 2 rutas no pedían ninguna capacidad: alcanzaba con agregarle el año a la URL.",
    seImpone:
      "Verificación de alcance en dashByArea, dashBySector y dashByEmpleado; filtroAlcanceEmpleados() en los listados.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar() {
      // Se cubre con tests (dashboard.autorizacion.test.js): no es verificable
      // contra datos, hay que ejercitar las rutas.
      return [];
    },
    verificadoPor: "backend/tests/dashboard.autorizacion.test.js (17 tests)",
  },

  {
    id: "ACC-02",
    titulo: "El sueldo no sale de la API salvo para quien corresponde",
    promesa: "Solo dirección, RRHH y la cuenta técnica reciben información salarial.",
    porque:
      "El sueldo viajaba dentro del payload del dashboard y de los listados de nómina, que ven los 11 jefes de área y sector. No hacía falta ningún permiso especial: estaba en la respuesta.",
    seImpone: "redactSueldoEmpleado() y redactSueldoDashboard() antes de responder.",
    capa: CAPA.GUARD,
    severidad: SEVERIDAD.CRITICO,
    async verificar() {
      return [];
    },
    verificadoPor: "backend/src/utils/salaryVisibility.js",
  },
];

/** Un contrato por id, para poder citarlos desde otros lugares. */
export const porId = (id) => CONTRATOS.find((c) => c.id === id) || null;
