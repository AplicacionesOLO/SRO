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
  { path: '/', element: <Navigate to="/calendario" replace /> },
  { 
    path: '/dashboard', 
    element: (
      <RequirePermission permission="menu.dashboard.view" fallbackPath="/calendario">
        <Dashboard />
      </RequirePermission>
    )
  },
  { path: '/calendario', element: <Calendario /> },
  { path: '/reservas', element: <Reservas /> },
  { path: '/andenes', element: <Andenes /> },
  { 
    path: '/manpower', 
    element: (
      <RequirePermission permission="manpower.view">
        <ManpowerPage />
      </RequirePermission>
    )
  },
  { 
    path: '/casetilla', 
    element: (
      <RequirePermission permission="casetilla.view">
        <CasetillaPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin', 
    element: (
      <RequirePermission requireAnyAdmin>
        <AdminPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/matriz-permisos', 
    element: (
      <RequirePermission permission="admin.matrix.view">
        <MatrizPermisosPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/usuarios', 
    element: (
      <RequirePermission permission="admin.users.view">
        <UsuariosPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/roles', 
    element: (
      <RequirePermission permission="admin.roles.view">
        <RolesPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/catalogos', 
    element: (
      <RequirePermission requireAnyAdmin>
        <CatalogosPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/almacenes', 
    element: (
      <RequirePermission permission="warehouses.view">
        <AlmacenesPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/clientes', 
    element: (
      <RequirePermission permission="admin.clients.view">
        <ClientesPage />
      </RequirePermission>
    )
  },
  { 
    path: '/admin/correspondencia', 
    element: (
      <RequirePermission permission="correspondence.view">
        <CorrespondenciaPage />
      </RequirePermission>
    )
  },
  { path: '/perfil', element: <PerfilPage /> },
  { path: '/access-pending', element: <AccessPending /> },
  { path: '/login', element: <Login /> },
  { path: '*', element: <NotFound /> },
];

export default routes;
