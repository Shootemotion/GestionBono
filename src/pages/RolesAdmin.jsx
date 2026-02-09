import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Shield, Check, X, Edit3, Plus, Trash2, Lock, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

// Definición de Permisos Disponibles (Agrupados)
const PERMISSION_GROUPS = {
    "Estructura Organizacional": [
        { key: "estructura:ver", label: "Ver Estructura" },
        { key: "estructura:crear", label: "Crear Elementos" },
        { key: "estructura:editar", label: "Editar Elementos" },
        { key: "estructura:eliminar", label: "Eliminar Elementos" },
    ],
    "Nómina de Empleados": [
        { key: "nomina:ver", label: "Ver Nómina" },
        { key: "nomina:crear", label: "Crear Empleado" },
        { key: "nomina:editar", label: "Editar Empleado" },
        { key: "nomina:eliminar", label: "Eliminar Empleado" },
        { key: "nomina:evaluar", label: "Evaluar Personal" },
    ],
    "Objetivos y Metas": [
        { key: "objetivos:ver", label: "Ver Objetivos" },
        { key: "objetivos:crear", label: "Crear Objetivos" },
        { key: "objetivos:editar", label: "Editar Objetivos" },
        { key: "objetivos:eliminar", label: "Eliminar Objetivos" },
    ],
    "Gestión de Roles y Usuarios": [
        { key: "usuarios:manage", label: "Gestionar Usuarios" },
        { key: "roles:manage", label: "Gestionar Roles" },
    ],
    "Evaluaciones y Feedback": [
        { key: "rrhh:evaluaciones:ver", label: "Ver Todas las Evaluaciones (RRHH)" },
        { key: "rrhh:evaluaciones:cierre", label: "Cerrar Evaluaciones" },
        { key: "rrhh:evaluaciones:reabrir", label: "Reabrir Evaluaciones" },
    ],
    "Asignaciones y Distribución": [
        { key: "asignaciones:ver", label: "Ver Asignaciones" },
        { key: "asignaciones:editar", label: "Editar Asignaciones" },
    ]
};

export default function RolesAdmin() {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [formData, setFormData] = useState({ name: "", description: "", permissions: [] });
    const [saving, setSaving] = useState(false);

    const loadRoles = async () => {
        setLoading(true);
        try {
            const res = await api("/roles");
            setRoles(res);
        } catch (err) {
            toast.error("Error cargando roles");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
    }, []);

    const handleEdit = (role) => {
        setEditingRole(role);
        setFormData({
            name: role.name,
            description: role.description || "",
            permissions: role.permissions || []
        });
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingRole(null);
        setFormData({ name: "", description: "", permissions: [] });
        setIsModalOpen(true);
    };

    const togglePermission = (permKey) => {
        setFormData(prev => {
            const has = prev.permissions.includes(permKey);
            return {
                ...prev,
                permissions: has
                    ? prev.permissions.filter(p => p !== permKey)
                    : [...prev.permissions, permKey]
            };
        });
    };

    const handleSave = async () => {
        if (!formData.name.trim()) return toast.error("El nombre es requerido");

        setSaving(true);
        try {
            if (editingRole) {
                // Update
                await api(`/roles/${editingRole._id}`, {
                    method: "PUT",
                    body: {
                        name: formData.name,
                        description: formData.description,
                        permissions: formData.permissions
                    }
                });
                toast.success("Rol actualizado");
            } else {
                // Create
                await api("/roles", {
                    method: "POST",
                    body: {
                        name: formData.name,
                        slug: formData.name.toLowerCase().replace(/\s+/g, '_'),
                        description: formData.description,
                        permissions: formData.permissions
                    }
                });
                toast.success("Rol creado");
            }
            setIsModalOpen(false);
            loadRoles();
        } catch (err) {
            toast.error(err?.data?.message || "Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    const isSystemRole = (slug) => {
        return ['superadmin', 'rrhh', 'jefe_area', 'jefe_sector', 'directivo', 'visor'].includes(slug);
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto">

            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-2xl shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                <div className="flex gap-6 items-center z-10">
                    <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 shadow-inner">
                        <Shield className="w-8 h-8 text-indigo-300" />
                    </div>
                    <div>
                        <h4 className="font-bold text-xl text-white tracking-tight">Roles y Permisos</h4>
                        <div className="flex flex-col gap-1 mt-2">
                            <span className="text-slate-400 text-sm font-medium">
                                Define el alcance y las capacidades de cada perfil.
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono text-xl font-bold text-white">{roles.length}</span>
                                <span className="text-xs text-slate-500 uppercase font-bold">Roles Definidos</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 z-10">
                    <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10" onClick={loadRoles} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-500 text-white border-0" onClick={handleCreate}>
                        <Plus className="w-4 h-4 mr-2" /> Nuevo Rol
                    </Button>
                </div>
            </div>

            {/* Grid de Roles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map(role => (
                    <div key={role._id} className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                        <div className={`h-2 w-full ${isSystemRole(role.slug) ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                        <div className="p-6 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800">{role.name}</h3>
                                    <code className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{role.slug}</code>
                                </div>
                                {isSystemRole(role.slug) && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full border border-indigo-100">
                                        Sistema
                                    </span>
                                )}
                            </div>

                            <p className="text-sm text-slate-500 mb-6 flex-1">
                                {role.description || "Sin descripción"}
                            </p>

                            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                                Capacidades: <span className="text-slate-700">{role.permissions?.length || 0}</span>
                            </div>

                            <div className="flex gap-2 mt-auto">
                                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(role)}>
                                    <Edit3 className="w-4 h-4 mr-2" /> Editar
                                </Button>
                                {/* Delete button disabled for now for system roles */}
                                {!isSystemRole(role.slug) && (
                                    <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 hover:bg-red-50">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal Editor */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingRole ? `Editar Rol: ${editingRole.name}` : "Nuevo Rol"}
                maxWidth="max-w-4xl"
            >
                <div className="space-y-6 pt-2 h-[75vh] flex flex-col">
                    {/* Form Basic */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Nombre del Rol</label>
                            <input
                                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej. Auditor Externo"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                            <input
                                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Breve descripción del alcance..."
                            />
                        </div>
                    </div>

                    <div className="w-full h-px bg-slate-100 my-2 flex-shrink-0" />

                    {/* Matrix Permissions */}
                    <div className="flex-1 overflow-y-auto pr-2">
                        <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Lock className="w-4 h-4 text-slate-400" /> Permisos y Accesos
                        </h4>

                        <div className="space-y-6">
                            {Object.entries(PERMISSION_GROUPS).map(([category, items]) => (
                                <div key={category} className="bg-slate-50/50 rounded-lg p-4 border border-slate-100">
                                    <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-3 border-b border-indigo-100 pb-2">
                                        {category}
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {items.map(perm => {
                                            const isChecked = formData.permissions.includes(perm.key);
                                            return (
                                                <label
                                                    key={perm.key}
                                                    className={`flex items-start gap-3 p-2 rounded-md transition-colors cursor-pointer select-none ${isChecked ? 'bg-white shadow-sm ring-1 ring-indigo-500/20' : 'hover:bg-slate-100'
                                                        }`}
                                                >
                                                    <div
                                                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked
                                                                ? 'bg-indigo-600 border-indigo-600'
                                                                : 'bg-white border-slate-300'
                                                            }`}
                                                    >
                                                        {isChecked && <Check className="w-3 h-3 text-white" />}
                                                        <input
                                                            type="checkbox"
                                                            className="hidden"
                                                            checked={isChecked}
                                                            onChange={() => togglePermission(perm.key)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className={`text-sm font-medium block ${isChecked ? 'text-indigo-900' : 'text-slate-600'}`}>
                                                            {perm.label}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            {perm.key}
                                                        </span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
