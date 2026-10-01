// backend/tests/backup.verificacion.test.js
//
// El 25/09/2026 quedó un backup de 195 KB sin firma de fin de archivo: el
// proceso murió escribiéndolo y dejó medio zip con nombre de backup bueno.
// Nadie lo notó porque nada lo abría nunca.
//
// Estos casos son ese archivo convertido en test. Si alguno se pone en verde
// sin querer, volvimos a tener backups que mienten.

import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import { verificarBackup } from "../scripts/backup.js";

let dir;

/** Arma un zip de verdad con los archivos que se le pasen. */
function armarZip(destino, archivos) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destino);
    const zip = archiver("zip", { zlib: { level: 9 } });
    out.on("close", resolve);
    out.on("error", reject);
    zip.on("error", reject);
    zip.pipe(out);
    for (const [nombre, contenido] of Object.entries(archivos)) {
      zip.append(contenido, { name: nombre });
    }
    zip.finalize();
  });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("verificarBackup", () => {
  test("un zip completo con colecciones es válido", async () => {
    const p = path.join(dir, "sano.zip");
    await armarZip(p, {
      "empleados.json": JSON.stringify([{ _id: "1", nombre: "Ana" }]),
      "plantillas.json": JSON.stringify([{ _id: "2" }]),
    });

    const r = verificarBackup(p);
    expect(r.valido).toBe(true);
    expect(r.colecciones).toBe(2);
    expect(r.motivo).toBeUndefined();
  });

  test("un zip truncado no es válido — este es el caso del 25/09", async () => {
    const completo = path.join(dir, "completo.zip");
    await armarZip(completo, {
      "empleados.json": JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ _id: String(i) }))),
    });

    // Se corta al 30%, como si el proceso hubiera muerto a mitad de escritura.
    const truncado = path.join(dir, "truncado.zip");
    const buf = fs.readFileSync(completo);
    fs.writeFileSync(truncado, buf.subarray(0, Math.floor(buf.length * 0.3)));

    const r = verificarBackup(truncado);
    expect(r.valido).toBe(false);
    expect(r.motivo).toMatch(/no se puede abrir/);
  });

  test("un zip vacío no pasa por backup", async () => {
    const p = path.join(dir, "vacio.zip");
    await armarZip(p, {});

    const r = verificarBackup(p);
    expect(r.valido).toBe(false);
    expect(r.motivo).toMatch(/ninguna colección/);
  });

  test("un zip cuyo JSON está cortado tampoco vale", async () => {
    // Abre bien como zip pero el contenido es basura: el caso peor, porque
    // el archivo parece sano hasta que hace falta de verdad.
    const p = path.join(dir, "json-roto.zip");
    await armarZip(p, {
      "empleados.json": '[{"_id":"1","nombre":"An',
    });

    const r = verificarBackup(p);
    expect(r.valido).toBe(false);
    expect(r.motivo).toMatch(/cortado o ilegible/);
  });

  test("un archivo que no existe no es válido y no explota", () => {
    const r = verificarBackup(path.join(dir, "no-existe.zip"));
    expect(r.valido).toBe(false);
    expect(r.motivo).toBe("no existe");
  });

  test("un archivo que no es un zip no es válido", () => {
    const p = path.join(dir, "texto.zip");
    fs.writeFileSync(p, "esto no es un zip");

    const r = verificarBackup(p);
    expect(r.valido).toBe(false);
  });

  test("cuenta solo los .json, no los archivos sueltos", async () => {
    const p = path.join(dir, "mixto.zip");
    await armarZip(p, {
      "empleados.json": "[]",
      "README.txt": "hola",
    });

    const r = verificarBackup(p);
    expect(r.valido).toBe(true);
    expect(r.colecciones).toBe(1);
  });
});
