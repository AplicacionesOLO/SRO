export const dockStatuses = [
  { id: '1', name: 'Libre', color: '#10b981' },
  { id: '2', name: 'Ocupado', color: '#f59e0b' },
  { id: '3', name: 'En descarga', color: '#3b82f6' },
  { id: '4', name: 'Dañado', color: '#ef4444' },
  { id: '5', name: 'Cargando', color: '#8b5cf6' },
  { id: '6', name: 'Bloqueado', color: '#6b7280' },
  { id: '7', name: 'Mantenimiento', color: '#f97316' }
];

export const docks = Array.from({ length: 40 }, (_, i) => {
  const num = i + 1;
  let category: 'recepcion' | 'despacho' | 'zona_franca';
  
  if (num <= 15) {
    category = 'recepcion';
  } else if (num <= 30) {
    category = 'despacho';
  } else {
    category = 'zona_franca';
  }

  return {
    id: `dock-${num}`,
    name: `Andén ${num}`,
    category,
    status: 'disponible' as const,
    order: num
  };
});

export const dockReservations = [
  {
    id: 'res-1',
    dockId: 'dock-1',
    startDateTime: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
    endDateTime: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
    dua: 'DUA-2024-001',
    invoice: 'FAC-001',
    driver: 'Carlos Méndez',
    statusId: '2',
    notes: 'Carga prioritaria',
    files: [],
    createdBy: 'admin@sistema.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'res-2',
    dockId: 'dock-3',
    startDateTime: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
    endDateTime: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
    dua: 'DUA-2024-002',
    invoice: 'FAC-002',
    driver: 'María González',
    statusId: '3',
    notes: 'Mercancía frágil',
    files: [],
    createdBy: 'gestor@sistema.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'res-3',
    dockId: 'dock-5',
    startDateTime: new Date(new Date().setHours(13, 0, 0, 0)).toISOString(),
    endDateTime: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(),
    dua: 'DUA-2024-003',
    invoice: 'FAC-003',
    driver: 'Pedro Ramírez',
    statusId: '1',
    notes: '',
    files: [],
    createdBy: 'admin@sistema.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'res-4',
    dockId: 'dock-2',
    startDateTime: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
    endDateTime: new Date(new Date().setHours(16, 30, 0, 0)).toISOString(),
    dua: 'DUA-2024-004',
    invoice: 'FAC-004',
    driver: 'Ana Torres',
    statusId: '2',
    notes: 'Requiere inspección',
    files: [],
    createdBy: 'gestor@sistema.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];
