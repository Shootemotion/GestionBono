// backend/tests/riesgo.cierre.test.js
//
// El aviso de qué le pasa a una nota cuando se cierre.
//
// Lo que estos tests cuidan sobre todo es que el aviso NO aparezca cuando no
// corresponde. Un cartel que sale siempre se ignora a la semana, y entonces
// no sirve para el caso en que de verdad importa.

import { riesgoDeCierre, riesgoDeObjetivo } from "../src/lib/riesgoDeCierre.ts";

/** Una meta que se evalúa igual en seguimiento y en cierre. */
const metaSimple = (over = {}) => ({
  _id: "m1",
  nombre: "Meta simple",
  unidad: "Porcentual",
  operador: ">=",
  esperado: 80,
  reconoceEsfuerzo: true,
  reglaCierre: "promedio",
  pesoMeta: 100,
  ...over,
});

const hito = (periodo, resultado, metaId = "m1") => ({
  periodo,
  metas: [{ metaId, resultado }],
});

const objetivo = (metas, hitos, over = {}) => ({
  _id: "o1",
  nombre: "Objetivo de prueba",
  peso: 100,
  metas,
  hitos,
  ...over,
});

/* ================================================================== */
describe("cuándo NO hay que avisar", () => {
  test("una meta de promedio que reconoce esfuerzo no cambia al cerrar", () => {
    const o = objetivo([metaSimple()], [hito("2026M09", 90), hito("2026M10", 85)]);
    expect(riesgoDeObjetivo(o)).toBeNull();
  });

  test("un objetivo sin datos cargados no avisa nada", () => {
    expect(riesgoDeObjetivo(objetivo([metaSimple()], []))).toBeNull();
  });

  test("una meta de umbral YA alcanzado no avisa", () => {
    const m = metaSimple({ reglaCierre: "umbral_periodos", umbralPeriodos: 2, reconoceEsfuerzo: false });
    const o = objetivo([m], [hito("2026M09", 90), hito("2026M10", 95)]);
    expect(riesgoDeObjetivo(o)).toBeNull();
  });

  test("un umbral que SÍ reconoce esfuerzo puntúa igual en los dos modos", () => {
    const m = metaSimple({ reglaCierre: "umbral_periodos", umbralPeriodos: 3, reconoceEsfuerzo: true });
    const o = objetivo([m], [hito("2026M09", 90), hito("2026M10", 95), hito("2026M11", 50)]);
    expect(riesgoDeObjetivo(o)).toBeNull();
  });

  test("sin objetivos, no hay riesgo", () => {
    const r = riesgoDeCierre([]);
    expect(r.hayRiesgo).toBe(false);
    expect(r.impactoTotal).toBe(0);
  });
});

/* ================================================================== */
// CASO REAL: Guido Barretto. Una meta que pedía 12 períodos, llevaba 11
// cumplidos, mostraba 91,7% y al cerrar dio 0. Su nota pasó de 88,9 a 76,1.
describe("umbral de períodos sin alcanzar", () => {
  // Las dos condiciones juntas: el umbral marca cuántos hacen falta y
  // `reconoceEsfuerzo: false` hace que no llegar valga 0. Con el esfuerzo
  // reconocido, el umbral puntúa la proporción en los dos modos y no hay nada
  // que avisar.
  const m = metaSimple({ reglaCierre: "umbral_periodos", umbralPeriodos: 3, reconoceEsfuerzo: false });
  const o = objetivo([m], [hito("2026M09", 90), hito("2026M10", 95), hito("2026M11", 50)]);

  test("avisa que el número va a caer", () => {
    const r = riesgoDeObjetivo(o);
    expect(r).not.toBeNull();
    expect(r.metas).toHaveLength(1);
    expect(r.metas[0].cierre).toBe(0);
    expect(r.metas[0].seguimiento).toBeGreaterThan(0);
  });

  test("dice cuántos lleva cumplidos y cuántos cargados", () => {
    const r = riesgoDeObjetivo(o);
    // 2 cumplidos (90 y 95 pasan los 80), 3 cargados.
    expect(r.metas[0].motivo).toMatch(/lleva 2 cumplido/);
    expect(r.metas[0].motivo).toMatch(/de 3 cargado/);
  });

  test("y qué falta para que no caiga", () => {
    const r = riesgoDeObjetivo(o);
    expect(r.metas[0].queFalta).toMatch(/Falta[n]? 1 período/);
  });

  // La distinción que hace accionable el aviso: cargar un período no es
  // cumplirlo. Alguien puede tener los 12 cargados y 11 cumplidos.
  test("cargado no es lo mismo que cumplido", () => {
    const todosCargados = objetivo(
      [metaSimple({ reglaCierre: "umbral_periodos", umbralPeriodos: 3, reconoceEsfuerzo: false })],
      [hito("2026M09", 90), hito("2026M10", 95), hito("2026M11", 10)]
    );
    const r = riesgoDeObjetivo(todosCargados);
    expect(r.metas[0].motivo).toMatch(/lleva 2 cumplido\(s\) de 3 cargado\(s\)/);
  });
});

/* ================================================================== */
describe("todo o nada", () => {
  const m = metaSimple({ reconoceEsfuerzo: false });
  const o = objetivo([m], [hito("2026M09", 60), hito("2026M10", 70)]);

  test("avisa que el avance parcial no va a quedar", () => {
    const r = riesgoDeObjetivo(o);
    expect(r.metas[0].cierre).toBe(0);
    expect(r.metas[0].motivo).toMatch(/no reconoce el esfuerzo parcial/);
  });

  test("si alcanza el objetivo, no avisa", () => {
    const ok = objetivo([m], [hito("2026M09", 90), hito("2026M10", 95)]);
    expect(riesgoDeObjetivo(ok)).toBeNull();
  });
});

/* ================================================================== */
// El número que importa no es cuánto cae la meta, sino cuánto mueve la nota.
// Una meta que se desploma dentro de un objetivo de peso 5 cambia 3,5 puntos,
// no 100.
describe("el impacto se mide en puntos de la nota final", () => {
  const m = metaSimple({ reconoceEsfuerzo: false });
  const hitos = [hito("2026M09", 60)];

  test("un objetivo de peso 100 que cae de 75 a 0 mueve 52,5 puntos", () => {
    // 60 sobre un esperado de 80: el seguimiento reconoce 75%, el cierre da 0.
    // 75 × (100/100) × 0,7 = 52,5 puntos de la nota final.
    const r = riesgoDeObjetivo(objetivo([m], hitos, { peso: 100 }));
    expect(r.impactoEnLaNota).toBeCloseTo(-52.5, 1);
  });

  test("el mismo derrumbe con peso 10 mueve la décima parte", () => {
    // Mismo desplome de la meta, un décimo del peso: 5,25 en vez de 52,5.
    const r = riesgoDeObjetivo(objetivo([m], hitos, { peso: 10 }));
    expect(r.impactoEnLaNota).toBeCloseTo(-5.25, 1);
  });

  test("el total suma el impacto de todos los objetivos", () => {
    const r = riesgoDeCierre([
      objetivo([m], hitos, { _id: "a", peso: 50 }),
      objetivo([m], hitos, { _id: "b", peso: 50 }),
    ]);
    expect(r.hayRiesgo).toBe(true);
    expect(r.objetivos).toHaveLength(2);
    expect(r.impactoTotal).toBeCloseTo(r.objetivos.reduce((s, o) => s + o.impactoEnLaNota, 0), 1);
  });

  test("lo que más impacta aparece primero", () => {
    const r = riesgoDeCierre([
      objetivo([m], hitos, { _id: "chico", peso: 10 }),
      objetivo([m], hitos, { _id: "grande", peso: 90 }),
    ]);
    expect(r.objetivos[0].objetivoId).toBe("grande");
  });
});

/* ================================================================== */
describe("metas binarias", () => {
  const m = metaSimple({
    unidad: "Cumple/No Cumple", reglaCierre: "umbral_periodos",
    umbralPeriodos: 3, reconoceEsfuerzo: false,
  });

  test("cuenta los períodos tildados como cumplidos", () => {
    const o = objetivo([m], [hito("2026M09", true), hito("2026M10", true), hito("2026M11", false)]);
    const r = riesgoDeObjetivo(o);
    expect(r.metas[0].motivo).toMatch(/lleva 2 cumplido/);
  });
});
