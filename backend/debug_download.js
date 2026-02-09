
import fs from 'fs';
import path from 'path';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

console.log("BACKUPS_DIR:", BACKUPS_DIR);

if (!fs.existsSync(BACKUPS_DIR)) {
    console.log("Backups dir does not exist!");
} else {
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.zip'));
    console.log("Files found:", files);

    files.forEach(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        console.log(`File: ${f}, Exists: ${fs.existsSync(fullPath)}, Path: ${fullPath}`);
    });
}
