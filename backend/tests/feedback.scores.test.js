// backend/tests/feedback.scores.test.js
//
// La nota del feedback se calculaba en el navegador y el servidor la guardaba
// sin mirarla. Por eso hay dos feedbacks CERRADOS con global 112 y 116,8.
//
// Estos casos fijan las dos cosas que ahora sí se revisan: que el puntaje esté
// dentro de la escala, y que el backend recorte los períodos igual que el
// front (si los dos no ordenan igual, calculan sobre datos distintos y todo lo
// demás sobra).

import { motivosFueraDeRango, getPeriodMonth, calcularScoresPeriodo } from "../src/lib/feedbackScores.js";

describe("control de rango", () => {
  test("una nota normal pasa", () => {
    expect(motivosFueraDeRango({ obj: 56, comp: 20.7, global: 76.7 })).toEqual([]);
  });

  test("el límite exacto pasa: 70 + 30 = 100", () => {
    expect(motivosFueraDeRango({ obj: 70, comp: 30, global: 100 })).toEqual([]);
  });

  test("rechaza los dos valores imposibles que están hoy en la base", () => {
    // Los dos son del registro "Ejemplo Empleado", en feedbacks CERRADOS.
    expect(motivosFueraDeRango({ obj: 82, comp: 30, global: 112 }).length).toBeGreaterThan(0);
    expect(motivosFueraDeRango({ obj: 98.2, comp: 18.6, global: 116.8 }).length).toBeGreaterThan(0);
  });

  test("objetivos no puede pasar de 70 — es el 70% del global", () => {
    expect(motivosFueraDeRango({ obj: 85, comp: 10, global: 95 }).join(" ")).toMatch(/objetivos no puede superar 70/);
  });

  test("competencias no puede pasar de 30", () => {
    expect(motivosFueraDeRango({ obj: 60, comp: 40, global: 100 }).join(" ")).toMatch(/competencias no puede superar 30/);
  });

  test("rechaza negativos", () => {
    expect(motivosFueraDeRango({ obj: -5, comp: 10, global: 5 }).join(" ")).toMatch(/no puede ser negativo/);
  });

  test("rechaza lo que no es número", () => {
    expect(motivosFueraDeRango({ obj: "ochenta", comp: 10, global: 90 }).join(" ")).toMatch(/no es un número/);
  });

  test("rechaza que no venga nada", () => {
    expect(motivosFueraDeRango(null).length).toBeGreaterThan(0);
    expect(motivosFueraDeRango(undefined).length).toBeGreaterThan(0);
  });

  test("un campo ausente no es un error: no todos los guardados traen los tres", () => {
    expect(motivosFueraDeRango({ global: 80 })).toEqual([]);
  });

  test("tolera medio punto por el redondeo de cada parte", () => {
    // obj y comp se redondean a un decimal por separado; su suma puede pasarse
    // unas décimas sin que la nota esté mal.
    expect(motivosFueraDeRango({ obj: 70.3, comp: 30.2, global: 100.4 })).toEqual([]);
    expect(motivosFueraDeRango({ obj: 71, comp: 30, global: 101 }).length).toBeGreaterThan(0);
  });
});

describe("getPeriodMonth ordena igual que el front", () => {
  test("los trimestres sueltos", () => {
    expect(getPeriodMonth("Q1")).toBe(3);
    expect(getPeriodMonth("Q2")).toBe(6);
    expect(getPeriodMonth("Q3")).toBe(9);
    expect(getPeriodMonth("FINAL")).toBe(12);
  });

  test("los trimestres con año adelante", () => {
    expect(getPeriodMonth("2025Q1")).toBe(3);
    expect(getPeriodMonth("2025Q4")).toBe(12);
  });

  test("los meses arrancan en septiembre", () => {
    expect(getPeriodMonth("2025M09")).toBe(1);  // septiembre = mes 1 del AF
    expect(getPeriodMonth("2025M12")).toBe(4);
    expect(getPeriodMonth("2025M01")).toBe(5);  // enero = mes 5
    expect(getPeriodMonth("2025M08")).toBe(12); // agosto = último
  });

  test("los semestres", () => {
    expect(getPeriodMonth("2025S1")).toBe(6);
    expect(getPeriodMonth("2025S2")).toBe(12);
  });

  test("no explota con basura", () => {
    expect(getPeriodMonth(null)).toBe(0);
    expect(getPeriodMonth("")).toBe(0);
  });
});

describe("cálculo de la nota", () => {
  const objetivo = (peso, resultado, periodo) => ({
    peso,
    metas: [{ _id: "m1", nombre: "meta", esperado: 100, operador: ">=", unidad: "Porcentual", pesoMeta: 100, reconoceEsfuerzo: true, reglaCierre: "promedio" }],
    hitos: [{ periodo, metas: [{ metaId: "m1", resultado }] }],
  });

  test("objetivos aportan hasta 70 y competencias hasta 30", () => {
    const data = {
      objetivos: { items: [objetivo(100, 100, "2025Q1")] },
      aptitudes: { items: [{ peso: 100, hitos: [{ periodo: "2025Q1", actual: 100 }] }] },
    };
    const r = calcularScoresPeriodo(data, "Q1");
    expect(r.obj).toBeCloseTo(70, 1);
    expect(r.comp).toBeCloseTo(30, 1);
    expect(r.global).toBeCloseTo(100, 1);
  });

  test("solo cuenta los períodos hasta el del feedback", () => {
    const data = {
      objetivos: {
        items: [{
          peso: 100,
          metas: [{ _id: "m1", nombre: "m", esperado: 100, operador: ">=", unidad: "Porcentual", pesoMeta: 100, reconoceEsfuerzo: true, reglaCierre: "promedio" }],
          hitos: [
            { periodo: "2025Q1", metas: [{ metaId: "m1", resultado: 0 }] },
            { periodo: "2025Q4", metas: [{ metaId: "m1", resultado: 100 }] },
          ],
        }],
      },
      aptitudes: { items: [] },
    };
    // En Q1 el resultado de Q4 todavía no existe para el cálculo.
    expect(calcularScoresPeriodo(data, "Q1").obj).toBeCloseTo(0, 1);
    // En el cierre anual entran los dos: promedio 50.
    expect(calcularScoresPeriodo(data, "FINAL").obj).toBeCloseTo(35, 1);
  });

  test("un objetivo sin datos en el período no arrastra la nota a cero", () => {
    const data = {
      objetivos: { items: [objetivo(50, 100, "2025Q1"), objetivo(50, 100, "2025Q4")] },
      aptitudes: { items: [] },
    };
    // En Q1 solo cuenta el primero: 100 x 50 / 100 x 0,7 = 35
    expect(calcularScoresPeriodo(data, "Q1").obj).toBeCloseTo(35, 1);
  });

  test("sin datos devuelve cero, no rompe", () => {
    expect(calcularScoresPeriodo({ objetivos: { items: [] }, aptitudes: { items: [] } }, "Q1"))
      .toEqual({ obj: 0, comp: 0, global: 0 });
    expect(calcularScoresPeriodo(null, "Q1")).toEqual({ obj: 0, comp: 0, global: 0 });
  });
});
