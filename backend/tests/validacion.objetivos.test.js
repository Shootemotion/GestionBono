// backend/tests/validacion.objetivos.test.js
//
// Cada test de acá es una configuración que EXISTE o EXISTIÓ en la base y que
// el motor interpreta distinto de como la leyó quien la cargó. Los casos con
// nombre y apellido están marcados: salieron de medir las 244 plantillas de
// objetivo antes de escribir las reglas.
//
// La prueba de fuego de cada regla es doble: que detecte el caso roto, y que
// NO moleste en el caso parecido que sí es legítimo. Una validación que grita
// de más se desactiva a la semana.

import {
  validarCoherenciaObjetivo,
  validarLote,
  cantidadDePeriodos,
  resumirErrores,
  AF_VALIDACION_ESTRICTA,
} from "../src/lib/validacionObjetivos.js";

/** Objetivo mínimo válido: sirve de base y no dispara ninguna regla. */
const objetivo = (over = {}) => ({
  tipo: "objetivo",
  year: AF_VALIDACION_ESTRICTA,
  nombre: "Objetivo de prueba",
  frecuencia: "trimestral",
  pesoBase: 25,
  metas: [meta()],
  ...over,
});

const meta = (over = {}) => ({
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  nombre: "Meta de prueba",
  unidad: "Porcentual",
  operador: ">=",
  esperado: 95,
  pesoMeta: 100,
  reconoceEsfuerzo: true,
  reglaCierre: "promedio",
  umbralPeriodos: 0,
  tolerancia: 0,
  ...over,
});

const codigos = (r) => [...r.errores, ...r.advertencias].map((h) => h.codigo);
const tieneError = (r, codigo) => r.errores.some((h) => h.codigo === codigo);

/* ================================================================== */
describe("el objetivo bien configurado no molesta a nadie", () => {
  test("no devuelve ni errores ni advertencias", () => {
    const r = validarCoherenciaObjetivo(objetivo());
    expect(r.errores).toEqual([]);
    expect(r.advertencias).toEqual([]);
  });

  test("una meta binaria por período tampoco", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ unidad: "Cumple/No Cumple", esperado: null, operador: ">=" })] })
    );
    expect(codigos(r)).toEqual([]);
  });
});

/* ================================================================== */
describe("umbral de períodos imposible de alcanzar", () => {
  // CASO REAL: "CCE: cumplimiento y aceptación de Controles de Calidad Externos",
  // AF2026, trimestral (4 períodos), umbral 9. Cinco plantillas activas.
  test("umbral 9 en un objetivo trimestral de 4 períodos es un error", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({
        frecuencia: "trimestral",
        metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 9 })],
      })
    );
    expect(tieneError(r, "UMBRAL_IMPOSIBLE")).toBe(true);
    expect(r.errores[0].mensaje).toMatch(/pide cumplir 9 períodos/);
    expect(r.errores[0].efecto).toMatch(/dar 0 todo el año/);
  });

  test("el mensaje dice cuántos períodos hay y cuál sería un umbral válido", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ frecuencia: "semestral", metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 5 })] })
    );
    expect(r.errores[0].mensaje).toMatch(/tiene 2/);
    expect(r.errores[0].efecto).toMatch(/umbral de 2 o menos/);
  });

  test("el mismo umbral en un objetivo mensual de 12 períodos es válido", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ frecuencia: "mensual", metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 9 })] })
    );
    expect(tieneError(r, "UMBRAL_IMPOSIBLE")).toBe(false);
  });

  test("umbral exactamente igual a la cantidad de períodos es válido", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ frecuencia: "trimestral", metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 4 })] })
    );
    expect(tieneError(r, "UMBRAL_IMPOSIBLE")).toBe(false);
  });

  // CASO REAL: "Brindar una atención de calidad y autónoma", AF2026.
  test("umbral en cero: la exigencia se movería sola con cada carga", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 0 })] })
    );
    expect(tieneError(r, "UMBRAL_SIN_VALOR")).toBe(true);
    expect(r.errores[0].efecto).toMatch(/cambia sola/);
  });

  test("la regla solo mira el umbral cuando el cierre es por umbral", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ reglaCierre: "promedio", umbralPeriodos: 99 })] })
    );
    expect(codigos(r)).toEqual([]);
  });
});

/* ================================================================== */
describe("metas que se cumplen solas", () => {
  // CASO REAL: 5 metas del AF2026, entre ellas "Ejecutar al menos el 98% de los
  // pagos dentro del calendario" y "Revisión integral de prestaciones en KERN".
  test("meta porcentual sin esperado y con '>=' da 100% siempre", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ esperado: null, operador: ">=" })] })
    );
    expect(tieneError(r, "SIN_ESPERADO")).toBe(true);
    expect(r.errores[0].efecto).toMatch(/cualquier valor cargado/i);
  });

  test("esperado 0 con '>=' también se cumple solo", () => {
    const r = validarCoherenciaObjetivo(objetivo({ metas: [meta({ esperado: 0, operador: ">=" })] }));
    expect(tieneError(r, "ESPERADO_CERO_SE_CUMPLE_SOLO")).toBe(true);
  });

  // CASO REAL: "Sostener una cantidad nula de quejas de pacientes", AF2026,
  // operador "==" y esperado 0. Está bien: pide exactamente cero quejas.
  test("esperado 0 con '==' es legítimo y no se marca", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ esperado: 0, operador: "==", unidad: "Numerico" })] })
    );
    expect(tieneError(r, "ESPERADO_CERO_SE_CUMPLE_SOLO")).toBe(false);
  });

  test("esperado 0 con '<=' también es legítimo", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ esperado: 0, operador: "<=", unidad: "Numerico" })] })
    );
    expect(tieneError(r, "ESPERADO_CERO_SE_CUMPLE_SOLO")).toBe(false);
  });

  test("meta binaria acumulativa sin esperado cuenta contra cero", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({
        metas: [meta({ unidad: "Cumple/No Cumple", acumulativa: true, esperado: null })],
      })
    );
    expect(tieneError(r, "BINARIA_ACUMULATIVA_SIN_ESPERADO")).toBe(true);
  });

  test("una meta binaria NO acumulativa sin esperado es normal", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ unidad: "Cumple/No Cumple", esperado: null })] })
    );
    expect(tieneError(r, "BINARIA_ACUMULATIVA_SIN_ESPERADO")).toBe(false);
  });
});

/* ================================================================== */
describe("configuración que el motor ignora", () => {
  // CASO REAL: 61 metas. El motor entra en la rama acumulativa antes de mirar
  // reglaCierre, así que "cierre_unico" ahí no hace nada.
  test("acumulativo con regla de cierre: advertencia, no error", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ acumulativa: true, reglaCierre: "cierre_unico" })] })
    );
    expect(r.errores).toEqual([]);
    expect(r.advertencias.some((h) => h.codigo === "ACUMULATIVO_IGNORA_REGLA")).toBe(true);
  });

  test("acumulativo con promedio no dice nada", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ acumulativa: true, reglaCierre: "promedio" })] })
    );
    expect(codigos(r)).toEqual([]);
  });

  test("binaria por período con esperado cargado avisa que no se usa", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ unidad: "Cumple/No Cumple", esperado: 10 })] })
    );
    expect(r.advertencias.some((h) => h.codigo === "BINARIA_CONFIG_INERTE")).toBe(true);
    expect(r.errores).toEqual([]);
  });

  test("permiteOver con operador de igualdad no sirve para nada", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ permiteOver: true, operador: "==", esperado: 50 })] })
    );
    expect(r.advertencias.some((h) => h.codigo === "PERMITE_OVER_CON_IGUALDAD")).toBe(true);
  });
});

/* ================================================================== */
describe("todo o nada: se avisa, no se bloquea", () => {
  // CASO REAL: 27 metas. Es la combinación que le dio 0 a Guido Barretto
  // después de cumplir 11 de 12 meses. Es legítima: el jefe la eligió.
  test("umbral + reconoceEsfuerzo falso es advertencia", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({
        frecuencia: "mensual",
        metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 12, reconoceEsfuerzo: false })],
      })
    );
    expect(r.errores).toEqual([]);
    const a = r.advertencias.find((h) => h.codigo === "UMBRAL_TODO_O_NADA");
    expect(a).toBeDefined();
    expect(a.efecto).toMatch(/menos uno vale lo mismo/);
  });

  test("y explica que el 0 aparece recién al cerrar", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 4, reconoceEsfuerzo: false })] })
    );
    expect(r.advertencias[0].efecto).toMatch(/recién al cerrar/);
  });
});

/* ================================================================== */
describe("pesos de las metas", () => {
  // CASO REAL: "Garantizar una atención precisa y con la información completa".
  test("algunas metas con peso y otras sin: error", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ pesoMeta: 70 }), meta({ pesoMeta: null }), meta({ pesoMeta: null })] })
    );
    expect(tieneError(r, "PESO_META_MEZCLADO")).toBe(true);
    expect(r.errores[0].mensaje).toMatch(/1 de 3 metas/);
  });

  // CASO REAL: "Lograr una Rentabilidad superior al 18%" suma 20.
  test("pesos que no suman 100: advertencia con la suma real", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ pesoMeta: 10 }), meta({ pesoMeta: 10 })] })
    );
    const a = r.advertencias.find((h) => h.codigo === "SUMA_PESO_METAS");
    expect(a.mensaje).toMatch(/suman 20%/);
  });

  test("ninguna meta con peso es válido: se reparten en partes iguales", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ pesoMeta: null }), meta({ pesoMeta: null })] })
    );
    expect(codigos(r)).toEqual([]);
  });

  test("99 por redondeo no se marca distinto de 20, pero tampoco bloquea", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ pesoMeta: 33 }), meta({ pesoMeta: 33 }), meta({ pesoMeta: 33 })] })
    );
    expect(r.errores).toEqual([]);
    expect(r.advertencias.some((h) => h.codigo === "SUMA_PESO_METAS")).toBe(true);
  });

  test("medio punto de diferencia se tolera", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({ metas: [meta({ pesoMeta: 50 }), meta({ pesoMeta: 49.7 })] })
    );
    expect(r.advertencias.some((h) => h.codigo === "SUMA_PESO_METAS")).toBe(false);
  });
});

/* ================================================================== */
describe("el objetivo en conjunto", () => {
  // CASO REAL: 13 objetivos sin metas en AF2025.
  test("sin metas: advertencia explicando el cálculo viejo", () => {
    const r = validarCoherenciaObjetivo(objetivo({ metas: [] }));
    const a = r.advertencias.find((h) => h.codigo === "SIN_METAS");
    expect(a.efecto).toMatch(/cálculo viejo/);
  });

  test("peso base en cero: advertencia", () => {
    const r = validarCoherenciaObjetivo(objetivo({ pesoBase: 0 }));
    expect(r.advertencias.some((h) => h.codigo === "PESO_BASE_CERO")).toBe(true);
  });

  test("tolerancia negativa: error", () => {
    const r = validarCoherenciaObjetivo(objetivo({ metas: [meta({ tolerancia: -5 })] }));
    expect(tieneError(r, "TOLERANCIA_NEGATIVA")).toBe(true);
  });

  test("la cantidad de períodos sale del calendario real, no de una tabla fija", () => {
    expect(cantidadDePeriodos({ year: 2026, frecuencia: "mensual" })).toBe(12);
    expect(cantidadDePeriodos({ year: 2026, frecuencia: "trimestral" })).toBe(4);
    expect(cantidadDePeriodos({ year: 2026, frecuencia: "semestral" })).toBe(2);
    expect(cantidadDePeriodos({ year: 2026, frecuencia: "anual" })).toBe(1);
  });

  test("una fecha de cierre adelantada recorta los períodos de verdad", () => {
    // Objetivo mensual que cierra el 30 de noviembre: 3 períodos, no 12.
    const recortado = {
      year: 2026,
      frecuencia: "mensual",
      fechaCierre: new Date(2026, 10, 30),
      fechaCierreCustom: true,
    };
    expect(cantidadDePeriodos(recortado)).toBe(3);

    // Y el umbral se compara contra esos 3, no contra los 12 del año completo.
    const r = validarCoherenciaObjetivo({
      ...objetivo({ ...recortado }),
      metas: [meta({ reglaCierre: "umbral_periodos", umbralPeriodos: 6 })],
    });
    expect(tieneError(r, "UMBRAL_IMPOSIBLE")).toBe(true);
  });
});

/* ================================================================== */
describe("desde cuándo bloquea", () => {
  const roto = objetivo({ metas: [meta({ esperado: null, operador: ">=" })] });

  test(`en AF${AF_VALIDACION_ESTRICTA} y posteriores, bloquea`, () => {
    const r = validarCoherenciaObjetivo({ ...roto, year: AF_VALIDACION_ESTRICTA });
    expect(r.estricto).toBe(true);
    expect(r.errores.length).toBe(1);
  });

  test("en años anteriores el mismo problema sale como advertencia", () => {
    const r = validarCoherenciaObjetivo({ ...roto, year: AF_VALIDACION_ESTRICTA - 1 });
    expect(r.estricto).toBe(false);
    expect(r.errores).toEqual([]);
    const a = r.advertencias.find((h) => h.codigo === "SIN_ESPERADO");
    expect(a.degradado).toBe(true);
  });

  test("no se puede guardar un AF2025 roto sin verlo, pero tampoco queda trabado", () => {
    // La diferencia con el año estricto: el hallazgo está, pero no corta.
    const viejo = validarCoherenciaObjetivo({ ...roto, year: 2025 });
    expect(viejo.advertencias.length).toBeGreaterThan(0);
    expect(viejo.errores).toEqual([]);
  });

  test("un objetivo sin año se trata como estricto", () => {
    const r = validarCoherenciaObjetivo({ ...roto, year: undefined });
    expect(r.estricto).toBe(true);
  });

  test("se puede forzar el modo estricto a mano", () => {
    const r = validarCoherenciaObjetivo({ ...roto, year: 2025 }, { estricto: true });
    expect(r.errores.length).toBe(1);
  });
});

/* ================================================================== */
describe("revisión en lote", () => {
  const lote = [
    { _id: "1", ...objetivo() },
    { _id: "2", ...objetivo({ metas: [meta({ esperado: null })] }) },
    { _id: "3", ...objetivo({ metas: [meta({ esperado: null })] }) },
    { _id: "4", ...objetivo({ metas: [meta({ acumulativa: true, reglaCierre: "cierre_unico" })] }) },
  ];

  test("cuenta revisadas, con hallazgos y con errores por separado", () => {
    const r = validarLote(lote);
    expect(r.revisadas).toBe(4);
    expect(r.conHallazgos).toBe(3); // el 1 está limpio
    expect(r.conErrores).toBe(2);   // el 4 solo tiene advertencia
  });

  test("el resumen agrupa por código y ordena por cantidad", () => {
    const r = validarLote(lote);
    expect(r.resumen[0]).toEqual({ codigo: "SIN_ESPERADO", nivel: "error", cantidad: 2 });
  });

  test("los items traen con qué objetivo identificarlo en pantalla", () => {
    const r = validarLote(lote);
    expect(r.items[0]).toMatchObject({ plantillaId: "2", nombre: "Objetivo de prueba", frecuencia: "trimestral" });
  });
});

/* ================================================================== */
describe("mensaje para el 400", () => {
  test("con un solo error, devuelve ese error", () => {
    const r = validarCoherenciaObjetivo(objetivo({ metas: [meta({ esperado: null })] }));
    expect(resumirErrores(r.errores, 2026)).toMatch(/no tiene valor esperado.*AF 2026\/27/);
  });

  test("con varios, cuenta cuántos son", () => {
    const r = validarCoherenciaObjetivo(
      objetivo({
        metas: [meta({ esperado: null }), meta({ tolerancia: -1, reglaCierre: "umbral_periodos", umbralPeriodos: 0 })],
      })
    );
    expect(resumirErrores(r.errores, 2026)).toMatch(/tiene \d+ problemas de configuración/);
  });

  test("sin errores, cadena vacía", () => {
    expect(resumirErrores([], 2026)).toBe("");
  });
});
