import express from 'express';
import fs from 'fs';
import path from 'path';
import { runBackup } from '../../scripts/backup.js';
import { runRestore, getBackupPreview } from '../../scripts/restore.js';
import mongoose from 'mongoose';
import Empleado from '../models/Empleado.model.js';
import Evaluacion from '../models/Evaluacion.model.js';
import Usuario from '../models/Usuario.model.js';
import os from 'os';

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
    const { collections } = req.body; // Array of collection names or null for all

    // Security check
    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.zip')) {
        return res.status(400).json({ message: 'Invalid filename' });
    }

    try {
        await runRestore(filename, collections);
        res.json({ success: true, message: 'System restored successfully' });
    } catch (error) {
        console.error('Restore failed:', error);
        res.status(500).json({ message: 'Restore failed', error: error.message });
    }
});



// GET /api/system/backups/:filename/preview - Get list of collections in backup
router.get('/backups/:filename/preview', async (req, res) => {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.zip')) {
        return res.status(400).json({ message: 'Invalid filename' });
    }

    try {
        const collections = await getBackupPreview(filename);
        res.json(collections);
    } catch (error) {
        console.error('Preview failed:', error);
        res.status(500).json({ message: 'Failed to preview backup', error: error.message });
    }
});

// GET /api/system/health - Get system health status
router.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState;
        // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
        const dbStatusMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        // Define "recent" as within the last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Basic stats + Activity
        const [employeeCount, evaluationCount, totalUsers, activeUsers24h] = await Promise.all([
            Empleado.countDocuments(),
            Evaluacion.countDocuments(),
            Usuario.countDocuments({ activo: true }),
            Usuario.countDocuments({ activo: true, lastLoginAt: { $gte: twentyFourHoursAgo } })
        ]);

        res.json({
            status: dbStatus === 1 ? 'ok' : 'error',
            database: {
                status: dbStatusMap[dbStatus] || 'unknown',
                readyState: dbStatus
            },
            server: {
                uptime: Math.floor(uptime),
                uptimeFormatted: formatUptime(uptime),
                memory: {
                    rssCount: Math.floor(memoryUsage.rss / 1024 / 1024),
                    rss: Math.floor(memoryUsage.rss / 1024 / 1024) + ' MB',
                    heapTotalCount: Math.floor(memoryUsage.heapTotal / 1024 / 1024),
                    heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                    heapUsedCount: Math.floor(memoryUsage.heapUsed / 1024 / 1024),
                    heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                },
                platform: process.platform,
                nodeVersion: process.version,
                loadAvg: os.loadavg(),
                cpuCount: os.cpus().length
            },
            stats: {
                employees: employeeCount,
                evaluations: evaluationCount,
                usersTotal: totalUsers,
                usersActive24h: activeUsers24h
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ message: 'Health check failed', error: error.message });
    }
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

export default router;
