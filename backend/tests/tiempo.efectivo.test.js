// backend/tests/tiempo.efectivo.test.js
//
// Prorrateo de metas para quien no estuvo el ciclo completo.
//
// El caso que lo motivó: Olguin Oriana ingresó el 21/05/2026, mes 9 del AF2025.
// Tiene 2 de 16 períodos cargados —los otros 14 no existía en la empresa— y el
// sistema le calculó 87,8... perdón, 37,8. Ese número no mide su desempeño.
//
// Los cortes son los de la política de bonos, para que la empresa tenga una
// sola regla: 6 meses de mínimo, prorrateo entre 6 y 12, y licencias de más de
// 60 días descuentan.

import {
  mesesEnCiclo,
  diasLicenciaEnCiclo,
  tiempoEfectivo,
  prorratearMeta,
  prorratearObjetivo,
  aplicaProrrateo,
  MESES_MINIMOS,
  AF_PRORRATEO,
  periodosAplicables,
  esPeriodoAnteriorAlIngreso,
  mesFinDePeriodo,
} from "../src/lib/tiempoEfectivo.js";

describe("meses en el ciclo", () => {
  // El AF2025 va del 01/09/2025 al 31/08/2026.
  test("quien ya estaba tiene el ciclo completo", () => {
    expect(mesesEnCiclo("2020-03-15", 2025)).toBe(12);
    expect(mesesEnCiclo("2025-09-01", 2025)).toBe(12);
  });

  test("los casos reales del AF2025", () => {
    expect(mesesEnCiclo("2025-11-06", 2025)).toBe(10); // Meza Milagros
    expect(mesesEnCiclo("2025-12-04", 2025)).toBe(9);  // Steinbach Jenifer
    expect(mesesEnCiclo("2026-01-02", 2025)).toBe(8);  // Huenuleff Barbara
    expect(mesesEnCiclo("2026-02-05", 2025)).toBe(7);  // Navarro Wanda
    expect(mesesEnCiclo("2026-03-11", 2025)).toBe(6);  // Dikun Susana
    expect(mesesEnCiclo("2026-05-21", 2025)).toBe(4);  // Olguin Oriana
  });

  test("quien entra después del cierre no tiene ciclo", () => {
    expect(mesesEnCiclo("2026-10-01", 2025)).toBe(0);
  });

  test("sin fecha de ingreso se asume completo: un dato faltante no baja metas", () => {
    expect(mesesEnCiclo(null, 2025)).toBe(12);
    expect(mesesEnCiclo(undefined, 2025)).toBe(12);
    expect(mesesEnCiclo("no es una fecha", 2025)).toBe(12);
  });
});

describe("licencias", () => {
  const lic = (desde, hasta) => ({ tipo: "LICENCIA", fecha: desde, fechaHasta: hasta });

  test("suma los días de las licencias del ciclo", () => {
    expect(diasLicenciaEnCiclo([lic("2025-10-01", "2025-10-10")], 2025)).toBe(10);
  });

  test("recorta al ciclo: una licencia a caballo solo descuenta lo que cae adentro", () => {
    // Del 25/08/2025 al 05/09/2025: solo cuentan del 1 al 5 de septiembre.
    expect(diasLicenciaEnCiclo([lic("2025-08-25", "2025-09-05")], 2025)).toBe(5);
  });

  test("ignora las incidencias que no son licencia", () => {
    expect(diasLicenciaEnCiclo([{ tipo: "SANCION", fecha: "2025-10-01" }], 2025)).toBe(0);
  });

  test("una licencia sin fecha de fin no se puede medir y no descuenta", () => {
    expect(diasLicenciaEnCiclo([{ tipo: "LICENCIA", fecha: "2025-10-01" }], 2025)).toBe(0);
  });
});

describe("tiempo efectivo", () => {
  test("ciclo completo sin licencias", () => {
    const t = tiempoEfectivo({ fechaIngreso: "2020-01-01", anioFiscal: 2025 });
    expect(t.meses).toBe(12);
    expect(t.parcial).toBe(false);
    expect(t.prorratea).toBe(false);
    expect(t.motivo).toBeNull();
  });

  test("Olguin Oriana: 4 meses, queda por debajo del mínimo", () => {
    const t = tiempoEfectivo({ fechaIngreso: "2026-05-21", anioFiscal: 2025 });
    expect(t.meses).toBe(4);
    expect(t.parcial).toBe(true);
    expect(t.prorratea).toBe(true);
    expect(t.motivo).toMatch(/ingresó durante el ciclo/);
  });

  test("Dikun Susana: 6 meses, justo en el mínimo — NO es parcial", () => {
    const t = tiempoEfectivo({ fechaIngreso: "2026-03-11", anioFiscal: 2025 });
    expect(t.meses).toBe(MESES_MINIMOS);
    expect(t.parcial).toBe(false);
    expect(t.prorratea).toBe(true);
  });

  test("una licencia corta no descuenta: el tope son 60 días", () => {
    const t = tiempoEfectivo({
      fechaIngreso: "2020-01-01",
      incidencias: [{ tipo: "LICENCIA", fecha: "2025-10-01", fechaHasta: "2025-11-10" }], // 41 días
      anioFiscal: 2025,
    });
    expect(t.meses).toBe(12);
    expect(t.prorratea).toBe(false);
  });

  test("una licencia larga sí descuenta", () => {
    const t = tiempoEfectivo({
      fechaIngreso: "2020-01-01",
      incidencias: [{ tipo: "LICENCIA", fecha: "2025-10-01", fechaHasta: "2026-01-31" }], // 123 días
      anioFiscal: 2025,
    });
    expect(t.meses).toBeLessThan(12);
    expect(t.motivo).toMatch(/días de licencia/);
  });
});

describe("prorrateo de metas", () => {
  const umbral = { nombre: "m", reglaCierre: "umbral_periodos", umbralPeriodos: 12, reconoceEsfuerzo: false };
  const acum = { nombre: "m", acumulativa: true, esperado: 50, reglaCierre: "promedio" };
  const prom = { nombre: "m", reglaCierre: "promedio", esperado: 80 };

  test("el umbral se ajusta a los meses trabajados", () => {
    // Pedirle 12 períodos a quien trabajó 7 es imposible por definición.
    expect(prorratearMeta(umbral, 7).umbralPeriodos).toBe(7);
    expect(prorratearMeta(umbral, 6).umbralPeriodos).toBe(6);
    expect(prorratearMeta(umbral, 4).umbralPeriodos).toBe(4);
  });

  test("el umbral nunca baja de 1", () => {
    expect(prorratearMeta({ ...umbral, umbralPeriodos: 3 }, 1).umbralPeriodos).toBe(1);
  });

  test("la meta acumulativa escala su objetivo", () => {
    expect(prorratearMeta(acum, 6).esperado).toBe(25);
    expect(prorratearMeta(acum, 9).esperado).toBe(37.5);
  });

  test("la meta por promedio no se toca: ya promedia lo cargado", () => {
    expect(prorratearMeta(prom, 6)).toBe(prom);
  });

  test("con el ciclo completo no se toca nada", () => {
    expect(prorratearMeta(umbral, 12)).toBe(umbral);
    expect(prorratearMeta(acum, 12)).toBe(acum);
  });

  test("el ajuste queda declarado, para poder mostrarlo", () => {
    const p = prorratearMeta(umbral, 7);
    expect(p.prorrateo).toEqual({ campo: "umbralPeriodos", original: 12, ajustado: 7, meses: 7 });
  });

  test("no muta la meta original", () => {
    const copia = { ...umbral };
    prorratearMeta(umbral, 7);
    expect(umbral).toEqual(copia);
  });

  test("un objetivo entero se marca cuando alguna meta cambió", () => {
    const o = prorratearObjetivo({ nombre: "obj", metas: [umbral, prom] }, 7);
    expect(o.prorrateado).toBe(true);
    expect(o.metas[0].umbralPeriodos).toBe(7);
    expect(o.metas[1]).toBe(prom);
  });

  test("un objetivo sin metas prorrateables queda igual", () => {
    const orig = { nombre: "obj", metas: [prom] };
    expect(prorratearObjetivo(orig, 7)).toBe(orig);
  });
});

describe("períodos que le corresponden", () => {
  // El ciclo: Q1 sep-nov, Q2 dic-feb, Q3 mar-may, FINAL jun-ago.
  test("el ciclo completo son los cuatro", () => {
    expect(periodosAplicables(12)).toEqual(["Q1", "Q2", "Q3", "FINAL"]);
  });

  test("Dikun Susana: 6 meses (ingresó en marzo) -> los dos últimos", () => {
    expect(periodosAplicables(6)).toEqual(["Q3", "FINAL"]);
  });

  test("Steinbach: 9 meses (ingresó en diciembre) -> desde Q2", () => {
    expect(periodosAplicables(9)).toEqual(["Q2", "Q3", "FINAL"]);
  });

  test("Olguin: 4 meses (ingresó en mayo) -> Q3 alcanza a tocarlo", () => {
    expect(periodosAplicables(4)).toEqual(["Q3", "FINAL"]);
  });

  test("quien entra en el último trimestre solo tiene el FINAL", () => {
    expect(periodosAplicables(2)).toEqual(["FINAL"]);
  });

  test("quien no estuvo en el ciclo no tiene ninguno", () => {
    expect(periodosAplicables(0)).toEqual([]);
  });
});

describe("períodos anteriores al ingreso", () => {
  // Huenuleff ingresó el 02/01/2026: mes 5 del AF2025, le quedan 8 meses.
  const HUENULEFF = 8;

  test("un trimestre que terminó antes del ingreso se detecta", () => {
    // Q1 es sep-nov; ella entró en enero.
    expect(esPeriodoAnteriorAlIngreso("Q1", HUENULEFF)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2025Q1", HUENULEFF)).toBe(true);
  });

  test("un trimestre que la alcanza NO se marca", () => {
    // Q2 es dic-feb: enero cae adentro.
    expect(esPeriodoAnteriorAlIngreso("Q2", HUENULEFF)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso("FINAL", HUENULEFF)).toBe(false);
  });

  test("los meses también", () => {
    expect(esPeriodoAnteriorAlIngreso("2025M09", HUENULEFF)).toBe(true);  // septiembre
    expect(esPeriodoAnteriorAlIngreso("2025M12", HUENULEFF)).toBe(true);  // diciembre
    expect(esPeriodoAnteriorAlIngreso("2026M01", HUENULEFF)).toBe(false); // enero: entró
    expect(esPeriodoAnteriorAlIngreso("2026M05", HUENULEFF)).toBe(false);
  });

  test("quien estuvo el ciclo completo nunca tiene períodos previos", () => {
    for (const p of ["Q1", "2025M09", "FINAL"]) {
      expect(esPeriodoAnteriorAlIngreso(p, 12)).toBe(false);
    }
  });

  test("ante un formato desconocido no se acusa a nadie", () => {
    expect(esPeriodoAnteriorAlIngreso("cualquiera", 6)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso(null, 6)).toBe(false);
  });

  test("mesFinDePeriodo ubica el cierre de cada formato", () => {
    expect(mesFinDePeriodo("Q1")).toBe(3);
    expect(mesFinDePeriodo("FINAL")).toBe(12);
    expect(mesFinDePeriodo("2025M09")).toBe(1);
    expect(mesFinDePeriodo("2025M08")).toBe(12);
    expect(mesFinDePeriodo("2025S1")).toBe(6);
  });
});

describe("cero meses no es un ciclo incompleto", () => {
  test("quien no pertenece al año fiscal no se marca como parcial", () => {
    // Prevostini ingresó en septiembre de 2026: no estuvo en el AF2025.
    // Decirle "ciclo parcial" confundiría "no corresponde" con "estuvo poco".
    const t = tiempoEfectivo({ fechaIngreso: "2026-09-14", anioFiscal: 2025 });
    expect(t.meses).toBe(0);
    expect(t.incompleto).toBe(false);
    expect(t.parcial).toBe(false);
  });
});

describe("desde cuándo rige", () => {
  test("el AF2025 no se toca: sus notas ya se comunicaron", () => {
    expect(aplicaProrrateo(2025)).toBe(false);
  });

  test("rige desde el AF2026", () => {
    expect(aplicaProrrateo(AF_PRORRATEO)).toBe(true);
    expect(aplicaProrrateo(2027)).toBe(true);
  });
});

describe("bordes del borrado: dónde un error de un día borra lo que no", () => {
  // El AF2025 va del 01/09/2025 al 31/08/2026.
  // Trimestres: Q1 sep-nov, Q2 dic-feb, Q3 mar-may, FINAL jun-ago.
  const mesesPara = (fecha) => mesesEnCiclo(fecha, 2025);

  test("entra el PRIMER día del ciclo: no hay nada previo", () => {
    const m = mesesPara("2025-09-01");
    expect(m).toBe(12);
    for (const p of ["2025M09", "Q1", "FINAL"]) {
      expect(esPeriodoAnteriorAlIngreso(p, m)).toBe(false);
    }
  });

  test("entra el ÚLTIMO día de un mes: ese mes NO se borra", () => {
    // 30/11 cae dentro de noviembre, así que M11 le corresponde.
    const m = mesesPara("2025-11-30");
    expect(esPeriodoAnteriorAlIngreso("2025M11", m)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso("2025M10", m)).toBe(true);
  });

  test("entra el PRIMER día de un mes: el anterior sí se borra", () => {
    const m = mesesPara("2025-11-01");
    expect(esPeriodoAnteriorAlIngreso("2025M11", m)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso("2025M10", m)).toBe(true);
  });

  test("un trimestre a caballo del ingreso NO se borra", () => {
    // Entra el 02/01: Q2 va de diciembre a febrero, la toca. Q1 no.
    const m = mesesPara("2026-01-02");
    expect(esPeriodoAnteriorAlIngreso("Q2", m)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso("2025Q2", m)).toBe(false);
    expect(esPeriodoAnteriorAlIngreso("Q1", m)).toBe(true);
  });

  test("entra el último día del ciclo: solo le corresponde el FINAL", () => {
    const m = mesesPara("2026-08-31");
    expect(esPeriodoAnteriorAlIngreso("Q3", m)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("FINAL", m)).toBe(false);
  });

  test("entra DESPUÉS del ciclo: no se le borra nada de ese año", () => {
    // Prevostini entró en septiembre de 2026, o sea en el AF2026.
    // Para el AF2025 tiene 0 meses, y con 0 la función no marca nada:
    // no es que "todo es previo", es que ese año no le corresponde.
    const m = mesesPara("2026-09-14");
    expect(m).toBe(0);
    expect(esPeriodoAnteriorAlIngreso("Q1", m)).toBe(true);
  });

  test("sin fecha de ingreso NO se borra nada", () => {
    // Un dato faltante no puede disparar un borrado.
    const m = mesesPara(null);
    expect(m).toBe(12);
    for (const p of ["2025M09", "Q1", "2025Q1"]) {
      expect(esPeriodoAnteriorAlIngreso(p, m)).toBe(false);
    }
  });

  test("los casos reales que vamos a borrar, uno por uno", () => {
    // Huenuleff: 02/01/2026 -> se borran Q1 y los meses sep a dic.
    const hue = mesesPara("2026-01-02");
    expect(esPeriodoAnteriorAlIngreso("2025Q1", hue)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2025M12", hue)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2026M01", hue)).toBe(false);

    // Navarro: 05/02/2026 -> enero también se va, febrero no.
    const nav = mesesPara("2026-02-05");
    expect(esPeriodoAnteriorAlIngreso("2026M01", nav)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2026M02", nav)).toBe(false);

    // Steinbach: 04/12/2025 -> noviembre se va, diciembre no.
    const ste = mesesPara("2025-12-04");
    expect(esPeriodoAnteriorAlIngreso("2025M11", ste)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2025M12", ste)).toBe(false);

    // Meza: 06/11/2025 -> solo sep y oct.
    const mez = mesesPara("2025-11-06");
    expect(esPeriodoAnteriorAlIngreso("2025M09", mez)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2025M10", mez)).toBe(true);
    expect(esPeriodoAnteriorAlIngreso("2025M11", mez)).toBe(false);
  });
});
