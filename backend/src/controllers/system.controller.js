import fs from 'fs';
import path from 'path';
import { runBackup } from '../../scripts/backup.js';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');

export const listBackups = async (req, res) => {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) {
            return res.json([]);
        }

        const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.zip'));

        const backupList = files.map(file => {
            const filePath = path.join(BACKUPS_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                createdAt: stats.birthtime,
                path: `/backups/${file}` // To be served statically if needed, or download endpoint
            };
        });

        // Sort by date desc (newest first)
        backupList.sort((a, b) => b.createdAt - a.createdAt);

        res.json(backupList);
    } catch (error) {
        console.error("Error listing backups:", error);
        res.status(500).json({ message: "Error reading backups" });
    }
};

export const triggerBackup = async (req, res) => {
    try {
        console.log("🔄 Manual backup triggered by user:", req.user?.email);
        const result = await runBackup();
        res.json({ message: "Backup completado con éxito", filename: result });
    } catch (e) {
        console.error("triggerBackup error", e);
        res.status(500).json({ message: e.message || "Error ejecutando backup manual" });
    }
};

export const downloadBackup = async (req, res) => {
    try {
        const { filename } = req.params;
        // Simple sanity check to prevent path traversal
        if (!filename || filename.includes('..') || !filename.endsWith('.zip')) {
            return res.status(400).json({ message: "Invalid filename" });
        }

        const filePath = path.join(BACKUPS_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "File not found" });
        }

        res.download(filePath);
    } catch (error) {
        console.error("Error downloading backup:", error);
        res.status(500).json({ message: "Download failed" });
    }
};
