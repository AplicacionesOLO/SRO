export interface Dock {
  id: string;
  name: string;
  category: 'recepcion' | 'despacho' | 'zona_franca';
  status: 'disponible' | 'ocupado' | 'bloqueado' | 'danado';
  order: number;
}

export interface DockStatus {
  id: string;
  name: string;
  color: string;
}

export interface DockReservation {
  id: string;
  dockId: string;
  startDateTime: string;
  endDateTime: string;
  dua: string;
  invoice: string;
  driver: string;
  statusId: string;
  notes: string;
  files: ReservationFile[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}
