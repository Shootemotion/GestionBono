// backend/scripts/backup.js
//
// Backup diario de la base, a un zip con un JSON por colección.
//
// POR QUÉ ESTÁ ESCRITO ASÍ
// ------------------------
// El 25/09/2026 quedó un backup de 195 KB —contra 719 KB del día anterior—
// sin firma de fin de archivo: el proceso murió mientras lo escribía y dejó
// medio zip con nombre de backup bueno. Nadie lo notó porque el listado solo
// miraba nombre, tamaño y fecha, sin abrir nunca el archivo. Los días 26, 27
// y 28 directamente no hubo backup: `node-cron` solo dispara si el proceso
// está vivo a esa hora y no recupera las corridas perdidas.
//
// Resultado: cuatro días sin red, justo la semana en que estuvimos reparando
// datos apoyándonos en backups.
//
// Las tres reglas que salieron de eso:
//   1. Un archivo a medio escribir NUNCA puede llamarse como uno bueno.
//      Se escribe con extensión `.parcial` y recién se renombra al terminar.
//   2. Un backup no está hecho hasta que se abre y se cuenta lo que tiene.
//   3. Una corrida perdida se recupera sola al arrancar.

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';

// Load env if running standalone
dotenv.config({ path: '../.env' }); // try sibling
if (!process.env.MONGO_URI) dotenv.config(); // try current

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

/** Extensión mientras se escribe. Un `.parcial` no se confunde con un backup. */
const EXT_PARCIAL = '.parcial';

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Abre un zip de backup y dice qué tiene adentro.
 *
 * Es la única forma honesta de saber si un backup sirve: un archivo truncado
 * pesa, tiene fecha y nombre correcto, y solo se delata al intentar leerlo.
 *
 * @returns {{valido: boolean, colecciones: number, motivo?: string}}
 */
export function verificarBackup(zipPath) {
    try {
        if (!fs.existsSync(zipPath)) return { valido: false, colecciones: 0, motivo: 'no existe' };

        const zip = new AdmZip(zipPath);
        const entradas = zip.getEntries().filter((e) => e.entryName.endsWith('.json'));
        if (entradas.length === 0) {
            return { valido: false, colecciones: 0, motivo: 'no tiene ninguna colección adentro' };
        }

        // Abrir el zip no alcanza: hay que poder parsear lo que trae. Un JSON
        // cortado a la mitad pasa el chequeo de zip y falla cuando hace falta.
        for (const e of entradas) {
            try {
                JSON.parse(e.getData().toString('utf8'));
            } catch {
                return {
                    valido: false,
                    colecciones: entradas.length,
                    motivo: `${e.entryName} está cortado o ilegible`,
                };
            }
        }

        return { valido: true, colecciones: entradas.length };
    } catch (err) {
        // adm-zip tira acá cuando falta la firma de fin de archivo, que es
        // exactamente el síntoma del proceso muerto a mitad de escritura.
        return { valido: false, colecciones: 0, motivo: `no se puede abrir: ${err.message}` };
    }
}

/** Los backups que hay, del más nuevo al más viejo, con su estado. */
export function listarBackups() {
    if (!fs.existsSync(BACKUPS_DIR)) return [];

    return fs
        .readdirSync(BACKUPS_DIR)
        .filter((f) => f.endsWith('.zip'))
        .map((file) => {
            const filePath = path.join(BACKUPS_DIR, file);
            const stats = fs.statSync(filePath);
            const estado = verificarBackup(filePath);
            return {
                name: file,
                size: stats.size,
                createdAt: stats.birthtime,
                path: `/backups/${file}`,
                valido: estado.valido,
                colecciones: estado.colecciones,
                motivo: estado.motivo,
            };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
}

/** El último backup que de verdad se puede abrir y leer. */
export function ultimoBackupValido() {
    return listarBackups().find((b) => b.valido) || null;
}

export const runBackup = async () => {
    let connection = null;
    let tempDir = null;

    try {
        console.log(`[Backup] Starting backup process...`);

        // 1. Connect if not connected
        if (mongoose.connection.readyState === 0) {
            console.log("[Backup] Connecting to MongoDB...");
            if (!process.env.MONGO_URI) throw new Error("No MONGO_URI found");
            await mongoose.connect(process.env.MONGO_URI);
        } else {
            console.log("[Backup] Using existing MongoDB connection.");
        }
        connection = mongoose.connection;

        // 2. Prepare Backup Folder
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupName = `backup_${timestamp}`;
        tempDir = path.join(BACKUPS_DIR, 'temp', backupName);
        ensureDir(tempDir);

        // 3. Fetch Collections
        if (!connection.db) {
            throw new Error("Database connection not established (connection.db is undefined)");
        }
        const collections = await connection.db.listCollections().toArray();
        console.log(`[Backup] Found ${collections.length} collections.`);

        for (const col of collections) {
            const name = col.name;
            const data = await connection.db.collection(name).find({}).toArray();

            fs.writeFileSync(
                path.join(tempDir, `${name}.json`),
                JSON.stringify(data, null, 2)
            );
        }

        // 4. Compress to ZIP
        //
        //    Se escribe con extensión `.parcial`. Si el proceso muere acá, lo
        //    que queda es un `.parcial` que nadie va a confundir con un
        //    backup, en vez de un `.zip` truncado que el listado mostraba
        //    como bueno. El nombre definitivo se pone recién al verificar.
        ensureDir(BACKUPS_DIR);
        const zipFinal = path.join(BACKUPS_DIR, `${backupName}.zip`);
        const zipParcial = zipFinal + EXT_PARCIAL;
        const output = fs.createWriteStream(zipParcial);
        const archive = archiver('zip', { zlib: { level: 9 } });

        const rutaEscrita = await new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`[Backup] Escrito ${zipParcial} (${archive.pointer()} bytes)`);
                resolve(zipParcial);
            });
            output.on('error', (err) => {
                console.error(`[Backup] ❌ Write stream error: ${err.message}`);
                reject(err);
            });
            archive.on('error', (err) => {
                console.error(`[Backup] ❌ Compression error: ${err.message}`);
                reject(err);
            });

            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();
        });

        // 5. Verificar ANTES de darlo por bueno.
        //
        //    `archive.pointer()` dice cuántos bytes salieron, no si el archivo
        //    sirve. La única prueba es abrirlo y leerlo.
        const estado = verificarBackup(rutaEscrita);
        if (!estado.valido) {
            fs.rmSync(rutaEscrita, { force: true });
            throw new Error(`El backup salió corrupto (${estado.motivo}); se descartó el archivo`);
        }
        if (estado.colecciones < collections.length) {
            fs.rmSync(rutaEscrita, { force: true });
            throw new Error(
                `El backup quedó incompleto: ${estado.colecciones} colecciones de ${collections.length}; se descartó el archivo`
            );
        }

        // 6. Recién ahora tiene nombre de backup.
        fs.renameSync(rutaEscrita, zipFinal);
        console.log(`[Backup] ✅ Backup verificado: ${zipFinal} (${estado.colecciones} colecciones)`);

        return zipFinal;

    } catch (error) {
        console.error(`[Backup] ❌ Error:`, error);
        throw error;
    } finally {
        // Limpieza de SU carpeta, no de la carpeta padre compartida.
        //
        // Antes esto hacía `rmSync(backups/temp)`: con dos backups a la vez
        // —el cron y uno manual, o dos instancias— el que terminaba primero
        // le borraba los archivos al otro en pleno armado.
        if (tempDir) {
            try {
                await new Promise((r) => setTimeout(r, 1000)); // Windows suelta los handles
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (e) {
                console.warn(`Failed to cleanup temp dir (non-fatal): ${e.message}`);
            }
        }
    }
};

/**
 * Corre un backup si hace demasiado que no hay uno válido.
 *
 * `node-cron` solo dispara si el proceso está vivo a la hora exacta y no
 * recupera lo perdido: si la máquina estuvo apagada a las 03:00, esa noche
 * no hubo backup y nada lo dijo. Esto se llama al arrancar y tapa ese hueco.
 *
 * @param {number} horasMax  cuántas horas se tolera sin backup válido
 */
export async function backupSiHaceFalta(horasMax = 24) {
    const ultimo = ultimoBackupValido();
    const horas = ultimo
        ? (Date.now() - new Date(ultimo.createdAt).getTime()) / 36e5
        : Infinity;

    if (horas <= horasMax) {
        console.log(`[Backup] Último backup válido hace ${horas.toFixed(1)} h (${ultimo.name}). No hace falta.`);
        return null;
    }

    console.warn(
        ultimo
            ? `[Backup] ⚠️ El último backup válido es de hace ${horas.toFixed(1)} h (${ultimo.name}). Corriendo uno ahora.`
            : `[Backup] ⚠️ No hay ningún backup válido. Corriendo uno ahora.`
    );
    return runBackup();
}

import { fileURLToPath } from 'url';

// Check if running directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
    runBackup().then(() => {
        console.log("Backup complete (Standalone mode).");
        process.exit(0);
    }).catch(e => {
        console.error("Backup failed.", e);
        process.exit(1);
    });
}
