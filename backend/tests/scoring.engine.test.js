/**
 * Tests del motor de scoring — scoreEngineUnified.js + calculoMetas.js
 *
 * Cubre los caminos más críticos del sistema de cálculo de desempeño:
 *  1. calculatePeriodCompliance — lógica de cumplimiento por período
 *  2. calculateMetaScore        — agregación de hitos a score de meta
 *  3. calculateObjectiveProgress— score ponderado multi-meta
 *  4. calcularScorePeriodoMeta  — lógica de calculoMetas (binario, proporcional, minimización)
 *  5. calcularResultadoMeta     — cierre anual con reglas (promedio, umbral, cierre_unico)
 *
 * Para correr: cd backend && npm test
 */

import {
  calculatePeriodCompliance,
  calculateMetaScore,
  calculateObjectiveProgress,
} from '../src/lib/scoreEngineUnified.js';

import {
  calcularScorePeriodoMeta,
  calcularResultadoMeta,
  normalizarConfigMeta,
} from '../src/lib/calculoMetas.js';

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — calculatePeriodCompliance
// ─────────────────────────────────────────────────────────────────────────────
describe('calculatePeriodCompliance', () => {
  const base = { reconoceEsfuerzo: true, permiteOver: false, tolerancia: 0, operador: '>=' };

  test('score 100% cuando actual === target exacto', () => {
    expect(calculatePeriodCompliance(80, 80, base)).toBe(100);
  });

  test('score proporcional cuando actual < target (reconoceEsfuerzo=true)', () => {
    const score = calculatePeriodCompliance(60, 80, base);
    expect(score).toBeCloseTo(75, 1); // 60/80 * 100 = 75
  });

  test('score 0 cuando actual < target y reconoceEsfuerzo=false', () => {
    const cfg = { ...base, reconoceEsfuerzo: false };
    expect(calculatePeriodCompliance(60, 80, cfg)).toBe(0);
  });

  test('score clampeado a 100 cuando actual > target y permiteOver=false', () => {
    const score = calculatePeriodCompliance(120, 80, base);
    expect(score).toBe(100);
  });

  test('score > 100 permitido cuando permiteOver=true', () => {
    const cfg = { ...base, permiteOver: true };
    const score = calculatePeriodCompliance(120, 80, cfg);
    expect(score).toBeGreaterThan(100);
  });

  test('tolerancia: 78 sobre target 80 con tol=2 debe pasar (>=)', () => {
    const cfg = { ...base, tolerancia: 2 };
    // (78 >= 80 - 2) → pasa
    expect(calculatePeriodCompliance(78, 80, cfg)).toBeGreaterThan(0);
  });

  test('operador <= (minimización): actual bajo target es bueno', () => {
    const cfg = { ...base, operador: '<=' };
    const score = calculatePeriodCompliance(50, 80, cfg);
    // tgt/act * 100 = 80/50 * 100 = 160 → clamped a 100
    expect(score).toBe(100);
  });

  test('retorna null si actual es null', () => {
    expect(calculatePeriodCompliance(null, 80, base)).toBeNull();
  });

  test('target 0 con actual 0: cumple → 100', () => {
    expect(calculatePeriodCompliance(0, 0, base)).toBe(100);
  });

  test('maneja strings numéricos (ej. "75,5" con coma decimal)', () => {
    const score = calculatePeriodCompliance('75,5', 80, base);
    expect(score).toBeCloseTo(94.4, 1); // 75.5/80 * 100
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — calculateMetaScore (promedio de períodos)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateMetaScore — regla promedio', () => {
  const metaDef = {
    _id: 'meta1',
    esperado: 100,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
    reglaCierre: 'promedio',
    acumulativa: false,
    modoAcumulacion: 'periodo',
  };

  const makeHito = (periodo, resultado) => ({
    periodo,
    metas: [{ _id: 'meta1', resultado }],
  });

  test('sin hitos → score 0', () => {
    expect(calculateMetaScore(metaDef, [])).toBe(0);
  });

  test('un hito perfecto → score 100', () => {
    const hitos = [makeHito('Q1', 100)];
    expect(calculateMetaScore(metaDef, hitos)).toBe(100);
  });

  test('dos hitos: 100 y 50 → score promedio 75', () => {
    const hitos = [makeHito('Q1', 100), makeHito('Q2', 50)];
    expect(calculateMetaScore(metaDef, hitos)).toBeCloseTo(75, 1);
  });

  test('hitos con null se ignoran (no contabilizan)', () => {
    const hitos = [makeHito('Q1', 100), makeHito('Q2', null)];
    expect(calculateMetaScore(metaDef, hitos)).toBe(100);
  });

  test('modo acumulativo: suma los valores de todos los hitos', () => {
    const metaAcum = { ...metaDef, acumulativa: true, modoAcumulacion: 'acumulativo' };
    // Tres hitos con 30 cada uno → total 90 sobre esperado 100 → 90%
    const hitos = [makeHito('Q1', 30), makeHito('Q2', 30), makeHito('Q3', 30)];
    expect(calculateMetaScore(metaAcum, hitos)).toBeCloseTo(90, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — calculateMetaScore (regla umbral_periodos)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateMetaScore — regla umbral_periodos', () => {
  const metaUmbral = {
    _id: 'meta2',
    esperado: 80,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
    reglaCierre: 'umbral_periodos',
    acumulativa: false,
    umbralPeriodos: 2, // deben cumplirse al menos 2 de 3 períodos
  };

  const makeHito = (periodo, resultado) => ({
    periodo,
    metas: [{ _id: 'meta2', resultado }],
  });

  test('2 de 3 períodos cumplen umbral → score 100', () => {
    const hitos = [
      makeHito('Q1', 90), // cumple
      makeHito('Q2', 90), // cumple
      makeHito('Q3', 50), // no cumple
    ];
    expect(calculateMetaScore(metaUmbral, hitos)).toBe(100);
  });

  test('0 períodos cumplen → score 0 (sin esfuerzo)', () => {
    const meta = { ...metaUmbral, reconoceEsfuerzo: false };
    const hitos = [makeHito('Q1', 10), makeHito('Q2', 10)];
    expect(calculateMetaScore(meta, hitos)).toBe(0);
  });

  test('1 de 2 requeridos con reconoceEsfuerzo → score 50', () => {
    const hitos = [
      makeHito('Q1', 90), // cumple
      makeHito('Q2', 10), // no cumple
    ];
    expect(calculateMetaScore(metaUmbral, hitos)).toBeCloseTo(50, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — calculateObjectiveProgress (multi-meta ponderada)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateObjectiveProgress', () => {
  const makeObjective = (metas, hitos) => ({ metas, hitos });

  const meta = (id, peso, esperado = 100) => ({
    _id: id,
    metaId: id,
    esperado,
    pesoMeta: peso,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
    reglaCierre: 'promedio',
    acumulativa: false,
  });

  test('dos metas con pesos iguales y scores diferentes → promedio ponderado', () => {
    const obj = makeObjective(
      [meta('m1', 50), meta('m2', 50)],
      [
        { periodo: 'Q1', metas: [{ _id: 'm1', resultado: 100 }, { _id: 'm2', resultado: 60 }] },
      ]
    );
    // m1 → 100, m2 → 60, promedio ponderado = (100*50 + 60*50) / 100 = 80
    expect(calculateObjectiveProgress(obj)).toBeCloseTo(80, 1);
  });

  test('sin metas, con hitos directos → promedio de actuals', () => {
    const obj = makeObjective([], [
      { periodo: 'Q1', actual: 60 },
      { periodo: 'Q2', actual: 80 },
    ]);
    expect(calculateObjectiveProgress(obj)).toBeCloseTo(70, 1);
  });

  test('objetivo perfecto (100% en todas las metas) → 100', () => {
    const obj = makeObjective(
      [meta('m1', 100)],
      [{ periodo: 'Q1', metas: [{ _id: 'm1', resultado: 100 }] }]
    );
    expect(calculateObjectiveProgress(obj)).toBe(100);
  });

  test('objetivo sin ningún dato → 0', () => {
    const obj = makeObjective([meta('m1', 100)], []);
    expect(calculateObjectiveProgress(obj)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — calcularScorePeriodoMeta (calculoMetas.js)
// ─────────────────────────────────────────────────────────────────────────────
describe('calcularScorePeriodoMeta', () => {
  const cfgBase = normalizarConfigMeta({
    unidad: 'Porcentual',
    esperado: 100,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
  });

  test('binario: true → score 100, cumple true', () => {
    const cfg = normalizarConfigMeta({ unidad: 'Cumple/No Cumple' });
    expect(calcularScorePeriodoMeta(cfg, true)).toEqual({ score: 100, cumple: true });
  });

  test('binario: false → score 0, cumple false', () => {
    const cfg = normalizarConfigMeta({ unidad: 'Cumple/No Cumple' });
    expect(calcularScorePeriodoMeta(cfg, false)).toEqual({ score: 0, cumple: false });
  });

  test('porcentual, valor = esperado → score 100', () => {
    const { score, cumple } = calcularScorePeriodoMeta(cfgBase, 100);
    expect(score).toBe(100);
    expect(cumple).toBe(true);
  });

  test('porcentual, valor < esperado → score proporcional', () => {
    const { score, cumple } = calcularScorePeriodoMeta(cfgBase, 70);
    expect(score).toBeCloseTo(70, 1);
    expect(cumple).toBe(false);
  });

  test('minimización (<=): valor menor que esperado → score > 100 (clamped)', () => {
    const cfg = normalizarConfigMeta({
      unidad: 'Numerico', esperado: 100, reconoceEsfuerzo: true, permiteOver: false, operador: '<=',
    });
    // 50 <= 100 → cumple, score = 100/50 * 100 = 200 → clamped a 100
    const { score, cumple } = calcularScorePeriodoMeta(cfg, 50);
    expect(score).toBe(100);
    expect(cumple).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — calcularResultadoMeta (cierre anual)
// ─────────────────────────────────────────────────────────────────────────────
describe('calcularResultadoMeta — regla cierre_unico', () => {
  const metaCfg = {
    unidad: 'Porcentual',
    esperado: 80,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
    reglaCierre: 'cierre_unico',
    modoAcumulacion: 'periodo',
  };

  test('usa solo el último período para el score final', () => {
    const registros = [
      { periodo: 'Q1', valor: 50 }, // 50/80 = 62.5%
      { periodo: 'Q2', valor: 80 }, // 80/80 = 100%
    ];
    const { scoreMeta } = calcularResultadoMeta(metaCfg, registros);
    // Debe usar Q2 (último) → 100%
    expect(scoreMeta).toBeCloseTo(100, 1);
  });

  test('sin registros → scoreMeta 0, cumpleGlobal false', () => {
    const { scoreMeta, cumpleGlobal } = calcularResultadoMeta(metaCfg, []);
    expect(scoreMeta).toBe(0);
    expect(cumpleGlobal).toBe(false);
  });
});

describe('calcularResultadoMeta — regla promedio', () => {
  const metaCfg = {
    unidad: 'Numerico',
    esperado: 100,
    reconoceEsfuerzo: true,
    permiteOver: false,
    tolerancia: 0,
    operador: '>=',
    reglaCierre: 'promedio',
    modoAcumulacion: 'periodo',
  };

  test('promedio de dos períodos iguales al 75% → scoreMeta 75', () => {
    const registros = [
      { periodo: 'Q1', valor: 75 },
      { periodo: 'Q2', valor: 75 },
    ];
    const { scoreMeta } = calcularResultadoMeta(metaCfg, registros);
    expect(scoreMeta).toBeCloseTo(75, 1);
  });

  test('modo acumulativo: acumula valores y promedia los scores por período', () => {
    const cfg = { ...metaCfg, modoAcumulacion: 'acumulativo' };
    const registros = [
      { periodo: 'Q1', valor: 40 },
      { periodo: 'Q2', valor: 40 },
      { periodo: 'Q3', valor: 20 },
    ];
    // El engine acumula: Q1=40, Q2=80, Q3=100 (total acumulado)
    // Con regla "promedio" y valorRepresentativo = (40+80+100)/3 = 73.33
    // score = 73.33/100 * 100 = 73.33
    // Nota: para score=100 con acumulativo se necesita cierre_unico (último hito = 100)
    const { scoreMeta } = calcularResultadoMeta(cfg, registros);
    expect(scoreMeta).toBeCloseTo(73.33, 1);
  });
});
