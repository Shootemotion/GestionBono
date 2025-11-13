// src/pages/UsuariosAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Modal from "@/components/Modal.jsx";
import { Button } from "@/components/ui/button";


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
  const [statusFilter, setStatusFilter] = useState("todos"); // todos | active | desvinculado | suspended | other

  // Modal para credenciales temporales (igual que tenías)
  const [tempInfo, setTempInfo] = useState(null);
  const [tempModalOpen, setTempModalOpen] = useState(false);

  // Modal crear cuenta (editar email / rol antes de crear)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createEmpleado, setCreateEmpleado] = useState(null); // empleado objeto
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("visor");
  const [creating, setCreating] = useState(false);

  // Carga inicial
  const loadAll = async () => {
    setLoading(true);
    try {
// forzamos orden y tamaño generoso por si el backend pagina
    const [emps, usrs] = await Promise.all([
      api("/empleados?sort=-createdAt&limit=1000"),
      api("/usuarios?limit=1000"),
    ]);
    setEmpleados(toArray(emps));
    setUsers(toArray(usrs));
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron cargar empleados/usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Índice rápido de usuario por empleado
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

  // Helper para estado visual del empleado
  const empleadoEstado = (emp) => {
    // si tenés un campo concreto en el schema (p.ej. emp.status) úsalo
    if (emp?.status) return emp.status;
    if (emp?.activo === false) return "desvinculado";
    return "activo";
  };

  // Filtrado por búsqueda y estado
  const empleadosFiltrados = useMemo(() => {
    const qi = q.trim().toLowerCase();
   const base = Array.isArray(empleados) ? empleados : toArray(empleados);
 return base
 .filter(Boolean)
 .filter(emp => {
      // filtro por estado
      if (statusFilter !== "todos") {
        const st = empleadoEstado(emp);
        if (statusFilter === "active" && st !== "activo") return false;
        if (statusFilter === "desvinculado" && st !== "desvinculado") return false;
        if (statusFilter === "suspended" && (st !== "suspended" && st !== "suspendido")) return false;
        if (statusFilter === "other" && !["activo","desvinculado","suspended","suspendido"].includes(st)) return false;
      }

      if (!qi) return true;
      const nombre = `${emp.apellido || ""}, ${emp.nombre || ""}`.toLowerCase();
      const dni = String(emp.dni || "");
      const mail = (emp.email || "").toLowerCase();
      return nombre.includes(qi) || dni.includes(qi) || mail.includes(qi);
    });
  }, [empleados, q, statusFilter]);

  // Abrir modal crear cuenta (prefill email desde empleado si existe)
  const openCreateModal = (empleado) => {
 setCreateEmpleado(empleado || null);
  const u = usersByEmpleado[empleado?._id];
  setCreateEmail((u?.email || empleado?.email || "").trim());
  setCreateRole(u?.rol || "visor");
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateEmpleado(null);
    setCreateEmail("");
    setCreateRole("visor");
    setCreateModalOpen(false);
  };

  // Crear usuario para empleado (o con email editado)
const handleCreateAccount = async () => {
  if (!createEmail) return toast.warn("Email requerido");
  setCreating(true);
  try {
    const body = {
      email: createEmail.trim().toLowerCase(),
      rol: createRole,
      empleadoId: createEmpleado ? createEmpleado._id : undefined,
    };
    const res = await api("/usuarios", { method: "POST", body });

    const action = res?.action || 'created';
    const user = res?.user;
    const tempPassword = res?.tempPassword;

    if (user) {
     await loadAll();
    }

    if (action === 'created') {
      toast.success("Usuario creado. Compartí la contraseña temporal.");
    } else if (action === 'linked') {
      toast.success("Usuario existente vinculado al empleado. Se generó clave temporal.");
    } else if (action === 'reset') {
      toast.success("Usuario existente: se reseteó la contraseña temporal.");
    } else if (action === 'conflict') {
      toast.error(res?.message || "Conflicto: email vinculado a otro empleado.");
    } else {
      toast.success("Operación completada.");
    }

    if (tempPassword) {
      setTempInfo({ email: user?.email || createEmail, tempPassword });
      setTempModalOpen(true);
    }

    closeCreateModal();
  } catch (err) {
    console.error('create account err', err);

    // tu helper api() podría devolver error con err.status y err.data
    const status = err?.status || err?.response?.status;
    const data = err?.data || err?.response?.data || {};
    if (status === 409) {
      toast.error(data?.message || 'Conflicto: email ya registrado.');
    } else {
      toast.error(data?.message || err?.message || 'No se pudo crear el usuario');
    }
  } finally {
    setCreating(false);
  }
  };

  // Resetear contraseña (admin)
  const resetearUsuario = async (user) => {
    try {
      const res = await api(`/usuarios/${user._id}/reset-password`, { method: "PATCH" });
      setUsers(prev => prev.map(u => (u._id === res.user._id ? res.user : u)));
      setTempInfo({ email: res.user.email, tempPassword: res.tempPassword });
      setTempModalOpen(true);
      toast.success("Contraseña temporal generada");
    } catch (err) {
      console.error(err);
      toast.error(err?.data?.message || "No se pudo resetear la contraseña");
    }
  };

  // Vincular / desvincular
  const unlinkUsuario = async (user) => {
    if (!confirm("Desvincular este usuario del empleado?")) return;
    try {
      const res = await api(`/usuarios/${user._id}/unlink`, { method: "PATCH" });
      setUsers(prev => prev.map(u => (u._id === res.user._id ? res.user : u)));
      toast.success("Usuario desvinculado");
    } catch (err) {
      console.error(err);
      toast.error(err?.data?.message || "No se pudo desvincular");
    }
  };

  // Cambiar estado del empleado (PUT - reutiliza tu endpoint de empleados)
  const updateEmpleadoStatus = async (empleadoId, newStatus) => {
    try {
      // En tu backend tu endpoint PUT /empleados/:id espera el objeto actualizado.
      // Aquí mandamos solo { status: newStatus } y el backend debe mergearlo.
      const updated = await api(`/empleados/${empleadoId}`, { method: "PUT", body: { status: newStatus } });
      setEmpleados(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      toast.success("Estado actualizado");
    } catch (err) {
      console.error(err);
      toast.error(err?.data?.message || "No se pudo actualizar el estado");
    }
  };

  const copyTemp = () => {
  if (!tempInfo) return;
  const txt = `Usuario: ${tempInfo.email}\nClave temporal: ${tempInfo.tempPassword}`;


 if (navigator.clipboard && navigator.clipboard.writeText) {
   navigator.clipboard.writeText(txt)
     .then(() => toast.success("Credenciales copiadas"))
     .catch(() => toast.error("No se pudo copiar"));
 } else {
   const temp = document.createElement("textarea");
   temp.value = txt;
   document.body.appendChild(temp);
   temp.select();
   document.execCommand("copy");
   document.body.removeChild(temp);
   toast.success("Credenciales copiadas (fallback)");
 }
};

  return (
    <div className="container-app space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Usuarios y Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Crea cuentas web, resetea contraseñas y vincula personas. Ver / editar email antes de crear cuenta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading}>Refrescar</Button>
        </div>
      </div>

      {/* Buscador / Filtros */}
      <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3 flex gap-3 items-center">
        <input
          placeholder="Buscar por nombre, DNI o email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2">
          <option value="todos">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="desvinculado">Desvinculado</option>
          <option value="suspended">Suspendido</option>
          <option value="other">Otro</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/60 p-3 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="text-left px-3 py-2">Empleado</th>
                <th className="text-left px-3 py-2">DNI</th>
                <th className="text-left px-3 py-2">Email empleado</th>
                <th className="text-left px-3 py-2">Cuenta web</th>
                <th className="text-left px-3 py-2">Rol</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
             {(empleadosFiltrados || []).map(emp => {
                const u = usersByEmpleado[emp._id];
                const estado = empleadoEstado(emp);
                return (
                  <tr key={emp._id} className="border-t border-border/60 odd:bg-background even:bg-muted/20">
                    <td className="px-3 py-2">{emp.apellido}, {emp.nombre}</td>
                    <td className="px-3 py-2">{emp.dni}</td>
                    <td className="px-3 py-2">{emp.email || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">{u ? u.email : <span className="text-muted-foreground">Sin cuenta</span>}</td>
                    <td className="px-3 py-2">{u ? u.rol : '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{estado}</span>
                        <select
                          value={estado}
                          onChange={(e) => updateEmpleadoStatus(emp._id, e.target.value)}
                          className="text-xs rounded-md border border-border bg-background px-2 py-1"
                        >
                          <option value="activo">activo</option>
                          <option value="desvinculado">desvinculado</option>
                          <option value="suspendido">suspendido</option>
                          <option value="otro">otro</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 flex gap-2">
                      {!u ? (
                        <Button size="sm" onClick={() => openCreateModal(emp)}>Crear cuenta</Button>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => resetearUsuario(u)}>Resetear pw</Button>
                          <Button size="sm" variant="outline" onClick={() => unlinkUsuario(u)}>Desvincular</Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!empleadosFiltrados.length && (
                <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">No hay empleados que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: crear cuenta (editar/verificar email antes de crear) */}
      <Modal isOpen={createModalOpen} onClose={closeCreateModal} title="Crear cuenta web">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground">Empleado</label>
            <div className="rounded border p-2 bg-muted/10">{createEmpleado ? `${createEmpleado.apellido}, ${createEmpleado.nombre}` : '—'}</div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Email para la cuenta</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2" value={createEmail} onChange={(e)=>setCreateEmail(e.target.value)} />
            <div className="text-xs text-muted-foreground mt-1">Verificá o editá el email si hace falta.</div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Rol</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2" value={createRole} onChange={(e)=>setCreateRole(e.target.value)}>
              <option value="visor">visor</option>
              <option value="jefe_sector">jefe_sector</option>
              <option value="jefe_area">jefe_area</option>
              <option value="rrhh">rrhh</option>
                <option value="directivo">directivo</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeCreateModal}>Cancelar</Button>
            <Button onClick={handleCreateAccount} disabled={creating}>{creating ? 'Creando…' : 'Crear cuenta'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: credenciales temporales */}
      <Modal isOpen={tempModalOpen} onClose={()=>setTempModalOpen(false)} title="Credenciales temporales">
        {tempInfo && (
          <div className="space-y-3">
            <p className="text-sm">Compartí estos datos de forma segura con el usuario (y pedile que la cambie al ingresar).</p>
            <div className="rounded border border-border p-3 bg-muted/20">
              <div><b>Usuario:</b> {tempInfo.email}</div>
              <div><b>Clave temporal:</b> <code>{tempInfo.tempPassword}</code></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyTemp}>Copiar</Button>
              <Button onClick={()=>setTempModalOpen(false)}>Listo</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
