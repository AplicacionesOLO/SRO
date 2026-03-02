export type ReservationStatus = 
  | 'Reservado'
  | 'Confirmado'
  | 'No arribó'
  | 'Arribó (pendiente descarga)'
  | 'Espera de liberación'
  | 'Ingreso en puerta'
  | 'En ingreso'
  | 'En descarga'
  | 'Descargado - pendiente ingreso'
  | 'Despachado'
  | 'Ingresado - pendiente cierre'
  | 'Finalizado'
  | 'Cancelado';

export type LoadType = 'Nacional' | 'Nacional-Pesado';

export type TransportType = 'Camión';

export interface Reservation {
  id: string;
  orderNumber?: string;
  supplier: string;
  purchaseOrder: string;
  truckPlate: string;
  driver?: string;
  transportType: TransportType;
  loadType: LoadType;
  reservationDate: string;
  reservationTime: string;
  duration: number;
  status: ReservationStatus;
  dockId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Nuevos campos agregados
  orderRequestNumber?: string;
  shipperProvider?: string;
  recurrence?: any;
}

export interface Document {
  id: string;
  reservationId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

export interface AuditLog {
  id: string;
  reservationId: string;
  eventType: 'created' | 'updated' | 'status_changed' | 'document_uploaded' | 'document_deleted';
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface Dock {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}
