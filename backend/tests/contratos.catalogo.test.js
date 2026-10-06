// backend/tests/contratos.catalogo.test.js
//
// El catálogo de contratos tiene un problema típico: se escribe con entusiasmo
// y seis meses después la mitad de las entradas dicen "pendiente", o describen
// un guard que alguien sacó. Estos tests cuidan que eso se note enseguida.
//
// No verifican los datos —eso lo hace `npm run contratos`— sino que cada
// contrato esté bien formado y diga la verdad sobre sí mismo.

import { CONTRATOS, CAPA, SEVERIDAD, porId } from "../src/contratos/catalogo.js";
import { generarMarkdown } from "../src/contratos/documento.js";

describe("forma del catálogo", () => {
  test("hay contratos", () => {
    expect(CONTRATOS.length).toBeGreaterThan(0);
  });

  test("los ids son únicos", () => {
    const ids = CONTRATOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("los ids siguen el formato GRUPO-NN", () => {
    for (const c of CONTRATOS) {
      expect(c.id).toMatch(/^(OBJ|EVA|NOTA|TRZ|ACC)-\d{2}$/);
    }
  });

  test.each(CONTRATOS.map((c) => [c.id, c]))("%s está completo", (_id, c) => {
    expect(typeof c.titulo).toBe("string");
    expect(c.titulo.length).toBeGreaterThan(10);
    expect(typeof c.promesa).toBe("string");
    expect(typeof c.porque).toBe("string");
    expect(typeof c.seImpone).toBe("string");
    expect(typeof c.verificar).toBe("function");
    expect(Object.values(CAPA)).toContain(c.capa);
    expect(Object.values(SEVERIDAD)).toContain(c.severidad);
  });
});

describe("cada contrato dice por qué existe", () => {
  // El campo que sostiene todo lo demás. Un contrato sin el caso real que lo
  // motivó se discute en la primera reunión en que moleste, y se saca.
  test.each(CONTRATOS.map((c) => [c.id, c]))("%s cita un caso concreto", (_id, c) => {
    expect(c.porque.length).toBeGreaterThan(60);
    // Un caso concreto trae números, nombres o fechas; una buena intención no.
    expect(c.porque).toMatch(/\d/);
  });

  test.each(CONTRATOS.map((c) => [c.id, c]))("%s dice dónde se sostiene", (_id, c) => {
    expect(c.seImpone.length).toBeGreaterThan(20);
  });
});

describe("las promesas no se contradicen con la capa", () => {
  // Decir "el backend lo impide" cuando en realidad solo se revisa después es
  // la forma más fácil de que este catálogo deje de servir.
  test("un contrato de revisión no afirma que se impide", () => {
    for (const c of CONTRATOS.filter((x) => x.capa === CAPA.REVISION)) {
      expect(c.seImpone.toLowerCase()).toMatch(/no se bloquea|todavía no|se detecta|se muestra/);
    }
  });

  test("todo contrato crítico está impuesto o verificado por tests", () => {
    for (const c of CONTRATOS.filter((x) => x.severidad === SEVERIDAD.CRITICO)) {
      const cubierto = c.capa === CAPA.GUARD || !!c.verificadoPor;
      expect(cubierto).toBe(true);
    }
  });
});

describe("los verificadores se pueden ejecutar", () => {
  /** Contexto vacío: ningún verificador debería explotar con esto. */
  const vacio = {
    year: 2026,
    db: { collection: () => ({ countDocuments: async () => 1 }) },
    empleados: [],
    plantillas: [],
    plantillaPorId: new Map(),
    evaluaciones: [],
    feedbacks: [],
    feedbacksPorEmpleado: new Map(),
    dash: [],
    nombrePorEmpleado: new Map(),
    ingresoPorEmpleado: new Map(),
  };

  test.each(
    CONTRATOS.filter((c) => c.id !== "TRZ-02").map((c) => [c.id, c])
  )("%s sobre una base vacía no rompe y no inventa violaciones", async (_id, c) => {
    const r = await c.verificar(vacio);
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(0);
  });

  test("las violaciones traen qué y detalle", async () => {
    // OBJ-04: pesos que no suman 100.
    const ctx = {
      ...vacio,
      dash: [{ empleado: { _id: "e1" }, objetivos: { items: [{ peso: 50 }, { peso: 120 }] } }],
      nombrePorEmpleado: new Map([["e1", "Prueba, Persona"]]),
    };
    const r = await porId("OBJ-04").verificar(ctx);
    expect(r).toHaveLength(1);
    expect(r[0].que).toBe("Prueba, Persona");
    expect(r[0].detalle).toMatch(/170/);
  });

  test("un objetivo con configuración imposible se detecta", async () => {
    const ctx = {
      ...vacio,
      plantillas: [
        {
          _id: "p1",
          tipo: "objetivo",
          year: 2026,
          nombre: "Objetivo roto",
          frecuencia: "trimestral",
          pesoBase: 100,
          metas: [
            { _id: "m1", nombre: "M", unidad: "Porcentual", operador: ">=", esperado: 95,
              reglaCierre: "umbral_periodos", umbralPeriodos: 9 },
          ],
        },
      ],
    };
    const r = await porId("OBJ-03").verificar(ctx);
    expect(r).toHaveLength(1);
    expect(r[0].detalle).toMatch(/UMBRAL_IMPOSIBLE/);
  });

  test("un duplicado dentro del mismo alcance se detecta", async () => {
    const base = { tipo: "objetivo", year: 2026, scopeType: "sector", scopeId: "s1", nombre: "Mismo" };
    const ctx = { ...vacio, plantillas: [{ ...base, _id: "a" }, { ...base, _id: "b" }] };
    const r = await porId("OBJ-02").verificar(ctx);
    expect(r).toHaveLength(1);
  });

  test("el mismo nombre en otro alcance NO es duplicado", async () => {
    const base = { tipo: "objetivo", year: 2026, scopeType: "sector", nombre: "Mismo" };
    const ctx = {
      ...vacio,
      plantillas: [{ ...base, _id: "a", scopeId: "s1" }, { ...base, _id: "b", scopeId: "s2" }],
    };
    expect(await porId("OBJ-02").verificar(ctx)).toHaveLength(0);
  });
});

describe("el documento sale del catálogo", () => {
  const md = generarMarkdown();

  test("menciona todos los contratos", () => {
    for (const c of CONTRATOS) {
      expect(md).toContain(c.id);
      expect(md).toContain(c.titulo);
    }
  });

  test("trae el por qué de cada uno, que es lo que lo sostiene", () => {
    for (const c of CONTRATOS) expect(md).toContain(c.porque);
  });

  test("avisa que no se edita a mano", () => {
    expect(md).toMatch(/No editar a mano/);
  });
});
