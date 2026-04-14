// src/pages/UsuariosAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Modal from "@/components/Modal.jsx";
import { Button } from "@/components/ui/button";
import {
  Users,
  Search,
  Shield,
  Key,
  Link as LinkIcon,
  UserPlus,
  RefreshCw,
  MoreHorizontal,
  Mail,
  FileText,
  Unlink
} from "lucide-react";

// Helper para array
const toArray = (x) => {
  if (Array.isArray(x)) return x;
  if (x?.items && Array.isArray(x.items)) return x.items;
  if (x?.data && Array.isArray(x.data)) return x.data;
  if (x?.results && Array.isArray(x.results)) return x.results;
  return [];
};

export default function UsuariosAdmin() {
  const [empleados, setEmpleados] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Buscador / filtro
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  // Modal para credenciales temporales
  const [tempInfo, setTempInfo] = useState(null);
  const [tempModalOpen, setTempModalOpen] = useState(false);

  // Modal crear cuenta
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createEmpleado, setCreateEmpleado] = useState(null);
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("visor");
  const [createIsCalidad, setCreateIsCalidad] = useState(false);
  const [createSendEmail, setCreateSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);

  // Modal EDITAR usuario
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("visor");
  const [editIsCalidad, setEditIsCalidad] = useState(false);
  const [updating, setUpdating] = useState(false);

  // --- HANDLERS (Igual que antes) ---

  const openEditModal = (u) => {
    setEditUser(u);
    setEditEmail(u.email || "");
    setEditRole(u.rol || "visor");
    setEditIsCalidad(u.isCalidad || false);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditUser(null);
    setEditModalOpen(false);
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;
    setUpdating(true);
    try {
      const res = await api(`/usuarios/${editUser._id}`, {
        method: "PATCH",
        body: { email: editEmail, rol: editRole, isCalidad: editIsCalidad }
      });
      setUsers(prev => prev.map(u => (u._id === res.user._id ? res.user : u)));
      toast.success("Usuario actualizado correctamente.");
      closeEditModal();
    } catch (err) {
      console.error(err);
      toast.error(err?.data?.message || "Error al actualizar usuario.");
    } finally {
      setUpdating(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [emps, usrs] = await Promise.all([
        api("/empleados?sort=-createdAt&limit=1000"),
        api("/usuarios?limit=1000"),
      ]);
      setEmpleados(toArray(emps));
      setUsers(toArray(usrs));
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const usersByEmpleado = useMemo(() => {
    const map = {};
    (Array.isArray(users) ? users : toArray(users)).forEach(u => {
      if (u.empleado) {
        const empId = typeof u.empleado === "object" ? u.empleado._id : u.empleado;
        map[String(empId)] = u;
      }
    });
    return map;
  }, [users]);

  const empleadoEstado = (emp) => {
    if (emp?.status) return emp.status;
    if (emp?.activo === false) return "desvinculado";
    return "activo";
  };

  const empleadosFiltrados = useMemo(() => {
    const qi = q.trim().toLowerCase();
    const base = Array.isArray(empleados) ? empleados : toArray(empleados);
    return base
      .filter(Boolean)
      .filter(emp => {
        if (statusFilter !== "todos") {
          const st = empleadoEstado(emp);
          if (statusFilter === "active" && st !== "activo") return false;
          if (statusFilter === "desvinculado" && st !== "desvinculado") return false;
          if (statusFilter === "suspended" && (st !== "suspended" && st !== "suspendido")) return false;
          if (statusFilter === "other" && !["activo", "desvinculado", "suspended", "suspendido"].includes(st)) return false;
        }

        if (!qi) return true;
        const nombre = `${emp.apellido || ""}, ${emp.nombre || ""}`.toLowerCase();
        const dni = String(emp.dni || "");
        const mail = (emp.email || "").toLowerCase();
        return nombre.includes(qi) || dni.includes(qi) || mail.includes(qi);
      });
  }, [empleados, q, statusFilter]);

  const openCreateModal = (empleado) => {
    setCreateEmpleado(empleado || null);
    const u = usersByEmpleado[empleado?._id];
    setCreateEmail((u?.email || empleado?.email || "").trim());
    setCreateRole(u?.rol || "visor");
    setCreateIsCalidad(u?.isCalidad || false);
    setCreateSendEmail(true);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateEmpleado(null);
    setCreateEmail("");
    setCreateRole("visor");
    setCreateIsCalidad(false);
    setCreateModalOpen(false);
  };

  const handleCreateAccount = async () => {
    if (!createEmail) return toast.warn("Email requerido");

    setCreating(true);
    try {
      const body = {
        email: createEmail.trim().toLowerCase(),
        rol: createRole,
        isCalidad: createIsCalidad,
        empleadoId: createEmpleado ? createEmpleado._id : undefined,
        enviarEmail: createSendEmail,
      };
      const res = await api("/usuarios", { method: "POST", body });
      const { action, user, tempPassword } = res || {};

      if (user) await loadAll();

      if (action === 'created') toast.success("Usuario creado.");
      else if (action === 'linked') toast.success("Usuario vinculado.");
      else if (action === 'reset') toast.success("Contraseña reseteada.");
      else if (action === 'conflict') toast.error("Conflicto: email en uso.");
      else toast.success("Hecho.");

      if (tempPassword) {
        setTempInfo({ email: user?.email || createEmail, tempPassword });
        setTempModalOpen(true);
      }
      closeCreateModal();
    } catch (err) {
      toast.error(err?.data?.message || "Error al crear usuario");
    } finally {
      setCreating(false);
    }
  };

  const resetearUsuario = async (user) => {
    const defaultEmail = user.email || "";
    // Preguntamos amigablemente si ademas de generarla queremos enviarsela por correo.
    const enviarMail = confirm(`Vas a generar una nueva contraseña temporal para ${defaultEmail}. \n\n¿Deseas enviársela automáticamente a su correo?`);
    try {
      const res = await api(`/usuarios/${user._id}/reset-password`, {
        method: "PATCH",
        body: { enviarEmail: enviarMail }
      });
      setUsers(prev => prev.map(u => (u._id === res.user._id ? res.user : u)));
      setTempInfo({ email: res.user.email, tempPassword: res.tempPassword });
      setTempModalOpen(true);
      toast.success(enviarMail ? "Contraseña reseteada y enviada por mail" : "Nueva contraseña generada");
    } catch (err) {
      toast.error("Error al resetear");
    }
  };

  const unlinkUsuario = async (user) => {
    if (!confirm("¿Desvincular este usuario del empleado?")) return;
    try {
      const res = await api(`/usuarios/${user._id}/unlink`, { method: "PATCH" });
      setUsers(prev => prev.map(u => (u._id === res.user._id ? res.user : u)));
      toast.success("Usuario desvinculado");
    } catch (err) {
      toast.error("Error al desvincular");
    }
  };

  const updateEmpleadoStatus = async (empleadoId, newStatus) => {
    try {
      const updated = await api(`/empleados/${empleadoId}`, { method: "PUT", body: { status: newStatus } });
      setEmpleados(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      toast.success("Estado actualizado");
    } catch (err) {
      toast.error("Error al actualizar estado");
    }
  };

  const copyTemp = () => {
    if (!tempInfo) return;
    const txt = `Usuario: ${tempInfo.email}\nClave temporal: ${tempInfo.tempPassword}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Copiado!")).catch(() => toast.error("Error al copiar"));
  };

  // --- RENDER ---

  const stats = {
    total: empleados.length,
    users: users.length,
    linked: users.filter(u => u.empleado).length
  };

  return (
    <div className=" space-y-8 max-w-6xl mx-auto">

      {/* Header Premium */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
        {/* Decoración fondo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <div className="flex gap-6 items-center z-10">
          <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 shadow-inner">
            <Users className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h4 className="font-bold text-xl text-white tracking-tight">Usuarios y Accesos</h4>
            <div className="flex flex-col gap-1 mt-2">
              <span className="text-slate-400 text-sm font-medium">
                Gestión integral de personal y credenciales
              </span>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-xl font-bold text-white">{stats.total}</span>
                  <span className="text-xs text-slate-500 uppercase font-bold">Empleados</span>
                </div>
                <div className="w-px h-4 bg-white/20"></div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-xl font-bold text-blue-300">{stats.linked}</span>
                  <span className="text-xs text-slate-500 uppercase font-bold">Con Acceso</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 z-10">

          <Button
            variant="outline"
            size="lg"
            onClick={loadAll}
            disabled={loading}
            className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white backdrop-blur-md"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* Toolbar: Filtros & Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Buscar por nombre, DNI o email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
          >
            <option value="todos">Todos</option>
            <option value="active">Activos</option>
            <option value="desvinculado">Desvinculados</option>
            <option value="suspended">Suspendidos</option>
          </select>
        </div>
      </div>

      {/* Tabla Premium */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Empleado</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">DNI / Email</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Cuenta Web</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Rol</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Estado</th>
                <th className="px-6 py-4 text-right font-bold text-slate-600 uppercase text-xs tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Cargando datos...</td></tr>
              ) : (
                (empleadosFiltrados || []).map(emp => {
                  const u = usersByEmpleado[emp._id];
                  const estado = empleadoEstado(emp);
                  const hasAccount = !!u;

                  return (
                    <tr key={emp._id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{emp.apellido}, {emp.nombre}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-slate-500 text-xs">
                            <FileText className="w-3 h-3" /> {emp.dni}
                          </div>
                          {emp.email && (
                            <div className="flex items-center gap-1 text-slate-500 text-xs truncate max-w-[150px]" title={emp.email}>
                              <Mail className="w-3 h-3" /> {emp.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {hasAccount ? (
                          <div className="flex items-center gap-2 text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-md w-fit text-xs border border-emerald-100">
                            <Users className="w-3 h-3" />
                            {u.email}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Sin cuenta</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {hasAccount ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 uppercase tracking-wide">
                              <Shield className="w-3 h-3 mr-1" />
                              {u.rol}
                            </span>
                            {u.isCalidad && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 uppercase tracking-wide border border-sky-200">
                                  ✔ Calidad ISO
                                </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={estado}
                          onChange={(e) => updateEmpleadoStatus(emp._id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-md border-0 ring-1 ring-inset focus:ring-2 focus:ring-blue-600 cursor-pointer ${estado === 'activo' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                            estado === 'desvinculado' ? 'bg-red-50 text-red-700 ring-red-600/20' :
                              'bg-amber-50 text-amber-700 ring-amber-600/20'
                            }`}
                        >
                          <option value="activo">Activo</option>
                          <option value="desvinculado">Desvinculado</option>
                          <option value="suspendido">Suspendido</option>
                          <option value="otro">Otro</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          {!hasAccount ? (
                            <Button size="sm" onClick={() => openCreateModal(emp)} className="h-8 text-xs bg-slate-900 hover:bg-slate-800">
                              <UserPlus className="w-3 h-3 mr-1.5" />
                              Crear
                            </Button>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={() => openEditModal(u)} title="Editar Rol/Email">
                                <Search className="w-4 h-4" /> {/* Actually Edit icon usually implies pencil, using search as generic inspect/edit if pencil missing or keep icons simple */}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-amber-600" onClick={() => resetearUsuario(u)} title="Resetear Clave">
                                <Key className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => unlinkUsuario(u)} title="Desvincular">
                                <Unlink className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && empleadosFiltrados.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No se encontraron resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODALES (Conservamos funcionalidad, mejoramos look si hiciese falta tocando el componente Modal, aqui solo contenido) --- */}

      {/* Modal: Crear/Vincular */}
      <Modal isOpen={createModalOpen} onClose={closeCreateModal} title="Configurar Acceso Web">
        <div className="space-y-4 pt-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{createEmpleado ? `${createEmpleado.apellido}, ${createEmpleado.nombre}` : '—'}</p>
              <p className="text-xs text-slate-500">Empleado Seleccionado</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Email de acceso</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="usuario@empresa.com" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Rol / Permisos</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white" value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                  <option value="visor">Visor (Lectura básica)</option>
                  <option value="jefe_sector">Jefe de Sector</option>
                  <option value="jefe_area">Jefe de Área</option>
                  <option value="rrhh">RRHH</option>
                  <option value="directivo">Directivo</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="createCalidad"
                checked={createIsCalidad}
                onChange={(e) => setCreateIsCalidad(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="createCalidad" className="text-sm font-semibold text-sky-700 cursor-pointer select-none">
                Habilitar Perfil "Rol Calidad" (Gestión ISO)
              </label>
            </div>

            {/* Checkbox de Enviar por Mail (Restaurado) */}
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="sendEmail"
                checked={createSendEmail}
                onChange={(e) => setCreateSendEmail(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="sendEmail" className="text-sm text-slate-700 cursor-pointer select-none">
                Enviar contraseña por correo electrónico
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={closeCreateModal}>Cancelar</Button>
            <Button onClick={handleCreateAccount} disabled={creating} className="bg-blue-600 hover:bg-blue-700">
              {creating ? 'Procesando...' : 'Confirmar Acceso'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar */}
      <Modal isOpen={editModalOpen} onClose={closeEditModal} title="Editar Credenciales">
        <div className="space-y-4 pt-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Email</label>
              <input className="w-full px-3 py-2 text-sm rounded-md border border-slate-300" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Rol</label>
              <select className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                <option value="visor">Visor</option>
                <option value="jefe_sector">Jefe de Sector</option>
                <option value="jefe_area">Jefe de Área</option>
                <option value="rrhh">RRHH</option>
                <option value="directivo">Directivo</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="editCalidad"
                checked={editIsCalidad}
                onChange={(e) => setEditIsCalidad(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="editCalidad" className="text-sm font-semibold text-sky-700 cursor-pointer select-none">
                Habilitar Perfil "Rol Calidad" (Gestión ISO)
              </label>
            </div>
            <p className="text-xs text-slate-400 italic ml-6">
              ⓘ Los cambios de permisos se aplican automáticamente en el próximo request del usuario.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={closeEditModal}>Cancelar</Button>
            <Button onClick={handleUpdateUser} disabled={updating}>
              {updating ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Credenciales Temporales */}
      <Modal isOpen={tempModalOpen} onClose={() => setTempModalOpen(false)} title="Credenciales Generadas">
        {tempInfo && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 text-sm">
              <p className="font-semibold mb-1">¡Operación exitosa!</p>
              <p>Compartí estas credenciales con el usuario. Al iniciar sesión se le pedirá cambiar la contraseña.</p>
            </div>

            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-sm space-y-2 relative group-clipboard">
              <div className="flex justify-between">
                <span className="text-slate-500">Usuario:</span>
                <span>{tempInfo.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clave:</span>
                <span className="font-bold text-white selection:bg-blue-500 selection:text-white">{tempInfo.tempPassword}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyTemp}>
                <RefreshCw className="w-4 h-4 mr-2" /> Copiar al portapapeles
              </Button>
              <Button onClick={() => setTempModalOpen(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
