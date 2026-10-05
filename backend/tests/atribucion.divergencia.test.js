// backend/tests/atribucion.divergencia.test.js
//
// Por qué la nota guardada no es la que da el motor hoy.
//
// Lo que estos tests cuidan no es tanto que encuentre causas, sino que NO
// invente: una pantalla que siempre halla un culpable deja de servir para
// distinguir lo que sabe de lo que supone. Por eso hay tantos casos de
// "no afirmar" como de "afirmar".

import mongoose from "mongoose";
import { explicarDivergencia, TOLERANCIA } from "../src/lib/atribucionDivergencia.js";

const CIERRE = new Date("2026-06-08T12:00:00Z");
const ANTES = new Date("2026-01-15T10:00:00Z");
const DESPUES = new Date("2026-09-24T10:00:00Z");

/** ObjectId cuya marca de inserción es la fecha dada: así se simula "creado el". */
const idEn = (fecha) => mongoose.Types.ObjectId.createFromTime(Math.floor(fecha.getTime() / 1000));

const feedback = (over = {}) => ({
  _id: "ffffffffffffffffffffffff",
  periodo: "Q1",
  estado: "CLOSED",
  closedAt: CIERRE,
  scores: { obj: 40, comp: 20, global: 60 },
  ...over,
});

const objetivo = (over = {}) => ({
  _id: idEn(ANTES),
  nombre: "Objetivo de prueba",
  peso: 100,
  progreso: 80,
  hitos: [],
  ...over,
});

const dash = (objetivos = [objetivo()]) => ({ objetivos: { items: objetivos } });

const codigos = (r) => r.causas.map((c) => c.codigo);

/* ================================================================== */
describe("cuando no hay nada que explicar", () => {
  test("si las notas coinciden, lo dice y no busca culpables", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 40, comp: 20, global: 60 },
      dash: dash(),
    });
    expect(r.veredicto.nivel).toBe("coincide");
    expect(r.divergencia).toBe(0);
  });

  test("una diferencia dentro de la tolerancia no cuenta como divergencia", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 40, comp: 20, global: 60 + TOLERANCIA },
      dash: dash(),
    });
    expect(r.veredicto.nivel).toBe("coincide");
  });

  test("sin nota guardada no inventa un análisis", () => {
    const r = explicarDivergencia({
      feedback: feedback({ scores: {} }),
      scoresActuales: { obj: 40, comp: 20, global: 60 },
      dash: dash(),
    });
    expect(r.veredicto.nivel).toBe("sin_datos");
    expect(r.divergencia).toBeNull();
  });
});

/* ================================================================== */
describe("de qué lado está la diferencia", () => {
  test("si solo cambian los objetivos, lo dice y no acusa a competencias", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
    });
    expect(codigos(r)).toContain("DIFERENCIA_EN_OBJETIVOS");
    expect(codigos(r)).not.toContain("DIFERENCIA_EN_COMPETENCIAS");
  });

  test("y al revés", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 40, comp: 8, global: 48 },
      dash: dash(),
    });
    expect(codigos(r)).toContain("DIFERENCIA_EN_COMPETENCIAS");
    expect(codigos(r)).not.toContain("DIFERENCIA_EN_OBJETIVOS");
  });

  test("el efecto trae los puntos, con signo", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
    });
    expect(r.causas.find((c) => c.codigo === "DIFERENCIA_EN_OBJETIVOS").efecto).toBe(15);
  });
});

/* ================================================================== */
// La fecha de inserción va dentro del ObjectId y el cliente no la puede
// escribir. Es la evidencia más dura que hay en esta base.
describe("objetivos que no existían cuando se cerró", () => {
  test("un objetivo creado después del cierre se señala", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo(), objetivo({ _id: idEn(DESPUES), nombre: "Clon tardío" })]),
    });
    const c = r.causas.find((x) => x.codigo === "OBJETIVO_AGREGADO_DESPUES_DEL_CIERRE");
    expect(c).toBeDefined();
    expect(c.evidencia[0].nombre).toBe("Clon tardío");
    expect(c.evidencia[0].creadoEl).toBe("2026-09-24");
  });

  test("uno creado antes no se señala", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo(), objetivo({ _id: idEn(ANTES), nombre: "De siempre" })]),
    });
    expect(codigos(r)).not.toContain("OBJETIVO_AGREGADO_DESPUES_DEL_CIERRE");
  });

  test("sin fecha de cierre no se puede afirmar nada sobre el orden", () => {
    const r = explicarDivergencia({
      feedback: feedback({ closedAt: null }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ _id: idEn(DESPUES) })]),
    });
    expect(codigos(r)).not.toContain("OBJETIVO_AGREGADO_DESPUES_DEL_CIERRE");
  });
});

/* ================================================================== */
describe("duplicados y pesos", () => {
  test("el mismo objetivo dos veces se detecta por nombre", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([
        objetivo({ nombre: "Control de stock", peso: 20, progreso: 100 }),
        objetivo({ nombre: "Control de stock", peso: 10, progreso: 0 }),
      ]),
    });
    const c = r.causas.find((x) => x.codigo === "OBJETIVO_DUPLICADO");
    expect(c.evidencia[0].veces).toBe(2);
    expect(c.evidencia[0].copias).toHaveLength(2);
  });

  test("el nombre se compara sin distinguir mayúsculas ni espacios", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ nombre: "Control de Stock" }), objetivo({ nombre: " control de stock " })]),
    });
    expect(codigos(r)).toContain("OBJETIVO_DUPLICADO");
  });

  // CASO REAL: Claudia Ligo tenía 110 por un clon de peso 10.
  test("pesos que suman más de 100", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 50 }), objetivo({ peso: 60 })]),
    });
    const c = r.causas.find((x) => x.codigo === "PESOS_NO_SUMAN_100");
    expect(c.titulo).toMatch(/110/);
    expect(c.detalle).toMatch(/de más/);
  });

  test("pesos que suman menos de 100", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 80 })]),
    });
    expect(r.causas.find((x) => x.codigo === "PESOS_NO_SUMAN_100").detalle).toMatch(/Faltan 20/);
  });

  test("exactamente 100 no dice nada", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 60 }), objetivo({ peso: 40, nombre: "Otro" })]),
    });
    expect(codigos(r)).not.toContain("PESOS_NO_SUMAN_100");
  });
});

/* ================================================================== */
describe("resultados cargados después del cierre", () => {
  const ev = (over = {}) => ({ _id: idEn(ANTES), periodo: "2025Q1", plantillaId: "p1", ...over });

  test("uno creado después se señala como cargado", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      evaluaciones: [ev(), ev({ _id: idEn(DESPUES) })],
    });
    const c = r.causas.find((x) => x.codigo === "RESULTADO_CARGADO_DESPUES_DEL_CIERRE");
    expect(c.titulo).toMatch(/1 cargado/);
  });

  test("uno editado después se señala como modificado", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      evaluaciones: [ev({ updatedAt: DESPUES })],
    });
    expect(
      r.causas.find((x) => x.codigo === "RESULTADO_CARGADO_DESPUES_DEL_CIERRE").titulo
    ).toMatch(/1 modificado/);
  });

  test("los que no se tocaron no aparecen", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      evaluaciones: [ev(), ev()],
    });
    expect(codigos(r)).not.toContain("RESULTADO_CARGADO_DESPUES_DEL_CIERRE");
  });
});

/* ================================================================== */
describe("lo que dice la auditoría", () => {
  const reg = (over = {}) => ({
    entidad: "plantilla",
    accion: "EDITAR",
    email: "alguien@diagnos.com.ar",
    createdAt: DESPUES,
    ...over,
  });

  test("un cambio de configuración posterior al cierre", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      auditoria: [reg()],
    });
    const c = r.causas.find((x) => x.codigo === "CONFIGURACION_CAMBIADA_DESPUES_DEL_CIERRE");
    expect(c.evidencia[0].quien).toBe("alguien@diagnos.com.ar");
    expect(c.evidencia[0].cuando).toBe("2026-09-24");
  });

  test("los overrides se reportan como cambio de pesos, no de configuración", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      auditoria: [reg({ entidad: "override" })],
    });
    expect(codigos(r)).toContain("PESOS_CAMBIADOS_DESPUES_DEL_CIERRE");
  });

  test("un cambio ANTERIOR al cierre no explica nada y no se reporta", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      auditoria: [reg({ createdAt: ANTES })],
    });
    expect(codigos(r)).not.toContain("CONFIGURACION_CAMBIADA_DESPUES_DEL_CIERRE");
  });
});

/* ================================================================== */
// CASO REAL: dos feedbacks CERRADOS con global 112 y 116,8, en una escala que
// llega a 100. Prueba de que el número no pasó por ninguna validación.
describe("notas fuera de escala", () => {
  test("una nota de 112 se marca como imposible", () => {
    const r = explicarDivergencia({
      feedback: feedback({ scores: { obj: 82, comp: 30, global: 112 } }),
      scoresActuales: { obj: 22, comp: 20, global: 42 },
      dash: dash(),
    });
    expect(codigos(r)).toContain("NOTA_GUARDADA_IMPOSIBLE");
    expect(r.veredicto.nivel).toBe("explicada");
    expect(r.veredicto.texto).toMatch(/fuera de escala/);
  });

  test("100 justo sigue siendo válido", () => {
    const r = explicarDivergencia({
      feedback: feedback({ scores: { obj: 70, comp: 30, global: 100 } }),
      scoresActuales: { obj: 40, comp: 20, global: 60 },
      dash: dash(),
    });
    expect(codigos(r)).not.toContain("NOTA_GUARDADA_IMPOSIBLE");
  });
});

/* ================================================================== */
// Reproducir el número comunicado es lo que separa "esto cambió" de "esto lo
// explica". Sin esto, la pantalla solo enumera sospechosos.
describe("reproducción: de sospecha a explicación", () => {
  const base = {
    feedback: feedback(),
    scoresActuales: { obj: 55, comp: 20, global: 75 },
    dash: dash([objetivo(), objetivo({ _id: idEn(DESPUES), nombre: "Clon" })]),
  };

  test("si la foto del día del cierre da la nota comunicada, queda explicada", () => {
    const r = explicarDivergencia({ ...base, reproduccion: { comoAlCerrarCompleto: 60 } });
    expect(r.veredicto.nivel).toBe("explicada");
    expect(r.veredicto.reproducidaPor).toBe("comoAlCerrarCompleto");
  });

  test("si lo que reproduce es la configuración vieja, lo dice así", () => {
    const r = explicarDivergencia({ ...base, reproduccion: { conConfigDelCierre: 60 } });
    expect(r.veredicto.reproducidaPor).toBe("conConfigDelCierre");
    expect(r.veredicto.texto).toMatch(/los resultados son los mismos/i);
  });

  test("si reproduce sacando los objetivos nuevos, también", () => {
    const r = explicarDivergencia({ ...base, reproduccion: { sinPosteriores: 60 } });
    expect(r.veredicto.reproducidaPor).toBe("sinPosteriores");
  });

  test("una reproducción que NO da la nota comunicada no explica nada", () => {
    const r = explicarDivergencia({ ...base, reproduccion: { comoAlCerrarCompleto: 71 } });
    expect(r.veredicto.nivel).not.toBe("explicada");
  });

  test("la reproducción vale dentro de la tolerancia, no solo exacta", () => {
    const r = explicarDivergencia({ ...base, reproduccion: { comoAlCerrarCompleto: 60 + TOLERANCIA } });
    expect(r.veredicto.nivel).toBe("explicada");
  });

  test("el modo seguimiento se reconoce como causa propia", () => {
    const r = explicarDivergencia({
      feedback: feedback({ periodo: "FINAL" }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      reproduccion: { conSeguimiento: 60 },
    });
    expect(r.veredicto.reproducidaPor).toBe("conSeguimiento");
    expect(r.veredicto.texto).toMatch(/seguimiento/);
  });
});

/* ================================================================== */
// El límite del análisis. 162 de los 274 feedbacks del AF2025 se cerraron
// antes de que el registro de cambios existiera: para esos no hay nada que
// reconstruir, y decirlo vale más que señalar al sospechoso más cercano.
describe("cuando no hay registro de lo que pasó", () => {
  const AUDITORIA_DESDE = new Date("2026-09-08T00:00:00Z");

  test("un cierre anterior al registro se marca sin rastro", () => {
    const r = explicarDivergencia({
      feedback: feedback({ closedAt: new Date("2026-03-20T10:00:00Z") }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      auditoriaDesde: AUDITORIA_DESDE,
    });
    expect(r.veredicto.nivel).toBe("sin_rastro");
    expect(r.veredicto.texto).toMatch(/antes de que existiera el registro/);
  });

  test("y aun así reporta lo que sí puede ver", () => {
    const r = explicarDivergencia({
      feedback: feedback({ closedAt: new Date("2026-03-20T10:00:00Z") }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 80 })]),
      auditoriaDesde: AUDITORIA_DESDE,
    });
    expect(codigos(r)).toContain("PESOS_NO_SUMAN_100");
  });

  test("un cierre posterior al registro NO se excusa con esto", () => {
    const r = explicarDivergencia({
      feedback: feedback({ closedAt: new Date("2026-09-20T10:00:00Z") }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 80 })]),
      auditoriaDesde: AUDITORIA_DESDE,
    });
    expect(r.veredicto.nivel).not.toBe("sin_rastro");
  });

  test("una reproducción exitosa le gana al 'sin rastro'", () => {
    // Si se pudo reproducir la nota, da igual que no haya auditoría: está
    // demostrado. El orden de las ramas importa y esto lo fija.
    const r = explicarDivergencia({
      feedback: feedback({ closedAt: new Date("2026-03-20T10:00:00Z") }),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash(),
      auditoriaDesde: AUDITORIA_DESDE,
      reproduccion: { comoAlCerrarCompleto: 60 },
    });
    expect(r.veredicto.nivel).toBe("explicada");
  });
});

/* ================================================================== */
describe("cuando de verdad no se sabe, se dice", () => {
  test("sin causas ni reproducción, no inventa una", () => {
    const r = explicarDivergencia({
      feedback: feedback({ scores: { obj: 40, comp: 20, global: 60 } }),
      scoresActuales: { obj: 40, comp: 20, global: 75 },
      dash: dash(),
    });
    // La única causa posible es el lado de la diferencia, que no explica nada.
    expect(r.veredicto.nivel).toBe("sin_explicacion");
    expect(r.veredicto.texto).toMatch(/No se encontró/);
  });

  test("con varias causas y sin reproducción, nombra la de mayor peso", () => {
    const r = explicarDivergencia({
      feedback: feedback(),
      scoresActuales: { obj: 55, comp: 20, global: 75 },
      dash: dash([objetivo({ peso: 80 }), objetivo({ _id: idEn(DESPUES), nombre: "Clon", peso: 40 })]),
    });
    expect(r.veredicto.nivel).toBe("parcial");
    expect(r.veredicto.texto).toMatch(/El de mayor peso es/);
  });
});
