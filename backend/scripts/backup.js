
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import dotenv from 'dotenv';

// Load env if running standalone
dotenv.config({ path: '../.env' }); // try sibling
if (!process.env.MONGO_URI) dotenv.config(); // try current

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export const runBackup = async () => {
    let connection = null;
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
        const tempDir = path.join(BACKUPS_DIR, 'temp', backupName);
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
        ensureDir(BACKUPS_DIR);
        const zipPath = path.join(BACKUPS_DIR, `${backupName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', async () => {
                console.log(`[Backup] ✅ Backup successful: ${zipPath} (${archive.pointer()} bytes)`);

                // Cleanup temp with delay to avoid EPERM on Windows
                try {
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s for file handles to release
                    fs.rmSync(path.join(BACKUPS_DIR, 'temp'), { recursive: true, force: true });
                } catch (e) {
                    console.warn(`Failed to cleanup temp dir (non-fatal): ${e.message}`);
                }
                resolve(zipPath);
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

    } catch (error) {
        console.error(`[Backup] ❌ Error:`, error);
        throw error;
    }
};

import { fileURLToPath } from 'url';

// ... (top imports)

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
