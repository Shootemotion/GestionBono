import express from 'express';
import fs from 'fs';
import path from 'path';
import { runBackup } from '../../scripts/backup.js';
import { runRestore } from '../../scripts/restore.js';

const router = express.Router();

// Define backups directory (should match what's in backup.js)
// backup.js uses: path.join(process.cwd(), 'backups')
const BACKUPS_DIR = path.join(process.cwd(), 'backups');

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// GET /api/system/backups - List all backups
router.get('/backups', (req, res) => {
    try {
        ensureDir(BACKUPS_DIR);
        const files = fs.readdirSync(BACKUPS_DIR).filter(file => file.endsWith('.zip'));

        const backups = files.map(file => {
            const filePath = path.join(BACKUPS_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                createdAt: stats.birthtime // or mtime
            };
        });

        // Sort by newest first
        backups.sort((a, b) => b.createdAt - a.createdAt);

        res.json(backups);
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ message: 'Error listing backups' });
    }
});

// POST /api/system/run - Trigger manual backup
router.post('/run', async (req, res) => {
    try {
        const zipPath = await runBackup();
        const filename = path.basename(zipPath);
        res.json({ success: true, filename });
    } catch (error) {
        console.error('Manual backup failed:', error);
        res.status(500).json({ message: 'Backup failed', error: error.message });
    }
});

// GET /api/system/backups/:filename/download - Download specific backup
router.get('/backups/:filename/download', (req, res) => {
    const { filename } = req.params;

    // Security check to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.zip')) {
        return res.status(400).json({ message: 'Invalid filename' });
    }

    const filePath = path.join(BACKUPS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Backup not found' });
    }

    res.download(filePath);
});

// POST /api/system/backups/:filename/restore - Restore from backup
router.post('/backups/:filename/restore', async (req, res) => {
    const { filename } = req.params;

    // Security check
    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.zip')) {
        return res.status(400).json({ message: 'Invalid filename' });
    }

    try {
        await runRestore(filename);
        res.json({ success: true, message: 'System restored successfully' });
    } catch (error) {
        console.error('Restore failed:', error);
        res.status(500).json({ message: 'Restore failed', error: error.message });
    }
});

export default router;
