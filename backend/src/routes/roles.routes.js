import { Router } from 'express';
import Role from '../models/Role.model.js';
import { authenticateJWT, requireRole } from '../auth/auth.middleware.js';

const router = Router();

// Middleware: Solo superadmin puede gestionar roles (por ahora)
// Futuro: Podría ser un permiso 'roles:manage'
router.use(authenticateJWT);
router.use(requireRole('superadmin'));

// GET /api/roles
router.get('/', async (req, res) => {
    try {
        const roles = await Role.find().sort({ name: 1 });
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener roles', error: error.message });
    }
});

// POST /api/roles
router.post('/', async (req, res) => {
    try {
        const { name, slug, description, permissions } = req.body;

        const existing = await Role.findOne({ slug });
        if (existing) {
            return res.status(400).json({ message: 'Ya existe un rol con ese slug/código' });
        }

        const newRole = await Role.create({
            name,
            slug,
            description,
            permissions: permissions || [],
            isSystem: false
        });

        res.status(201).json(newRole);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear rol', error: error.message });
    }
});

// PUT /api/roles/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions } = req.body;

        // No permitimos cambiar slug para no romper referencias
        const updated = await Role.findByIdAndUpdate(
            id,
            { name, description, permissions },
            { new: true }
        );

        if (!updated) return res.status(404).json({ message: 'Rol no encontrado' });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar rol', error: error.message });
    }
});

// DELETE /api/roles/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findById(id);

        if (!role) return res.status(404).json({ message: 'Rol no encontrado' });
        if (role.isSystem) {
            return res.status(403).json({ message: 'No se pueden eliminar roles de sistema base' });
        }

        // TODO: Verificar si hay usuarios usando este rol antes de borrar (opcional, por ahora permitimos pero quedaría "huerfano" el usuario o fallaría auth)

        await Role.findByIdAndDelete(id);
        res.json({ message: 'Rol eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar rol', error: error.message });
    }
});

export default router;
