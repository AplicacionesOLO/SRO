import type { Reservation, Document, AuditLog, Dock } from '../types/reservation';

export const mockDocks: Dock[] = [
  { id: '1', name: 'Andén 1', isActive: true, createdAt: '2024-01-01T08:00:00Z' },
  { id: '2', name: 'Andén 2', isActive: true, createdAt: '2024-01-01T08:00:00Z' },
  { id: '3', name: 'Andén 3', isActive: true, createdAt: '2024-01-01T08:00:00Z' },
  { id: '4', name: 'Andén 4', isActive: true, createdAt: '2024-01-01T08:00:00Z' },
  { id: '5', name: 'Andén 5', isActive: true, createdAt: '2024-01-01T08:00:00Z' },
  { id: '6', name: 'Andén 6', isActive: true, createdAt: '2024-01-01T08:00:00Z' }
];

export const mockReservations: Reservation[] = [
  {
    id: '1',
    orderNumber: 'PED-2024-001',
    supplier: 'Transportes García S.A.',
    purchaseOrder: 'OC-45678',
    truckPlate: 'ABC-1234',
    driver: 'Juan Pérez',
    transportType: 'Camión',
    loadType: 'Nacional',
    reservationDate: '2025-01-15',
    reservationTime: '08:00',
    duration: 60,
    status: 'En descarga',
    dockId: '1',
    createdBy: '1',
    createdAt: '2025-01-10T10:30:00Z',
    updatedAt: '2025-01-15T08:15:00Z'
  },
  {
    id: '2',
    orderNumber: 'PED-2024-002',
    supplier: 'Logística del Norte',
    purchaseOrder: 'OC-45679',
    truckPlate: 'XYZ-5678',
    driver: 'María López',
    transportType: 'Camión',
    loadType: 'Nacional-Pesado',
    reservationDate: '2025-01-15',
    reservationTime: '10:00',
    duration: 90,
    status: 'Confirmado',
    dockId: '2',
    createdBy: '2',
    createdAt: '2025-01-11T14:20:00Z',
    updatedAt: '2025-01-14T16:00:00Z'
  },
  {
    id: '3',
    orderNumber: 'PED-2024-003',
    supplier: 'Distribuidora Central',
    purchaseOrder: 'OC-45680',
    truckPlate: 'DEF-9012',
    driver: 'Carlos Ramírez',
    transportType: 'Camión',
    loadType: 'Nacional',
    reservationDate: '2025-01-15',
    reservationTime: '14:00',
    duration: 60,
    status: 'Reservado',
    dockId: '3',
    createdBy: '1',
    createdAt: '2025-01-12T09:15:00Z',
    updatedAt: '2025-01-12T09:15:00Z'
  },
  {
    id: '4',
    orderNumber: 'PED-2024-004',
    supplier: 'Transportes Rápidos',
    purchaseOrder: 'OC-45681',
    truckPlate: 'GHI-3456',
    driver: 'Ana Martínez',
    transportType: 'Camión',
    loadType: 'Nacional',
    reservationDate: '2025-01-16',
    reservationTime: '09:00',
    duration: 60,
    status: 'Confirmado',
    dockId: '1',
    createdBy: '2',
    createdAt: '2025-01-13T11:00:00Z',
    updatedAt: '2025-01-14T15:30:00Z'
  },
  {
    id: '5',
    orderNumber: 'PED-2024-005',
    supplier: 'Carga Express',
    purchaseOrder: 'OC-45682',
    truckPlate: 'JKL-7890',
    driver: 'Roberto Sánchez',
    transportType: 'Camión',
    loadType: 'Nacional-Pesado',
    reservationDate: '2025-01-16',
    reservationTime: '11:30',
    duration: 90,
    status: 'Reservado',
    dockId: '4',
    createdBy: '1',
    createdAt: '2025-01-13T16:45:00Z',
    updatedAt: '2025-01-13T16:45:00Z'
  },
  {
    id: '6',
    orderNumber: 'PED-2024-006',
    supplier: 'Logística del Sur',
    purchaseOrder: 'OC-45683',
    truckPlate: 'MNO-2345',
    driver: 'Laura Fernández',
    transportType: 'Camión',
    loadType: 'Nacional',
    reservationDate: '2025-01-14',
    reservationTime: '15:00',
    duration: 60,
    status: 'Finalizado',
    dockId: '2',
    createdBy: '2',
    createdAt: '2025-01-10T08:00:00Z',
    updatedAt: '2025-01-14T16:30:00Z'
  },
  {
    id: '7',
    orderNumber: 'PED-2024-007',
    supplier: 'Transportes del Este',
    purchaseOrder: 'OC-45684',
    truckPlate: 'PQR-6789',
    driver: 'Miguel Torres',
    transportType: 'Camión',
    loadType: 'Nacional',
    reservationDate: '2025-01-14',
    reservationTime: '10:00',
    duration: 60,
    status: 'No arribó',
    dockId: '5',
    createdBy: '1',
    createdAt: '2025-01-12T13:20:00Z',
    updatedAt: '2025-01-14T11:00:00Z'
  },
  {
    id: '8',
    orderNumber: 'PED-2024-008',
    supplier: 'Distribuciones Oeste',
    purchaseOrder: 'OC-45685',
    truckPlate: 'STU-0123',
    driver: 'Patricia Gómez',
    transportType: 'Camión',
    loadType: 'Nacional-Pesado',
    reservationDate: '2025-01-17',
    reservationTime: '08:30',
    duration: 90,
    status: 'Confirmado',
    dockId: '3',
    createdBy: '2',
    createdAt: '2025-01-14T10:00:00Z',
    updatedAt: '2025-01-14T17:00:00Z'
  }
];

export const mockDocuments: Document[] = [
  {
    id: '1',
    reservationId: '1',
    fileName: 'orden_compra_45678.pdf',
    fileType: 'application/pdf',
    fileSize: 245678,
    uploadedBy: '1',
    uploadedAt: '2025-01-10T11:00:00Z',
    url: '#'
  },
  {
    id: '2',
    reservationId: '1',
    fileName: 'guia_remision.pdf',
    fileType: 'application/pdf',
    fileSize: 189234,
    uploadedBy: '1',
    uploadedAt: '2025-01-10T11:05:00Z',
    url: '#'
  },
  {
    id: '3',
    reservationId: '2',
    fileName: 'factura_transporte.pdf',
    fileType: 'application/pdf',
    fileSize: 312456,
    uploadedBy: '2',
    uploadedAt: '2025-01-11T14:30:00Z',
    url: '#'
  }
];

export const mockAuditLogs: AuditLog[] = [
  {
    id: '1',
    reservationId: '1',
    eventType: 'created',
    userId: '1',
    userName: 'Administrador',
    timestamp: '2025-01-10T10:30:00Z'
  },
  {
    id: '2',
    reservationId: '1',
    eventType: 'status_changed',
    fieldChanged: 'status',
    oldValue: 'Reservado',
    newValue: 'Confirmado',
    userId: '1',
    userName: 'Administrador',
    timestamp: '2025-01-14T09:00:00Z'
  },
  {
    id: '3',
    reservationId: '1',
    eventType: 'status_changed',
    fieldChanged: 'status',
    oldValue: 'Confirmado',
    newValue: 'Arribó (pendiente descarga)',
    userId: '2',
    userName: 'Gestor',
    timestamp: '2025-01-15T08:05:00Z'
  },
  {
    id: '4',
    reservationId: '1',
    eventType: 'status_changed',
    fieldChanged: 'status',
    oldValue: 'Arribó (pendiente descarga)',
    newValue: 'En descarga',
    userId: '2',
    userName: 'Gestor',
    timestamp: '2025-01-15T08:15:00Z'
  },
  {
    id: '5',
    reservationId: '1',
    eventType: 'document_uploaded',
    fieldChanged: 'documents',
    newValue: 'orden_compra_45678.pdf',
    userId: '1',
    userName: 'Administrador',
    timestamp: '2025-01-10T11:00:00Z'
  }
];
