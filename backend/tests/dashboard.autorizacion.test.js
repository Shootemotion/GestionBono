// backend/tests/dashboard.autorizacion.test.js
//
// ¿Quién puede ver el dashboard de quién?
//
// Reemplaza a dashboard.controller.test.js, que venía fallando entero desde
// hacía meses por dos motivos: usaba `jest.mock` (CommonJS) dentro de un
// archivo ESM —de ahí el "require is not defined"— y pasaba "area123" como
// id, que el controller rechaza con 400 antes de llegar a mirar permisos.
// O sea: no probaba la autorización, aunque dijera que sí.
//
// Acá los ids son ObjectId de verdad y los modelos se mockean con
// `unstable_mockModule`, que es la forma de hacerlo en ESM. Lo que se verifica
// es solo el permiso: que un referente entre a lo suyo y rebote en lo ajeno.

import { jest } from "@jest/globals";
import mongoose from "mongoose";

const id = () => new mongoose.Types.ObjectId();
const AREA_PROPIA = id();
const AREA_AJENA = id();
const SECTOR_PROPIO = id();
const SECTOR_AJENO = id();
const EMPLEADO = id();

/**
 * Query encadenable de Mongoose.
 *
 * Los controllers escriben `.find(...).populate(...).lean()` y a veces
 * `.select(...).sort(...)`. El mock tiene que aguantar la cadena entera y
 * resolver al final, o el test falla por la forma de la llamada y no por lo
 * que se quiere probar.
 */
const query = (resultado) => {
  const q = {
    populate: () => q,
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: () => Promise.resolve(resultado),
    then: (res, rej) => Promise.resolve(resultado).then(res, rej),
  };
  return q;
};

const modelo = (over = {}) => ({
  default: {
    find: jest.fn(() => query([])),
    findById: jest.fn(() => query(null)),
    findOne: jest.fn(() => query(null)),
    countDocuments: jest.fn(() => Promise.resolve(0)),
    aggregate: jest.fn(() => Promise.resolve([])),
    ...over,
  },
});

// Los mocks tienen que declararse ANTES del import del módulo bajo test: en
// ESM el import se resuelve de una y ya no hay forma de interceptarlo.
jest.unstable_mockModule("../src/models/Empleado.model.js", () =>
  modelo({
    findById: jest.fn(() =>
      query({ _id: EMPLEADO, area: AREA_PROPIA, sector: SECTOR_PROPIO })
    ),
  })
);
jest.unstable_mockModule("../src/models/Area.model.js", () =>
  modelo({ findById: jest.fn(() => query({ _id: AREA_PROPIA, referentes: [] })) })
);
// El sector conoce su área: es lo que permite que un jefe de área entre a los
// sectores de su área sin figurar como referente de cada uno.
jest.unstable_mockModule("../src/models/Sector.model.js", () =>
  modelo({
    findById: jest.fn((buscado) =>
      query(
        String(buscado) === String(SECTOR_PROPIO)
          ? { _id: SECTOR_PROPIO, areaId: AREA_PROPIA, referentes: [] }
          : { _id: SECTOR_AJENO, areaId: AREA_AJENA, referentes: [] }
      )
    ),
  })
);
jest.unstable_mockModule("../src/models/Plantilla.model.js", () => modelo());
jest.unstable_mockModule("../src/models/OverrideObjetivo.model.js", () => modelo());
jest.unstable_mockModule("../src/models/Evaluacion.model.js", () => modelo());
jest.unstable_mockModule("../src/models/Feedback.model.js", () => modelo());
jest.unstable_mockModule("../src/models/Incidencia.model.js", () => modelo());

const { dashByArea, dashBySector, dashByEmpleado } = await import(
  "../src/controllers/dashboard.controller.js"
);

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.sendStatus = jest.fn(() => res);
  return res;
};

const req = (user, params = {}) => ({ user, params, query: {} });

/** ¿Respondió 403? Es lo único que distingue "no autorizado" de todo lo demás. */
const rechazado = (res) => res.status.mock.calls.some(([c]) => c === 403);

/* ================================================================== */
describe("acceso por área", () => {
  beforeEach(() => jest.clearAllMocks());

  test("el superadmin entra a cualquier área", async () => {
    const res = mockRes();
    await dashByArea(req({ isSuper: true }, { areaId: String(AREA_AJENA) }), res);
    expect(rechazado(res)).toBe(false);
  });

  test("dirección entra a cualquier área", async () => {
    const res = mockRes();
    await dashByArea(req({ rol: "directivo" }, { areaId: String(AREA_AJENA) }), res);
    expect(rechazado(res)).toBe(false);
  });

  test("RRHH entra a cualquier área", async () => {
    const res = mockRes();
    await dashByArea(req({ isRRHH: true }, { areaId: String(AREA_AJENA) }), res);
    expect(rechazado(res)).toBe(false);
  });

  test("el referente entra a su área", async () => {
    const res = mockRes();
    await dashByArea(
      req({ referenteAreas: [String(AREA_PROPIA)] }, { areaId: String(AREA_PROPIA) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });

  test("el referente NO entra a un área ajena", async () => {
    const res = mockRes();
    await dashByArea(
      req({ referenteAreas: [String(AREA_PROPIA)] }, { areaId: String(AREA_AJENA) }),
      res
    );
    expect(rechazado(res)).toBe(true);
  });

  test("quien no es referente de nada NO entra", async () => {
    const res = mockRes();
    await dashByArea(req({}, { areaId: String(AREA_PROPIA) }), res);
    expect(rechazado(res)).toBe(true);
  });

  test("un areaId que no es un ObjectId da 400, no 403", async () => {
    // La distinción importa: 400 es "ese id no existe" y 403 es "existe pero
    // no es tuyo". El test viejo mandaba "area123" y celebraba el rebote
    // creyendo que probaba permisos.
    const res = mockRes();
    await dashByArea(req({ referenteAreas: [] }, { areaId: "area123" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

/* ================================================================== */
describe("acceso por sector", () => {
  beforeEach(() => jest.clearAllMocks());

  test("el referente entra a su sector", async () => {
    const res = mockRes();
    await dashBySector(
      req({ referenteSectors: [String(SECTOR_PROPIO)] }, { sectorId: String(SECTOR_PROPIO) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });

  test("el referente NO entra a un sector ajeno", async () => {
    const res = mockRes();
    await dashBySector(
      req({ referenteSectors: [String(SECTOR_PROPIO)] }, { sectorId: String(SECTOR_AJENO) }),
      res
    );
    expect(rechazado(res)).toBe(true);
  });

  test("el superadmin entra a cualquier sector", async () => {
    const res = mockRes();
    await dashBySector(req({ isSuper: true }, { sectorId: String(SECTOR_AJENO) }), res);
    expect(rechazado(res)).toBe(false);
  });

  // Los 7 jefes de área de la empresa no figuran como referentes de ninguno de
  // sus sectores: la pertenencia es por el área. Validar solo `referenteSectors`
  // los dejaba sin ver a su propia gente.
  test("el jefe de área entra a los sectores de su área", async () => {
    const res = mockRes();
    await dashBySector(
      req({ referenteAreas: [String(AREA_PROPIA)] }, { sectorId: String(SECTOR_PROPIO) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });

  test("pero no a los sectores de otra área", async () => {
    const res = mockRes();
    await dashBySector(
      req({ referenteAreas: [String(AREA_PROPIA)] }, { sectorId: String(SECTOR_AJENO) }),
      res
    );
    expect(rechazado(res)).toBe(true);
  });

  test("quien no es referente de nada NO entra a ningún sector", async () => {
    const res = mockRes();
    await dashBySector(req({}, { sectorId: String(SECTOR_PROPIO) }), res);
    expect(rechazado(res)).toBe(true);
  });
});

/* ================================================================== */
describe("acceso a una persona", () => {
  beforeEach(() => jest.clearAllMocks());

  test("el referente del área entra al legajo de su gente", async () => {
    const res = mockRes();
    await dashByEmpleado(
      req({ referenteAreas: [String(AREA_PROPIA)] }, { empleadoId: String(EMPLEADO) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });

  test("el referente del sector también", async () => {
    const res = mockRes();
    await dashByEmpleado(
      req({ referenteSectors: [String(SECTOR_PROPIO)] }, { empleadoId: String(EMPLEADO) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });

  test("un referente de otra área NO entra", async () => {
    const res = mockRes();
    await dashByEmpleado(
      req(
        { referenteAreas: [String(AREA_AJENA)], referenteSectors: [String(SECTOR_AJENO)] },
        { empleadoId: String(EMPLEADO) }
      ),
      res
    );
    expect(rechazado(res)).toBe(true);
  });

  test("cada uno entra al suyo", async () => {
    const res = mockRes();
    await dashByEmpleado(
      req({ empleadoId: String(EMPLEADO) }, { empleadoId: String(EMPLEADO) }),
      res
    );
    expect(rechazado(res)).toBe(false);
  });
});
