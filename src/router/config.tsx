import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Login from "../pages/login/page";
import Dashboard from "../pages/dashboard/page";
import Calendario from "../pages/calendario/page";
import Admin from "../pages/admin/page";
import Andenes from "../pages/andenes/page";
import Reservas from "../pages/reservas/page";
import MatrizPermisos from "../pages/admin/matriz-permisos/page";
import AccessPending from "../pages/access-pending/page";
import { lazy } from "react";
import RequirePermission from "./RequirePermission";
import ProtectedRoute from "./ProtectedRoute";

const AdminPage = lazy(() => import('../pages/admin/page'));
const MatrizPermisosPage = lazy(() => import('../pages/admin/matriz-permisos/page'));
const UsuariosPage = lazy(() => import('../pages/admin/usuarios/page'));
const RolesPage = lazy(() => import('../pages/admin/roles/page'));
const CatalogosPage = lazy(() => import('../pages/admin/catalogos/page'));
const AlmacenesPage = lazy(() => import('../pages/admin/almacenes/page'));
const ClientesPage = lazy(() => import('../pages/admin/clientes/page'));
const CorrespondenciaPage = lazy(() => import('../pages/admin/correspondencia/page'));
const ManpowerPage = lazy(() => import('../pages/manpower/page'));
const CasetillaPage = lazy(() => import('../pages/casetilla/page'));

const PerfilPage = lazy(() => import('../pages/perfil/page'));

const routes: RouteObject[] = [
  { 
    path: '/', 
    element: (
      <ProtectedRoute>
        <Navigate to="/calendario" replace />
      </ProtectedRoute>
    )
  },
  { 
    path: '/dashboard', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="menu.dashboard.view" fallbackPath="/calendario">
          <Dashboard />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/calendario', 
    element: (
      <ProtectedRoute>
        <Calendario />
      </ProtectedRoute>
    )
  },
  { 
    path: '/reservas', 
    element: (
      <ProtectedRoute>
        <Reservas />
      </ProtectedRoute>
    )
  },
  { 
    path: '/andenes', 
    element: (
      <ProtectedRoute>
        <Andenes />
      </ProtectedRoute>
    )
  },
  { 
    path: '/manpower', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="manpower.view">
          <ManpowerPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/casetilla', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="casetilla.view">
          <CasetillaPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin', 
    element: (
      <ProtectedRoute>
        <RequirePermission requireAnyAdmin>
          <AdminPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/matriz-permisos', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="admin.matrix.view">
          <MatrizPermisosPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/usuarios', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="admin.users.view">
          <UsuariosPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/roles', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="admin.roles.view">
          <RolesPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/catalogos', 
    element: (
      <ProtectedRoute>
        <RequirePermission requireAnyAdmin>
          <CatalogosPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/almacenes', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="warehouses.view">
          <AlmacenesPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/clientes', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="admin.clients.view">
          <ClientesPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/admin/correspondencia', 
    element: (
      <ProtectedRoute>
        <RequirePermission permission="correspondence.view">
          <CorrespondenciaPage />
        </RequirePermission>
      </ProtectedRoute>
    )
  },
  { 
    path: '/perfil', 
    element: (
      <ProtectedRoute>
        <PerfilPage />
      </ProtectedRoute>
    )
  },
  { path: '/access-pending', element: <AccessPending /> },
  { path: '/login', element: <Login /> },
  { path: '*', element: <NotFound /> },
];

export default routes;