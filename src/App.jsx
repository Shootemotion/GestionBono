import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Navbar from '@/components/Navbar';
import BonoBot from "@/components/BonoBot/BonoBot";
import { getToken } from '@/lib/api';
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from '@/components/ui/spinner';

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


function App() {
  const location = useLocation();
  const authed = !!getToken();

  // Ocultamos el navbar en /login
  const showNavbar = authed && location.pathname !== '/login';

  return (
    <>
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
                <RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
                  <GestionISO />
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
