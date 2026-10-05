// backend/tests/validacion.evaluaciones.test.js
//
// Resultados cargados que el motor NO computa, y que por eso no se notan: el
// objetivo simplemente da más bajo y nadie sabe por qué. Cada bloque es una de
// las formas concretas en que aparecieron en esta base.

import {
  validarEvaluacion,
  validarLoteEvaluaciones,
  periodosValidos,
} from "../src/lib/validacionEvaluaciones.js";

const META_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTRA_META = "bbbbbbbbbbbbbbbbbbbbbbbb";

const plantilla = (over = {}) => ({
  _id: "pppppppppppppppppppppppp",
  nombre: "Objetivo de prueba",
  year: 2026,
  frecuencia: "trimestral",
  metas: [
    {
      _id: META_ID,
      nombre: "Meta de prueba",
      unidad: "Porcentual",
      operador: ">=",
      esperado: 95,
      reglaCierre: "promedio",
    },
  ],
  ...over,
});

const evaluacion = (over = {}) => ({
  _id: "eeeeeeeeeeeeeeeeeeeeeeee",
  empleado: "111111111111111111111111",
  plantillaId: "pppppppppppppppppppppppp",
  periodo: "2026Q1",
  metasResultados: [{ metaId: META_ID, nombre: "Meta de prueba", resultado: 96 }],
  ...over,
});

// Fecha fija: el AF2026 va de sep/2026 a ago/2027, así que a esta altura
// Q1 ya cerró y Q3 todavía no. Sin esto los tests cambiarían de resultado
// según el día en que se corran.
const AHORA = new Date(2027, 0, 15); // 15 de enero de 2027

const codigos = (hs) => hs.map((h) => h.codigo);
const correr = (ev, pl, ctx = {}) => validarEvaluacion(ev, pl, { ahora: AHORA, ...ctx });

/* ================================================================== */
describe("lo que está bien no se marca", () => {
  test("un resultado normal no devuelve nada", () => {
    expect(correr(evaluacion(), plantilla())).toEqual([]);
  });
});

/* ================================================================== */
describe("períodos que no existen en el calendario", () => {
  // CASO REAL: cambiar un objetivo de mensual a trimestral dejó 5 resultados
  // colgados en 20 personas, sin un solo aviso.
  test("un período mensual en un objetivo trimestral queda colgado", () => {
    const hs = correr(evaluacion({ periodo: "2026M03" }), plantilla({ frecuencia: "trimestral" }));
    expect(codigos(hs)).toContain("PERIODO_FUERA_DE_CALENDARIO");
    expect(hs[0].efecto).toMatch(/no lo suma/);
    expect(hs[0].efecto).toMatch(/cambiarle la frecuencia/);
  });

  test("el mismo período en un objetivo mensual es válido", () => {
    const hs = correr(evaluacion({ periodo: "2026M10" }), plantilla({ frecuencia: "mensual" }));
    expect(codigos(hs)).not.toContain("PERIODO_FUERA_DE_CALENDARIO");
  });

  test("un Q5 no existe ni en trimestral", () => {
    const hs = correr(evaluacion({ periodo: "2026Q5" }), plantilla());
    expect(codigos(hs)).toContain("PERIODO_FUERA_DE_CALENDARIO");
  });

  test("el calendario sale de generarHitos, no de una tabla", () => {
    expect([...periodosValidos({ year: 2026, frecuencia: "trimestral" })]).toEqual([
      "2026Q1", "2026Q2", "2026Q3", "2026Q4",
    ]);
    expect(periodosValidos({ year: 2026, frecuencia: "mensual" }).size).toBe(12);
  });
});

/* ================================================================== */
// Un año fiscal cruza el cambio de año calendario, y el nombre del período lo
// refleja. Una validación que compare el prefijo del período contra el `year`
// del objetivo marca como error la mitad del año: se escribió así, se midió
// contra la base y dio 1139 falsos positivos. Estos tests existen para que no
// vuelva a parecer una buena idea.
describe("el año del período no es el año fiscal", () => {
  test("en un objetivo mensual del AF2026, enero se llama 2027M01 y es válido", () => {
    const hs = correr(evaluacion({ periodo: "2027M01" }), plantilla({ frecuencia: "mensual" }));
    expect(codigos(hs)).not.toContain("PERIODO_FUERA_DE_CALENDARIO");
  });

  test("ninguno de los 12 períodos de un mensual del AF2026 queda fuera del calendario", () => {
    const pl = plantilla({ frecuencia: "mensual" });
    const periodos = [...periodosValidos(pl)];
    expect(periodos).toHaveLength(12);
    // Cuatro llevan 2026 (sep-dic) y ocho llevan 2027 (ene-ago): ésa es la
    // mitad del año que una comparación por prefijo marcaría como ajena.
    expect(periodos.filter((p) => p.startsWith("2027"))).toHaveLength(8);
    for (const periodo of periodos) {
      // Se ignora PERIODO_FUTURO: es otra regla y depende de la fecha, no del año del período.
      const hs = correr(evaluacion({ periodo }), pl).filter((h) => h.codigo !== "PERIODO_FUTURO");
      expect(hs).toEqual([]);
    }
  });

  test("un período realmente ajeno sigue cayendo por no estar en el calendario", () => {
    const hs = correr(evaluacion({ periodo: "2025Q1" }), plantilla({ year: 2026 }));
    expect(codigos(hs)).toEqual(["PERIODO_FUERA_DE_CALENDARIO"]);
  });
});

/* ================================================================== */
describe("cargas anteriores al ingreso de la persona", () => {
  // CASO REAL: 52 evaluaciones cargadas en períodos previos a la fecha de
  // ingreso. Entre ellas, Navarro perdía 21 puntos por esto.
  test("ingreso en enero: un resultado de Q1 (sep-nov) es un error", () => {
    const hs = correr(evaluacion({ periodo: "2026Q1" }), plantilla(), {
      fechaIngreso: new Date(2027, 0, 10), // enero 2027, ya empezado el AF2026
    });
    expect(codigos(hs)).toContain("PERIODO_PREVIO_AL_INGRESO");
    expect(hs[0].efecto).toMatch(/todavía no trabajaba/);
  });

  test("el período posterior al ingreso no se marca", () => {
    const hs = correr(evaluacion({ periodo: "2026Q3" }), plantilla(), {
      fechaIngreso: new Date(2027, 0, 10),
    });
    expect(codigos(hs)).not.toContain("PERIODO_PREVIO_AL_INGRESO");
  });

  test("quien estuvo el año completo nunca dispara la regla", () => {
    const hs = correr(evaluacion({ periodo: "2026Q1" }), plantilla(), {
      fechaIngreso: new Date(2015, 3, 1),
    });
    expect(codigos(hs)).not.toContain("PERIODO_PREVIO_AL_INGRESO");
  });

  test("sin fecha de ingreso no se inventa nada", () => {
    const hs = correr(evaluacion({ periodo: "2026Q1" }), plantilla());
    expect(codigos(hs)).not.toContain("PERIODO_PREVIO_AL_INGRESO");
  });
});

/* ================================================================== */
describe("metas huérfanas", () => {
  // CASO REAL: ~719 metaId que no existen en ninguna plantilla. Aparecen al
  // renombrar una meta sin mandar su _id: el backend le genera uno nuevo y
  // los resultados viejos quedan apuntando al anterior.
  test("un metaId que no está en la plantilla es un error", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: OTRA_META, nombre: "Meta vieja", resultado: 80 }] }),
      plantilla()
    );
    expect(codigos(hs)).toContain("META_HUERFANA");
    expect(hs[0].efecto).toMatch(/renombrar una meta/);
  });

  test("un resultado sin metaId también lo es", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ nombre: "Meta suelta", resultado: 80 }] }),
      plantilla()
    );
    expect(codigos(hs)).toContain("META_HUERFANA");
  });

  test("si el objetivo no tiene metas definidas, no se acusa de huérfano", () => {
    // Son los objetivos viejos sin metas: el motor usa el cálculo legacy.
    const hs = correr(evaluacion(), plantilla({ metas: [] }));
    expect(codigos(hs)).not.toContain("META_HUERFANA");
  });

  test("una meta huérfana no arrastra las demás validaciones de esa meta", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: OTRA_META, nombre: "X", resultado: "no numérico" }] }),
      plantilla()
    );
    expect(codigos(hs)).toEqual(["META_HUERFANA"]);
  });
});

/* ================================================================== */
describe("valores que no corresponden a la unidad de la meta", () => {
  test("texto en una meta numérica: el motor lo toma como 0", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: "pendiente" }] }),
      plantilla()
    );
    expect(codigos(hs)).toContain("VALOR_NO_NUMERICO");
    expect(hs[0].efecto).toMatch(/cuenta como incumplido/);
  });

  test("un número con coma decimal sí se entiende", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: "96,5" }] }),
      plantilla()
    );
    expect(codigos(hs)).toEqual([]);
  });

  test("un porcentaje cargado en una meta Cumple/No Cumple se avisa", () => {
    const pl = plantilla({
      metas: [{ _id: META_ID, nombre: "M", unidad: "Cumple/No Cumple" }],
    });
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: 85 }] }),
      pl
    );
    expect(codigos(hs)).toContain("VALOR_BINARIO_RARO");
    expect(hs[0].efecto).toMatch(/distinto de 0/);
  });

  test("0 y 1 son los valores esperados de una binaria", () => {
    const pl = plantilla({ metas: [{ _id: META_ID, nombre: "M", unidad: "Cumple/No Cumple" }] });
    for (const v of [0, 1, true, false]) {
      const hs = correr(
        evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: v }] }),
        pl
      );
      expect(codigos(hs)).toEqual([]);
    }
  });

  test("un valor negativo se avisa sin bloquear", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: -10 }] }),
      plantilla()
    );
    const h = hs.find((x) => x.codigo === "VALOR_NEGATIVO");
    expect(h.nivel).toBe("advertencia");
  });

  test("un resultado vacío no se valida: es un período sin cargar", () => {
    for (const v of [null, undefined, ""]) {
      const hs = correr(
        evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: v }] }),
        plantilla()
      );
      expect(codigos(hs)).toEqual([]);
    }
  });
});

/* ================================================================== */
describe("configuración copiada que quedó vieja", () => {
  test("un esperado distinto del de la plantilla se avisa", () => {
    const hs = correr(
      evaluacion({
        metasResultados: [{ metaId: META_ID, nombre: "M", resultado: 96, esperado: 80 }],
      }),
      plantilla() // la plantilla dice 95
    );
    const h = hs.find((x) => x.codigo === "CONFIG_DIVERGENTE");
    expect(h.mensaje).toMatch(/esperado/);
    expect(h.efecto).toMatch(/se calcula con la configuración del objetivo/);
  });

  test("varios campos divergentes se listan juntos", () => {
    const hs = correr(
      evaluacion({
        metasResultados: [
          { metaId: META_ID, nombre: "M", resultado: 96, esperado: 80, operador: "<=" },
        ],
      }),
      plantilla()
    );
    const h = hs.find((x) => x.codigo === "CONFIG_DIVERGENTE");
    expect(h.mensaje).toMatch(/operador/);
    expect(h.mensaje).toMatch(/esperado/);
  });

  test("lo que la evaluación no trae no cuenta como divergencia", () => {
    const hs = correr(evaluacion(), plantilla());
    expect(codigos(hs)).not.toContain("CONFIG_DIVERGENTE");
  });

  // Un hito con el default del schema no está afirmando nada: nunca copió el
  // campo. Sin esta distinción la regla marcaba 1784 casos en el AF2025 de los
  // cuales 1761 eran `pesoMeta: null` contra el 100 de la plantilla.
  test("un campo con el default del schema no es divergencia", () => {
    const pl = plantilla({
      metas: [{ _id: META_ID, nombre: "M", unidad: "Porcentual", pesoMeta: 100, umbralPeriodos: 12 }],
    });
    const hs = correr(
      evaluacion({
        metasResultados: [
          { metaId: META_ID, nombre: "M", resultado: 96, pesoMeta: null, umbralPeriodos: 0 },
        ],
      }),
      pl
    );
    expect(codigos(hs)).not.toContain("CONFIG_DIVERGENTE");
  });

  // CASO REAL: 47 hitos con reglaCierre "umbral_periodos" contra plantillas que
  // hoy dicen "promedio". Ahí sí alguien cambió el objetivo después de cargar.
  test("un valor explícito distinto del default sí es divergencia", () => {
    const hs = correr(
      evaluacion({
        metasResultados: [
          { metaId: META_ID, nombre: "M", resultado: 96, reglaCierre: "umbral_periodos" },
        ],
      }),
      plantilla() // la plantilla dice "promedio"
    );
    expect(codigos(hs)).toContain("CONFIG_DIVERGENTE");
  });

  test("reconoceEsfuerzo en false contra una plantilla en true también cuenta", () => {
    const pl = plantilla({
      metas: [{ _id: META_ID, nombre: "M", unidad: "Porcentual", esperado: 95, reconoceEsfuerzo: true }],
    });
    const hs = correr(
      evaluacion({
        metasResultados: [{ metaId: META_ID, nombre: "M", resultado: 96, reconoceEsfuerzo: false }],
      }),
      pl
    );
    expect(codigos(hs)).toContain("CONFIG_DIVERGENTE");
  });

  test("es advertencia, no error: la nota se calcula bien igual", () => {
    const hs = correr(
      evaluacion({ metasResultados: [{ metaId: META_ID, nombre: "M", resultado: 96, esperado: 1 }] }),
      plantilla()
    );
    expect(hs.every((h) => h.nivel === "advertencia")).toBe(true);
  });
});

/* ================================================================== */
describe("períodos futuros", () => {
  test("cargar Q3 en enero —antes de que termine— se avisa", () => {
    // AF2026: Q3 va de marzo a mayo de 2027. En enero todavía no pasó.
    const hs = correr(evaluacion({ periodo: "2026Q3" }), plantilla());
    const h = hs.find((x) => x.codigo === "PERIODO_FUTURO");
    expect(h).toBeDefined();
    expect(h.nivel).toBe("advertencia");
  });

  test("Q1, que ya terminó, no se avisa", () => {
    const hs = correr(evaluacion({ periodo: "2026Q1" }), plantilla());
    expect(codigos(hs)).not.toContain("PERIODO_FUTURO");
  });
});

/* ================================================================== */
describe("objetivo que ya no existe", () => {
  test("sin plantilla, es un dato huérfano y se corta ahí", () => {
    const hs = validarEvaluacion(evaluacion(), null, { ahora: AHORA });
    expect(codigos(hs)).toEqual(["PLANTILLA_INEXISTENTE"]);
  });
});

/* ================================================================== */
describe("revisión en lote", () => {
  const pl = plantilla();
  const porId = new Map([[String(pl._id), pl]]);

  test("cuenta y agrupa como el validador de objetivos", () => {
    const r = validarLoteEvaluaciones(
      [
        evaluacion({ _id: "1" }),
        evaluacion({ _id: "2", periodo: "2026M03" }),
        evaluacion({ _id: "3", periodo: "2026M04" }),
      ],
      porId,
      { ahora: AHORA }
    );
    expect(r.revisadas).toBe(3);
    expect(r.conHallazgos).toBe(2);
    expect(r.resumen[0]).toEqual({
      codigo: "PERIODO_FUERA_DE_CALENDARIO",
      nivel: "error",
      cantidad: 2,
    });
  });

  // El motor junta todos los hitos de un período y los promedia: dos
  // resultados para el mismo período hacen que ese período pese el doble.
  test("dos resultados del mismo período en el mismo objetivo: duplicado", () => {
    const r = validarLoteEvaluaciones(
      [evaluacion({ _id: "1" }), evaluacion({ _id: "2" })],
      porId,
      { ahora: AHORA }
    );
    expect(r.resumen.some((x) => x.codigo === "PERIODO_DUPLICADO")).toBe(true);
    expect(r.conErrores).toBe(1); // se marca el segundo, no los dos
  });

  test("el mismo período para otro empleado no es duplicado", () => {
    const r = validarLoteEvaluaciones(
      [evaluacion({ _id: "1" }), evaluacion({ _id: "2", empleado: "222222222222222222222222" })],
      porId,
      { ahora: AHORA }
    );
    expect(r.conHallazgos).toBe(0);
  });

  test("la fecha de ingreso se toma del mapa por empleado", () => {
    const r = validarLoteEvaluaciones([evaluacion()], porId, {
      ahora: AHORA,
      ingresoPorEmpleado: new Map([["111111111111111111111111", new Date(2027, 0, 10)]]),
    });
    expect(r.items[0].errores[0].codigo).toBe("PERIODO_PREVIO_AL_INGRESO");
  });

  test("una evaluación sin plantilla en el mapa se reporta como huérfana", () => {
    const r = validarLoteEvaluaciones([evaluacion({ plantillaId: "zzz" })], porId, { ahora: AHORA });
    expect(r.items[0].objetivo).toBe("(objetivo inexistente)");
    expect(r.items[0].errores[0].codigo).toBe("PLANTILLA_INEXISTENTE");
  });
});
