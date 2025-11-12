import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import RequireAuth from '@/components/RequireAuth';
import Navbar from '@/components/Navbar';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getToken } from '@/lib/api';
import { Toaster } from "@/components/ui/sonner"; 
import EvaluacionFlujo from '@/pages/EvaluacionFlujo';
import LegajoEmpleado from '@/pages/LegajoEmpleado.jsx';
// Importar Paginas
import GestionEstructura from '@/pages/GestionNomina';

import SeguimientoEjecutivo from '@/pages/SeguimientoEjecutivo';
import Login from '@/pages/Login';
import Forbidden from '@/pages/Forbidden';
import DashboardDesempeno from '@/pages/SeguimientoReferente';
import MiDesempeno from '@/pages/MiDesempeno';    
import Home from '@/pages/Home';
import Nomina from '@/pages/Nomina';
import GestionPlantillas from '@/pages/GestionPlantillas';
import EditorAsignacion from '@/pages/EditorAsignacion';
import CompleteInvite from '@/components/CompleteInvite';
import UsuariosAdmin from '@/pages/UsuariosAdmin';
import GestionDepartamentos from './pages/GestionDepartamentos';


function App() {
  const location = useLocation();
  const authed = !!getToken();

  // Ocultamos el navbar en /login
  const showNavbar = authed && location.pathname !== '/login';

  return (
    <>
      {showNavbar && <Navbar />}

      <main className="main-content">
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
element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh', 'jefe_area']} allowReferente={true}>
      <GestionEstructura />
    </RequireAuth>
  }
/>

           <Route
   path="/nomina/legajo/:id"
   element={
     <RequireAuth allow={['superadmin', 'directivo', 'rrhh']} allowReferente={true}>
       <LegajoEmpleado />
     </RequireAuth>
   }
 />

         <Route
      path="/seguimiento"
element={<RequireAuth allow={['directivo','rrhh','jefe_area','jefe_sector','superadmin']} allowReferente={true}>
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
                allow={['superadmin','directivo','rrhh','jefe_area','jefe_sector']}
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
         element={<RequireAuth allow={['superadmin', 'directivo', 'rrhh']}>
               <GestionPlantillas />
            </RequireAuth>
           }
         />

         {/* Editor de asignación (ajustar pesos / excluir personas) */}
         <Route
           path="/asignaciones"
           element={<RequireAuth allow={['superadmin','directivo','rrhh','jefe_area','jefe_sector']}>
               <EditorAsignacion />
             </RequireAuth>
           }
         />
                     <Route
            path="/gestion-departamentos"
            element={
              <RequireAuth allow={['superadmin','directivo','rrhh','jefe_area','jefe_sector']}>
                <GestionDepartamentos />
              </RequireAuth>
            }
          />
              <Route
            path="/seguimiento-ejecutivo"
            element={
              <RequireAuth allow={['superadmin','directivo','rrhh','jefe_area','jefe_sector']}>
                <SeguimientoEjecutivo />
              </RequireAuth>
            }
          />

<Route path="/complete-invite" element={<CompleteInvite />} />

<Route
  path="/usuarios"
  element={
    <RequireAuth allow={['superadmin','rrhh']}>
      <UsuariosAdmin />
    </RequireAuth>
  }
/>
        


            <Route path="/403" element={<Forbidden />} />

  {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ToastContainer position="top-left" autoClose={2200} theme="colored" newestOnTop />
      <Toaster richColors position="top-right" />
    </>
  );
}

export default App;
