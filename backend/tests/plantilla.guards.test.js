// backend/tests/plantilla.guards.test.js
//
// Estos tests describen el incidente del Área Técnica de septiembre de 2026
// convertido en casos. Cada bloque es una de las formas concretas en que se
// rompió la base; si alguno vuelve a pasar en verde sin querer, es que se
// volvió a abrir una puerta que ya habíamos cerrado.

import {
  sanitizarPlantilla,
  camposIgnorados,
  validarPlantilla,
  bloqueoPorAnioCerrado,
  normalizarNombre,
} from "../src/lib/plantillaGuards.js";
import { anioFiscalActual, anioFiscalCerrado, etiquetaAnioFiscal } from "../src/lib/fiscalYear.js";

const JEFE = { permisos: ["objetivos:ver", "objetivos:editar"] };
const RRHH = { permisos: ["objetivos:ver", "objetivos:editar", "objetivos:eliminar"] };

const AF_ACTUAL = anioFiscalActual();
const AF_CERRADO = AF_ACTUAL - 1;

/* ------------------------------------------------------------------ */
describe("año fiscal", () => {
  test("va de septiembre a agosto", () => {
    expect(anioFiscalActual(new Date(2026, 8, 1))).toBe(2026);  // 1 sep 2026
    expect(anioFiscalActual(new Date(2026, 7, 31))).toBe(2025); // 31 ago 2026
    expect(anioFiscalActual(new Date(2027, 0, 15))).toBe(2026); // enero 2027
  });

  test("un año está cerrado cuando ya empezó el siguiente", () => {
    const enSeptiembre2026 = new Date(2026, 8, 25);
    expect(anioFiscalCerrado(2025, enSeptiembre2026)).toBe(true);
    expect(anioFiscalCerrado(2026, enSeptiembre2026)).toBe(false);
  });

  test("la etiqueta cruza el cambio de siglo sin romperse", () => {
    expect(etiquetaAnioFiscal(2025)).toBe("AF 2025/26");
    expect(etiquetaAnioFiscal(1999)).toBe("AF 1999/00");
  });
});

/* ------------------------------------------------------------------ */
describe("lista blanca: el clon no puede heredar la identidad del original", () => {
  // Esto es literalmente lo que mandaba el front: `{ ...original, _id: undefined }`.
  const clonViejo = {
    tipo: "objetivo",
    year: 2025,
    scopeType: "sector",
    scopeId: "697112e1fb55f69820fa2a0a",
    nombre: "Participar activamente en el plan anual de capacitación",
    frecuencia: "trimestral",
    pesoBase: 30,
    createdAt: "2025-09-01T00:00:00.000Z",
    updatedAt: "2026-03-05T00:00:00.000Z",
    __v: 3,
    version: 4,
    parentPlantillaId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    estadoAprobacion: "pendiente",
    deletedAt: null,
    deletedBy: { email: "alguien@diagnos.com" },
    scopeRef: "Sector",
    fechaInicioFiscal: "2025-09-01T00:00:00.000Z",
    metas: [{ _id: "111111111111111111111111", nombre: "Asistencia", pesoMeta: 100 }],
  };

  test("descarta los sellos de tiempo, que eran lo que impedía reconstruir los hechos", () => {
    const limpio = sanitizarPlantilla(clonViejo);
    expect(limpio.createdAt).toBeUndefined();
    expect(limpio.updatedAt).toBeUndefined();
  });

  test("descarta los campos de versionado, que sólo maneja versionarPlantilla", () => {
    const limpio = sanitizarPlantilla(clonViejo);
    expect(limpio.version).toBeUndefined();
    expect(limpio.parentPlantillaId).toBeUndefined();
    expect(limpio.estadoAprobacion).toBeUndefined();
  });

  test("al CREAR, las metas nacen sin _id: dos objetivos no pueden compartir metas", () => {
    const limpio = sanitizarPlantilla(clonViejo, { conservarMetaIds: false });
    expect(limpio.metas[0]._id).toBeUndefined();
    expect(limpio.metas[0].nombre).toBe("Asistencia");
  });

  test("al EDITAR sí conserva el _id: es lo que ata los resultados ya cargados", () => {
    const limpio = sanitizarPlantilla(clonViejo, { conservarMetaIds: true });
    expect(limpio.metas[0]._id).toBe("111111111111111111111111");
  });

  test("deja pasar todo lo que sí es contenido del objetivo", () => {
    const limpio = sanitizarPlantilla(clonViejo);
    expect(limpio.nombre).toBe(clonViejo.nombre);
    expect(limpio.frecuencia).toBe("trimestral");
    expect(limpio.pesoBase).toBe(30);
    expect(limpio.scopeType).toBe("sector");
  });

  test("informa qué se descartó, para detectar pantallas viejas", () => {
    expect(camposIgnorados(clonViejo)).toEqual(
      expect.arrayContaining(["createdAt", "version", "estadoAprobacion", "scopeRef"])
    );
    expect(camposIgnorados({ nombre: "limpio" })).toEqual([]);
  });

  test("un campo inventado no llega a la base", () => {
    const limpio = sanitizarPlantilla({ nombre: "x", esAdmin: true, foo: "bar" });
    expect(limpio.esAdmin).toBeUndefined();
    expect(limpio.foo).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
describe("año cerrado", () => {
  test("un jefe no puede escribir sobre un ejercicio terminado", () => {
    const msg = bloqueoPorAnioCerrado(AF_CERRADO, JEFE);
    expect(msg).toContain("ya está cerrado");
    expect(msg).toContain(etiquetaAnioFiscal(AF_CERRADO));
  });

  test("RRHH sí puede: cerrar no es tapiar", () => {
    expect(bloqueoPorAnioCerrado(AF_CERRADO, RRHH)).toBeNull();
  });

  test("el año en curso no se bloquea para nadie", () => {
    expect(bloqueoPorAnioCerrado(AF_ACTUAL, JEFE)).toBeNull();
  });

  test("sin año no hay bloqueo: no es asunto de esta función inventarlo", () => {
    expect(bloqueoPorAnioCerrado(undefined, JEFE)).toBeNull();
    expect(bloqueoPorAnioCerrado(null, JEFE)).toBeNull();
  });

  test("un usuario sin permisos definidos no rompe", () => {
    expect(bloqueoPorAnioCerrado(AF_CERRADO, {})).toContain("ya está cerrado");
    expect(bloqueoPorAnioCerrado(AF_CERRADO, undefined)).toContain("ya está cerrado");
  });

  test("el superadmin no queda bloqueado por su propio guard", () => {
    // Su único permiso es "*". Con un `includes` plano no coincidía con nada
    // y el superadmin era el único que no podía tocar un año cerrado.
    expect(bloqueoPorAnioCerrado(AF_CERRADO, { permisos: ["*"] })).toBeNull();
    expect(bloqueoPorAnioCerrado(AF_CERRADO, { isSuper: true, permisos: [] })).toBeNull();
  });

  test("un comodín de familia también alcanza", () => {
    expect(bloqueoPorAnioCerrado(AF_CERRADO, { permisos: ["objetivos:*"] })).toBeNull();
    expect(bloqueoPorAnioCerrado(AF_CERRADO, { permisos: ["nomina:*"] })).toContain("ya está cerrado");
  });
});

/* ------------------------------------------------------------------ */
describe("validación de contenido", () => {
  const valido = {
    tipo: "objetivo",
    year: AF_ACTUAL,
    scopeType: "sector",
    scopeId: "697112e1fb55f69820fa2a0a",
    nombre: "Objetivo válido",
    frecuencia: "mensual",
    pesoBase: 30,
  };

  test("un alta correcta no tiene errores", () => {
    expect(validarPlantilla(valido, { esCreacion: true })).toEqual([]);
  });

  test("exige alcance real, no un string cualquiera", () => {
    const errs = validarPlantilla({ ...valido, scopeId: "no-es-un-id" }, { esCreacion: true });
    expect(errs.join(" ")).toContain("Falta indicar");
  });

  test("el peso vive entre 0 y 100", () => {
    expect(validarPlantilla({ ...valido, pesoBase: 150 }, { esCreacion: true }).join(" "))
      .toContain("entre 0 y 100");
    expect(validarPlantilla({ ...valido, pesoBase: -1 }, { esCreacion: true }).join(" "))
      .toContain("entre 0 y 100");
    expect(validarPlantilla({ ...valido, pesoBase: 0 }, { esCreacion: true })).toEqual([]);
    expect(validarPlantilla({ ...valido, pesoBase: 100 }, { esCreacion: true })).toEqual([]);
  });

  test("rechaza un año absurdo antes de que llegue a la base", () => {
    expect(validarPlantilla({ ...valido, year: 1999 }, { esCreacion: true }).join(" "))
      .toContain("fuera de rango");
    expect(validarPlantilla({ ...valido, year: AF_ACTUAL + 9 }, { esCreacion: true }).join(" "))
      .toContain("fuera de rango");
  });

  test("admite el año que viene: armar el próximo ejercicio es legítimo", () => {
    expect(validarPlantilla({ ...valido, year: AF_ACTUAL + 1 }, { esCreacion: true })).toEqual([]);
  });

  test("un nombre en blanco no cuenta como nombre", () => {
    expect(validarPlantilla({ ...valido, nombre: "   " }, { esCreacion: true }).join(" "))
      .toContain("no puede quedar vacío");
  });

  test("la frecuencia tiene que ser una de las cuatro", () => {
    expect(validarPlantilla({ ...valido, frecuencia: "quincenal" }, { esCreacion: true }).join(" "))
      .toContain("mensual, trimestral");
  });

  test("señala cuál de las metas está mal, no sólo que hay una mal", () => {
    const errs = validarPlantilla(
      { ...valido, metas: [{ nombre: "ok" }, { nombre: "" }, { nombre: "x", pesoMeta: 500 }] },
      { esCreacion: true }
    );
    expect(errs.join(" ")).toContain("La meta 2 no tiene nombre");
    expect(errs.join(" ")).toContain("El peso de la meta 3");
    expect(errs.join(" ")).not.toContain("meta 1");
  });

  test("al editar no exige los campos que el update ni siquiera acepta", () => {
    // updatePlantilla borra year/scope del body a propósito: pedirlos acá
    // haría imposible guardar un cambio de descripción.
    expect(validarPlantilla({ descripcion: "nueva" }, { esCreacion: false })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
describe("nombres iguales para un humano", () => {
  test("ignora mayúsculas y espacios de más", () => {
    expect(normalizarNombre("  Participar   ACTIVAMENTE  ")).toBe("participar activamente");
    expect(normalizarNombre("Liderazgo")).toBe(normalizarNombre("liderazgo "));
  });

  test("no confunde dos objetivos distintos", () => {
    expect(normalizarNombre("Control de stock")).not.toBe(normalizarNombre("Control de stock B"));
  });

  test("tolera nulos sin explotar", () => {
    expect(normalizarNombre(null)).toBe("");
    expect(normalizarNombre(undefined)).toBe("");
  });
});
