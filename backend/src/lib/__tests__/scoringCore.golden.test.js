// Tests GOLDEN del motor unificado.
// Congelan la semántica acordada y garantizan que ambas entradas
// (scoringCore.calculateMetaScore y calculoMetas.calcularResultadoMeta) coinciden.
import { calculateMetaScore, calculateObjectiveProgress } from "../scoringCore.js";
import { calcularResultadoMeta } from "../calculoMetas.js";

const PERIODOS = ["2025Q1", "2025Q2", "2025Q3", "2025Q4"];
const hitosDe = (vals) =>
  PERIODOS.map((p, i) => ({ periodo: p, metas: [{ _id: "m", metaId: "m", resultado: vals[i] }] }));
const registrosDe = (vals) => PERIODOS.map((p, i) => ({ periodo: p, valor: vals[i] }));
const metaBase = (over = {}) => ({
  _id: "m", metaId: "m", nombre: "meta", unidad: "Porcentual",
  esperado: 80, operador: ">=", reconoceEsfuerzo: true, permiteOver: false,
  tolerancia: 0, modoAcumulacion: "periodo", reglaCierre: "promedio", umbralPeriodos: 0, pesoMeta: 100,
  ...over,
});

// [nombre, metaOverride, valores, esperadoScore]
const CASOS = [
  ["numérica promedio reconoce", {}, [60, 70, 80, 90], 93.75],
  ["numérica promedio estricto", { reconoceEsfuerzo: false }, [60, 70, 80, 90], 0],
  ["numérica acumulativa (suma vs objetivo)", { modoAcumulacion: "acumulativo", acumulativa: true }, [0, 0, 80, 100], 100],
  ["numérica cierre_unico", { reglaCierre: "cierre_unico" }, [50, 50, 50, 90], 100],
  ["umbral K=2 estricto, cumple 3", { reglaCierre: "umbral_periodos", umbralPeriodos: 2, reconoceEsfuerzo: false }, [90, 90, 50, 90], 100],
  ["umbral K=3 reconoce, cumple 1", { reglaCierre: "umbral_periodos", umbralPeriodos: 3, reconoceEsfuerzo: true }, [90, 50, 50, 50], 33.3],
  ["umbral K=3 estricto, cumple 1", { reglaCierre: "umbral_periodos", umbralPeriodos: 3, reconoceEsfuerzo: false }, [90, 50, 50, 50], 0],
  ["umbral K=2 permiteOver, cumple 4", { reglaCierre: "umbral_periodos", umbralPeriodos: 2, permiteOver: true, maxOver: 120 }, [90, 90, 90, 90], 120],
  ["binaria promedio, cumple 3 de 4", { unidad: "Cumple/No Cumple", esperado: 1 }, [1, 1, 0, 1], 75],
  ["binaria promedio, cumple 4 de 4", { unidad: "Cumple/No Cumple", esperado: 1 }, [1, 1, 1, 1], 100],
  ["binaria cierre_unico, último cumple", { unidad: "Cumple/No Cumple", esperado: 1, reglaCierre: "cierre_unico" }, [0, 0, 0, 1], 100],
];

describe("Motor unificado — spec golden", () => {
  test.each(CASOS)("%s", (_n, over, vals, esperado) => {
    const meta = metaBase(over);
    const score = calculateMetaScore(meta, hitosDe(vals), true);
    expect(score).toBeCloseTo(esperado, 1);
  });

  test.each(CASOS)("paridad front/back: %s", (_n, over, vals, _esp) => {
    const meta = metaBase(over);
    const front = calculateMetaScore(meta, hitosDe(vals), true);
    const back = calcularResultadoMeta(meta, registrosDe(vals)).scoreMeta;
    expect(back).toBeCloseTo(front, 1);
  });
});

describe("Objetivo — ponderación de metas", () => {
  test("promedio ponderado por pesoMeta", () => {
    const obj = {
      metas: [
        metaBase({ metaId: "a", _id: "a", pesoMeta: 70 }),
        metaBase({ metaId: "b", _id: "b", pesoMeta: 30, unidad: "Cumple/No Cumple", esperado: 1 }),
      ],
    };
    const hitos = PERIODOS.map((p, i) => ({
      periodo: p,
      metas: [
        { _id: "a", metaId: "a", resultado: [80, 80, 80, 80][i] }, // 100%
        { _id: "b", metaId: "b", resultado: [1, 1, 0, 1][i] }, // 75%
      ],
    }));
    const score = calculateObjectiveProgress(obj, hitos, true);
    // 0.7*100 + 0.3*75 = 92.5
    expect(score).toBeCloseTo(92.5, 1);
  });
});
