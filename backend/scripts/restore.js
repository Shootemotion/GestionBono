import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env if running standalone
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
if (!process.env.MONGO_URI) dotenv.config();

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export const getBackupPreview = async (backupFilename) => {
    const backupPath = path.join(BACKUPS_DIR, backupFilename);
    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupFilename}`);
    }

    try {
        const zip = new AdmZip(backupPath);
        const zipEntries = zip.getEntries();

        // Filter only JSON files and get collection names
        const collections = zipEntries
            .filter(entry => entry.entryName.endsWith('.json') && !entry.isDirectory)
            .map(entry => {
                const name = path.basename(entry.entryName, '.json');
                return {
                    name,
                    size: entry.header.size, // Uncompressed size
                    compressedSize: entry.header.compressedSize
                }
            });

        return collections;
    } catch (error) {
        console.error(`[Preview] Error reading backup zip:`, error);
        throw error;
    }
};

export const runRestore = async (backupFilename, selectedCollections = null) => {
    let connection = null;
    const tempExtractDir = path.join(BACKUPS_DIR, 'temp_restore_' + Date.now()); // Unique temp dir

    try {
        console.log(`[Restore] Starting restore for ${backupFilename}...`);

        const backupPath = path.join(BACKUPS_DIR, backupFilename);
        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup file not found: ${backupFilename}`);
        }

        // 1. Unzip
        ensureDir(tempExtractDir);
        const zip = new AdmZip(backupPath);
        zip.extractAllTo(tempExtractDir, true);

        // 2. Connect to DB
        if (mongoose.connection.readyState === 0) {
            console.log("[Restore] Connecting to MongoDB...");
            if (!process.env.MONGO_URI) throw new Error("No MONGO_URI found");
            await mongoose.connect(process.env.MONGO_URI);
        } else {
            console.log("[Restore] Using existing MongoDB connection.");
        }
        connection = mongoose.connection;

        if (!connection.db) {
            throw new Error("Database connection not established");
        }

        // 3. Restore Collections
        let files = fs.readdirSync(tempExtractDir).filter(f => f.endsWith('.json'));

        // Filter if partial restore
        if (selectedCollections && Array.isArray(selectedCollections) && selectedCollections.length > 0) {
            console.log(`[Restore] Partial restore requested for: ${selectedCollections.join(', ')}`);
            files = files.filter(f => {
                const colName = path.basename(f, '.json');
                return selectedCollections.includes(colName);
            });
        }

        console.log(`[Restore] Found ${files.length} collections to restore.`);

        for (const file of files) {
            const collectionName = path.basename(file, '.json');
            const fileContent = fs.readFileSync(path.join(tempExtractDir, file), 'utf-8');
            const sections = JSON.parse(fileContent);

            console.log(`[Restore] Restoring ${collectionName} (${sections.length} docs)...`);

            // Drop existing
            try {
                await connection.db.collection(collectionName).drop();
            } catch (e) {
                // Ignore if namespace not found (code 26)
                if (e.code !== 26) console.warn(`[Restore] Warning dropping ${collectionName}: ${e.message}`);
            }

            if (sections.length > 0) {
                // Fix dates and ObjectIds
                const reviveData = (obj) => {
                    if (Array.isArray(obj)) {
                        return obj.map(reviveData);
                    } else if (typeof obj === 'object' && obj !== null) {
                        for (const key in obj) {
                            const value = obj[key];
                            if (typeof value === 'string') {
                                // Start simple: strict ISO date matching
                                // 2023-10-05T14:48:00.000Z
                                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
                                    obj[key] = new Date(value);
                                }
                            } else if (typeof value === 'object') {
                                reviveData(value);
                            }
                        }
                        // Handle _id if it's a string that looks like ObjectId
                        if (obj._id && typeof obj._id === 'string' && /^[0-9a-fA-F]{24}$/.test(obj._id)) {
                            obj._id = new mongoose.Types.ObjectId(obj._id);
                        }

                    }
                    return obj;
                };

                const processedDocs = sections.map(doc => reviveData(doc));
                await connection.db.collection(collectionName).insertMany(processedDocs);
            }
        }

        console.log("[Restore] Cleanup...");
        try {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
        } catch (e) {
            console.warn("Could not remove temp dir immediately (Windows lock?), ignoring.");
        }

        console.log("[Restore] ✅ Restore complete.");
        return true;

    } catch (error) {
        console.error(`[Restore] ❌ Error:`, error);
        // attempt cleanup
        try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) { }
        throw error;
    }
};

// Standalone check
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const backupFile = process.argv[2];
    if (!backupFile) {
        console.error("Usage: node restore.js <backup_filename>");
        process.exit(1);
    }
    runRestore(backupFile).then(() => {
        console.log("Restore finished successfully.");
        process.exit(0);
    }).catch((e) => {
        console.error("Restore failed.", e);
        process.exit(1);
    });
}
