import type { MenuItem } from './types';

export const TECH_PATTERN = `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%232DD4BF' stroke-opacity='0.07' stroke-width='0.5'%3E%3Cpath d='M40 4 L68 20 L68 52 L40 68 L12 52 L12 20 Z'/%3E%3Ccircle cx='40' cy='36' r='1.2' fill='%232DD4BF' fill-opacity='0.10'/%3E%3Ccircle cx='12' cy='36' r='0.6' fill='%232DD4BF' fill-opacity='0.07'/%3E%3Ccircle cx='68' cy='36' r='0.6' fill='%232DD4BF' fill-opacity='0.07'/%3E%3C/g%3E%3Cg fill='none' stroke='%232DD4BF' stroke-opacity='0.04' stroke-width='0.3'%3E%3Cpath d='M40 0 L40 76'/%3E%3Cpath d='M4 18 L76 18'/%3E%3Cpath d='M4 54 L76 54'/%3E%3C/g%3E%3C/svg%3E")`;

export const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'ri-dashboard-line',
    permission: 'menu.dashboard.view',
    section: 'Operaciones',
    mobilePrimary: true,
  },
  {
    label: 'Calendario',
    path: '/calendario',
    icon: 'ri-calendar-line',
    permission: 'menu.calendario.view',
    section: 'Operaciones',
    mobilePrimary: true,
  },
  {
    label: 'Reservas',
    path: '/reservas',
    icon: 'ri-file-list-line',
    permission: 'menu.reservas.view',
    section: 'Operaciones',
    mobilePrimary: true,
  },
  {
    label: 'Andenes',
    path: '/andenes',
    icon: 'ri-truck-line',
    permission: 'menu.andenes.view',
    section: 'Operaciones',
    mobilePrimary: true,
  },
  {
    label: 'Manpower',
    path: '/manpower',
    icon: 'ri-team-line',
    permission: 'menu.manpower.view',
    section: 'Operaciones',
  },
  {
    label: 'Punto Control IN/OUT',
    path: '/casetilla',
    icon: 'ri-door-open-line',
    permission: 'menu.casetilla.view',
    section: 'Operaciones',
  },
  {
    label: 'Administración',
    path: '/admin',
    icon: 'ri-settings-3-line',
    permission: 'menu.admin.view',
    section: 'Administración',
    children: [
      { label: 'Usuarios', path: '/admin/usuarios', icon: 'ri-user-line', permission: 'menu.admin.usuarios.view' },
      { label: 'Roles', path: '/admin/roles', icon: 'ri-shield-user-line', permission: 'menu.admin.roles.view' },
      { label: 'Matriz de Permisos', path: '/admin/matriz-permisos', icon: 'ri-key-line', permission: 'menu.admin.matriz_permisos.view' },
      { label: 'Catálogos', path: '/admin/catalogos', icon: 'ri-database-2-line', permission: 'menu.admin.catalogos.view' },
      { label: 'Almacenes', path: '/admin/almacenes', icon: 'ri-building-2-line', permission: 'menu.admin.almacenes.view' },
      { label: 'Clientes', path: '/admin/clientes', icon: 'ri-user-star-line', permission: 'menu.admin.clientes.view' },
      { label: 'Correspondencia', path: '/admin/correspondencia', icon: 'ri-mail-line', permission: 'menu.admin.correspondencia.view' },
      { label: 'Base de Conocimiento', path: '/conocimiento', icon: 'ri-book-open-line', permission: 'chat.documents.manage' },
      { label: 'Auditoría Chat', path: '/chat/auditoria', icon: 'ri-shield-check-line', permission: 'chat.audit.view' },
    ],
  },
];