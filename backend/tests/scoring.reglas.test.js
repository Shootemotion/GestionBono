// backend/tests/scoring.reglas.test.js
//
// Dos correcciones del motor que rigen DESDE EL AF2026, con los años anteriores
// intactos porque sus notas ya se comunicaron (ver AF_REGLAS_CORREGIDAS).
//
//   1. Se respeta siempre `reconoceEsfuerzo`. Antes, durante el año el motor lo
//      forzaba a true y recién al cerrar respetaba la configuración: la nota
//      SALTABA el último día. Guido Barretto cumplió 11 de los 12 meses que
//      exigía su meta, vio 91,7% todo el año y al cierre le quedó 0. Su pantalla
//      decía 88,9 y su feedback 76,1.
//
//   2. Un umbral con datos incompletos ya no da 100. Antes, si la meta pedía 12
//      períodos y había 6 cargados —todos cumplidos— devolvía 6/6 = 100%.
//      Cargar menos puntuaba mejor que cargar todo.

import { calculateMetaScore, AF_REGLAS_CORREGIDAS } from "../src/lib/scoringCore.js";

/** La meta de Guido: ≥300 mensajes, los 12 meses, todo o nada. */
const META_TODO_O_NADA = {
  _id: "m1",
  nombre: "Cantidad de mensajes respondidos",
  esperado: 300,
  operador: ">=",
  unidad: "Numerico",
  reglaCierre: "umbral_periodos",
  umbralPeriodos: 12,
  reconoceEsfuerzo: false,
  pesoMeta: 100,
  tolerancia: 0,
};

/** Hitos mensuales de un año fiscal, con los valores dados. */
const hitosDe = (anio, valores) =>
  valores.map((v, i) => {
    const mes = i < 4 ? 9 + i : i - 3; // sep..dic, luego ene..ago
    const anioCal = i < 4 ? anio : anio + 1;
    return {
      periodo: `${anioCal}M${String(mes).padStart(2, "0")}`,
      metas: [{ metaId: "m1", resultado: v }],
    };
  });

// Once meses cumplen, uno no: exactamente el caso Guido.
const ONCE_DE_DOCE = [562, 715, 604, 641, 604, 624, 691, 701, 497, 160, 300, 310];

describe("seguimiento y cierre son DOS cosas distintas, a propósito", () => {
  // Durante el año la pantalla acompaña el avance; al cerrar se aplica la regla
  // que configuró el jefe. `reconoceEsfuerzo` pertenece al cierre, no al
  // seguimiento: llegué a aplicarlo siempre y rompía el seguimiento —alguien que
  // cumplía TODOS los meses transcurridos veía 0 hasta diciembre—.
  test("durante el año se muestra avance sobre lo pedido", () => {
    const hitos = hitosDe(AF_REGLAS_CORREGIDAS, ONCE_DE_DOCE);
    // 11 cumplidos de los 12 que pide la meta.
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, false)).toBeCloseTo((11 / 12) * 100, 1);
  });

  test("el avance crece mes a mes, no arranca en cero", () => {
    // El punto del seguimiento: que acompañe el año en vez de castigarlo.
    const parciales = [1, 3, 6].map((n) =>
      calculateMetaScore(META_TODO_O_NADA, hitosDe(AF_REGLAS_CORREGIDAS, new Array(n).fill(500)), false)
    );
    expect(parciales).toEqual([
      expect.closeTo((1 / 12) * 100, 1),
      expect.closeTo((3 / 12) * 100, 1),
      expect.closeTo((6 / 12) * 100, 1),
    ]);
  });

  test("al cerrar se aplica la regla del jefe: todo o nada", () => {
    const hitos = hitosDe(AF_REGLAS_CORREGIDAS, ONCE_DE_DOCE);
    // 11 de 12 con "todo o nada" no suma. Es el caso Guido.
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, true)).toBe(0);
  });

  test("al cerrar, con el flag prendido, el esfuerzo parcial sí cuenta", () => {
    const meta = { ...META_TODO_O_NADA, reconoceEsfuerzo: true };
    const hitos = hitosDe(AF_REGLAS_CORREGIDAS, ONCE_DE_DOCE);
    expect(calculateMetaScore(meta, hitos, true)).toBeCloseTo((11 / 12) * 100, 1);
  });

  test("cumplir el umbral completo da 100 en los dos modos y en los dos años", () => {
    const todos = new Array(12).fill(500);
    for (const anio of [2025, AF_REGLAS_CORREGIDAS]) {
      const hitos = hitosDe(anio, todos);
      expect(calculateMetaScore(META_TODO_O_NADA, hitos, true)).toBe(100);
      expect(calculateMetaScore(META_TODO_O_NADA, hitos, false)).toBe(100);
    }
  });

  test("el AF2025 se comporta igual: esta regla nunca cambió", () => {
    const hitos = hitosDe(2025, ONCE_DE_DOCE);
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, false)).toBeCloseTo((11 / 12) * 100, 1);
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, true)).toBe(0);
  });
});

describe("un umbral con datos incompletos ya no da 100 (desde AF2026)", () => {
  // El caso de Verónica Oyarzo: la meta pide 12 períodos, hay 6 cargados, todos cumplen.
  const SEIS_DE_DOCE = [500, 500, 500, 500, 500, 500];

  test("AF2026: 6 de 12 cargados no es cumplir el umbral", () => {
    const hitos = hitosDe(AF_REGLAS_CORREGIDAS, SEIS_DE_DOCE);
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, true)).toBe(0);
  });

  test("AF2025 conserva el 100 con el que se calcularon esas notas", () => {
    const hitos = hitosDe(2025, SEIS_DE_DOCE);
    expect(calculateMetaScore(META_TODO_O_NADA, hitos, true)).toBe(100);
  });

  test("cargar TODO y fallar uno nunca puede puntuar menos que cargar la mitad", () => {
    // Era la contradicción de fondo: Oyarzo (6 de 12, todos bien) sacaba 100 y
    // Guido (12 de 12, uno mal) sacaba 0.
    const completoConUnaFalla = calculateMetaScore(
      META_TODO_O_NADA, hitosDe(AF_REGLAS_CORREGIDAS, ONCE_DE_DOCE), true
    );
    const incompleto = calculateMetaScore(
      META_TODO_O_NADA, hitosDe(AF_REGLAS_CORREGIDAS, SEIS_DE_DOCE), true
    );
    expect(incompleto).toBeLessThanOrEqual(completoConUnaFalla);
  });

  test("con esfuerzo reconocido, la proporción es sobre lo PEDIDO, no sobre lo cargado", () => {
    const meta = { ...META_TODO_O_NADA, reconoceEsfuerzo: true };
    const hitos = hitosDe(AF_REGLAS_CORREGIDAS, SEIS_DE_DOCE);
    // 6 cumplidos sobre 12 pedidos = 50%, no 6/6 = 100%.
    expect(calculateMetaScore(meta, hitos, true)).toBeCloseTo(50, 1);
  });
});
