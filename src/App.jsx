import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useState, useCallback } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Navbar from '@/components/Navbar';
import BonoBot from "@/components/BonoBot/BonoBot";
import { getToken } from '@/lib/api';
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/context/AuthContext';
import { useInactivityTimer } from '@/hooks/useInactivityTimer';
import { LogIn, Clock } from 'lucide-react';

// Lazy Import Pages
const EvaluacionFlujo = lazy(() => import('@/pages/EvaluacionFlujo'));
const LegajoEmpleado = lazy(() => import('@/pages/LegajoEmpleado.jsx'));
const GestionEstructura = lazy(() => import('@/pages/GestionNomina'));
const RRHHEvaluaciones = lazy(() => import('@/pages/RRHHEvaluaciones'));
const SeguimientoEjecutivo = lazy(() => import('@/pages/SeguimientoEjecutivo'));
const Login = lazy(() => import('@/pages/Login'));
const Forbidden = lazy(() => import('@/pages/Forbidden'));
const DashboardDesempeno = lazy(() => import('@/pages/SeguimientoReferente'));
const MiDesempeno = lazy(() => import('@/pages/MiDesempeno'));
const Home = lazy(() => import('@/pages/Home'));
const Nomina = lazy(() => import('@/pages/Nomina'));
const GestionPlantillas = lazy(() => import('@/pages/GestionPlantillas'));
const EditorAsignacion = lazy(() => import('@/pages/EditorAsignacion'));
const CompleteInvite = lazy(() => import('@/components/CompleteInvite'));
const UsuariosAdmin = lazy(() => import('@/pages/UsuariosAdmin'));
const RolesAdmin = lazy(() => import('@/pages/RolesAdmin'));
const GestionDepartamentos = lazy(() => import('./pages/GestionDepartamentos'));
const SimuladorObjetivos = lazy(() => import('@/pages/SimuladorObjetivos'));
const VersionesTimelinePage = lazy(() => import('@/pages/VersionesTimelinePage'));
const ConfiguracionBono = lazy(() => import('@/pages/ConfiguracionBono'));
const ResultadosBono = lazy(() => import('@/pages/ResultadosBono'));
const GestionAvisos = lazy(() => import('@/pages/GestionAvisos'));
const Sistemas = lazy(() => import('@/pages/Sistemas'));
const GestionISO = lazy(() => import('@/pages/GestionISO'));
const AnalisisISO = lazy(() => import('@/pages/AnalisisISO'));
const GestionMejoras = lazy(() => import('@/pages/GestionMejoras'));


function App() {
  const location = useLocation();
  const authed = !!getToken();
  const { logout, isImpersonating, stopImpersonating, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Handle inactivity: log out and show overlay
  const handleInactivity = useCallback(() => {
    // Si estamos enmascarando, primero volvemos a admin o simplemente deslogueamos
    stopImpersonating();
    logout();
    setTimedOut(true);
  }, [logout, stopImpersonating]);

  // Only run the timer when the user is authenticated
  useInactivityTimer(handleInactivity, 600_000, authed);

  // Ocultamos el navbar en /login
  const showNavbar = authed && location.pathname !== '/login';

  // Locked-out overlay
  if (timedOut) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-[9999] text-center px-6">
        <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-2xl" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-2xl">
            <Clock className="w-9 h-9 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight mb-2">Sesión cerrada por inactividad</h1>
            <p className="text-slate-400 text-sm max-w-xs">Tu sesión fue cerrada automáticamente por seguridad después de 10 minutos sin actividad.</p>
          </div>
          <button
            onClick={() => {
              setTimedOut(false);
              window.location.href = '/login';
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-lg hover:shadow-blue-500/30 transition-all"
          >
            <LogIn className="w-4 h-4" />
            Iniciar sesión nuevamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isImpersonating && (
        <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-[100] shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-1.5 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-sm font-bold">
              MODO ENMASCARADO: <span className="opacity-80 font-normal">Viendo como</span> {user?.nombre || user?.apellido || 'Usuario'}
            </div>
          </div>
          <button
            onClick={() => {
              stopImpersonating();
              window.location.href = "/sistemas";
            }}
            className="bg-white text-rose-600 hover:bg-rose-50 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
          >
            Volver a modo Admin
          </button>
        </div>
      )}

      {showNavbar && <Navbar />}

      <main className="main-content">
        <Suspense fallback={<Spinner />}>
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<Login />} />

            {/* Protegidas */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />

            <Route
              path="/gestion-estructura"
              element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'visor']} allowReferente={true}>
                <GestionEstructura />
              </RequireAuth>
              }
            />

            <Route
              path="/nomina/legajo/:id"
              element={
                <RequireAuth allowReferente={true}>
                  <LegajoEmpleado />
                </RequireAuth>
              }
            />

            <Route
              path="/rrhh-evaluaciones"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <RRHHEvaluaciones />
                </RequireAuth>
              }
            />
            <Route
              path="/seguimiento"
              element={<RequireAuth allow={['directivo', 'rrhh', 'jefe_area', 'jefe_sector', 'superadmin', 'visor']} allowReferente={true}>
                <DashboardDesempeno />
              </RequireAuth>
              }
            />

            {/* Dashboard individual */}
            <Route
              path="/mi-desempeno"
              element={
                <RequireAuth>
                  <MiDesempeno />
                </RequireAuth>
              }
            />
            {/* Página dedicada de evaluación (reemplaza el modal) */}
            <Route
              path="/evaluacion/:plantillaId/:periodo/:empleadoId?"
              element={
                <RequireAuth
                  allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'jefe_sector']}
                  allowReferente={true}
                >
                  <EvaluacionFlujo />
                </RequireAuth>
              }
            />


            <Route
              path="/nomina"
              element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                <Nomina />
              </RequireAuth>
              }
            />
            <Route
              path="/plantillas"
              element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'jefe_sector']}>
                <GestionPlantillas />
              </RequireAuth>
              }
            />

            {/* Editor de asignación (ajustar pesos / excluir personas) */}
            <Route
              path="/asignaciones"
              element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'jefe_sector']}>
                <EditorAsignacion />
              </RequireAuth>
              }
            />

            <Route
              path="/configuracion-bono"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <ConfiguracionBono />
                </RequireAuth>
              }
            />

            <Route
              path="/gestion-avisos"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <GestionAvisos />
                </RequireAuth>
              }
            />

            <Route
              path="/resultados-bono"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <ResultadosBono />
                </RequireAuth>
              }
            />
            <Route
              path="/gestion-departamentos"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'jefe_sector']}>
                  <GestionDepartamentos />
                </RequireAuth>
              }
            />
            <Route
              path="/gestion-iso"
              element={
                <RequireAuth allow={['superadmin']} allowCalidad={true}>
                  <GestionISO />
                </RequireAuth>
              }
            />
            <Route
              path="/analisis-iso"
              element={
                <RequireAuth allow={['superadmin']} allowCalidad={true}>
                  <AnalisisISO />
                </RequireAuth>
              }
            />
            <Route
              path="/seguimiento-ejecutivo"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area', 'jefe_sector']}>
                  <SeguimientoEjecutivo />
                </RequireAuth>
              }
            />

            <Route
              path="/gestion-mejoras"
              element={
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <GestionMejoras />
                </RequireAuth>
              }
            />

            <Route path="/complete-invite" element={<CompleteInvite />} />

            <Route
              path="/sistemas"
              element={
                <RequireAuth allow={['superadmin']}>
                  <Sistemas />
                </RequireAuth>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireAuth allow={['superadmin']}>
                  <Sistemas />
                </RequireAuth>
              }
            />
            <Route
              path="/roles"
              element={
                <RequireAuth allow={['superadmin']}>
                  <Sistemas />
                </RequireAuth>
              }
            />

            <Route
              path="/simulador"
              element={
                <RequireAuth allow={['superadmin', 'rrhh', 'directivo', 'jefe_area', 'jefe_sector']}>
                  <SimuladorObjetivos />
                </RequireAuth>
              }
            />

            <Route
              path="/versiones-timeline"
              element={
                <RequireAuth allow={['superadmin', 'rrhh', 'directivo', 'jefe_area', 'jefe_sector']}>
                  <VersionesTimelinePage />
                </RequireAuth>
              }
            />



            <Route path="/403" element={<Forbidden />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BonoBot />
      <Toaster richColors position="top-right" />
    </>
  );
}

export default App;
