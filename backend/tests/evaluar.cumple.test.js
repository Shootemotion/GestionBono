// backend/tests/evaluar.cumple.test.js
//
// `src/lib/evaluarCumple.js` es lo que calcula el valor que SE GUARDA en cada
// hito cuando el jefe carga un resultado. Era una copia vieja del motor y
// pasó a ser un adaptador sobre scoringCore.
//
// Estos tests cuidan las dos cosas que importan: que el adaptador siga
// devolviendo lo mismo en los 1637 casos que no cambian, y que los 15 que sí
// cambian sean los que el motor viejo calculaba mal.
//
// Vive en backend/tests aunque el archivo sea del front, porque es donde está
// el corredor de tests. El import resuelve por ruta relativa.

import {
  calcularPorcentajeMeta,
  evaluarCumple,
  calcularResultadoGlobal,
} from "../../src/lib/evaluarCumple.js";

/* ================================================================== */
describe("lo que no cambia", () => {
  test("un porcentual que cumple vale 100", () => {
    expect(calcularPorcentajeMeta(95, 90, ">=", "Porcentual")).toBe(100);
  });

  test("sin reconocer esfuerzo, no llegar vale 0", () => {
    expect(calcularPorcentajeMeta(80, 90, ">=", "Porcentual", false, false)).toBe(0);
  });

  test("reconociendo esfuerzo, vale la proporción", () => {
    expect(calcularPorcentajeMeta(45, 90, ">=", "Porcentual", false, true)).toBe(50);
  });

  test("una meta Cumple/No Cumple vale 100 o 0, sin proporción", () => {
    expect(calcularPorcentajeMeta(true, 90, ">=", "Cumple/No Cumple")).toBe(100);
    expect(calcularPorcentajeMeta(false, 90, ">=", "Cumple/No Cumple")).toBe(0);
    expect(calcularPorcentajeMeta(1, null, ">=", "Cumple/No Cumple")).toBe(100);
    expect(calcularPorcentajeMeta(0, null, ">=", "Cumple/No Cumple")).toBe(0);
  });

  test("sin resultado cargado vale 0", () => {
    for (const v of [null, undefined, ""]) {
      expect(calcularPorcentajeMeta(v, 90, ">=", "Porcentual")).toBe(0);
    }
  });

  test("minimizar: estar por debajo cumple", () => {
    expect(calcularPorcentajeMeta(0.3, 0.5, "<", "Numerico", false, false)).toBe(100);
  });
});

/* ================================================================== */
// CASO REAL: 8 resultados en la base. Una meta de "% de avance == 100" con 15
// cargado valía 0 con el motor viejo. El avance parcial existe y vale 15.
describe("el operador de igualdad reconoce el avance", () => {
  test("cargar 15 sobre un objetivo de 100 vale 15, no 0", () => {
    expect(calcularPorcentajeMeta(15, 100, "==", "Porcentual", false, true)).toBe(15);
  });

  test("llegar al valor exacto vale 100", () => {
    expect(calcularPorcentajeMeta(100, 100, "==", "Porcentual", false, true)).toBe(100);
  });

  test("sin reconocer esfuerzo sigue siendo todo o nada", () => {
    expect(calcularPorcentajeMeta(15, 100, "==", "Porcentual", false, false)).toBe(0);
    expect(calcularPorcentajeMeta(100, 100, "==", "Porcentual", false, false)).toBe(100);
  });
});

/* ================================================================== */
// CASO REAL: 7 resultados. "% de errores < 0,5" con 0,5 cargado NO cumple
// —0,5 no es menor que 0,5— y el motor viejo le daba 100.
describe("minimizar sin reconocer esfuerzo es todo o nada", () => {
  test("el valor justo en el límite NO cumple", () => {
    expect(calcularPorcentajeMeta(0.5, 0.5, "<", "Numerico", false, false)).toBe(0);
  });

  test("con <= el mismo valor sí cumple", () => {
    expect(calcularPorcentajeMeta(0.5, 0.5, "<=", "Numerico", false, false)).toBe(100);
  });

  test("pasarse tampoco cumple", () => {
    expect(calcularPorcentajeMeta(0.8, 0.5, "<", "Numerico", false, false)).toBe(0);
  });
});

/* ================================================================== */
describe("tolerancia, que el motor viejo ignoraba", () => {
  test("con 2 de tolerancia, 88 cumple una meta de 90", () => {
    expect(calcularPorcentajeMeta(88, 90, ">=", "Porcentual", false, false, 2)).toBe(100);
  });

  test("sin tolerancia, el mismo valor no cumple", () => {
    expect(calcularPorcentajeMeta(88, 90, ">=", "Porcentual", false, false, 0)).toBe(0);
  });
});

/* ================================================================== */
describe("permiteOver", () => {
  test("sin permiteOver se corta en 100", () => {
    expect(calcularPorcentajeMeta(150, 100, ">=", "Porcentual", false, true)).toBe(100);
  });

  test("con permiteOver llega al tope del motor, no al infinito", () => {
    // El motor capa en maxOver (120 por defecto); el viejo no tenía tope.
    expect(calcularPorcentajeMeta(300, 100, ">=", "Porcentual", true, true)).toBe(120);
  });
});

/* ================================================================== */
describe("el cartelito de Cumple / No cumple", () => {
  test("dice que sí cuando llega", () => {
    expect(evaluarCumple(95, 90, ">=", "Porcentual")).toBe(true);
  });

  test("dice que no cuando falta", () => {
    expect(evaluarCumple(80, 90, ">=", "Porcentual")).toBe(false);
  });

  test("en una binaria mira el tilde", () => {
    expect(evaluarCumple(true, null, ">=", "Cumple/No Cumple")).toBe(true);
    expect(evaluarCumple(false, null, ">=", "Cumple/No Cumple")).toBe(false);
  });

  test("respeta la tolerancia", () => {
    expect(evaluarCumple(88, 90, ">=", "Porcentual", 2)).toBe(true);
  });
});

/* ================================================================== */
describe("el valor que se guarda en el hito", () => {
  const meta = (over = {}) => ({
    resultado: 100, esperado: 100, operador: ">=", unidad: "Porcentual",
    permiteOver: false, reconoceEsfuerzo: true, tolerancia: 0, peso: 1, ...over,
  });

  test("una sola meta cumplida da 100", () => {
    expect(calcularResultadoGlobal([meta()])).toBe(100);
  });

  test("dos metas del mismo peso se promedian", () => {
    expect(calcularResultadoGlobal([meta(), meta({ resultado: 50 })])).toBe(75);
  });

  test("pondera por el peso de cada meta", () => {
    // 100 con peso 3 y 0 con peso 1 → 75.
    const r = calcularResultadoGlobal([meta({ peso: 3 }), meta({ resultado: 0, peso: 1 })]);
    expect(r).toBe(75);
  });

  test("las metas sin cargar no cuentan en el promedio", () => {
    const r = calcularResultadoGlobal([meta(), meta({ resultado: null })]);
    expect(r).toBe(100);
  });

  test("sin metas da 0", () => {
    expect(calcularResultadoGlobal([])).toBe(0);
    expect(calcularResultadoGlobal(null)).toBe(0);
  });

  test("acepta pesoMeta además de peso", () => {
    const r = calcularResultadoGlobal([
      { ...meta(), peso: undefined, pesoMeta: 3 },
      { ...meta({ resultado: 0 }), peso: undefined, pesoMeta: 1 },
    ]);
    expect(r).toBe(75);
  });

  // CASO REAL medido en la base: un hito de 3 metas pasaba de 66,7 a 91,7
  // porque una de ellas usaba "==" con avance parcial.
  test("un hito con una meta de igualdad parcial sube", () => {
    const r = calcularResultadoGlobal([
      meta({ peso: 1 }),
      meta({ peso: 1 }),
      meta({ resultado: 75, esperado: 100, operador: "==", peso: 1 }),
    ]);
    expect(r).toBeCloseTo(91.7, 1);
  });
});
