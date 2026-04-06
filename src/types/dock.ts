export interface Dock {
  id: string;
  name: string;
  reference?: string | null;
  header_color?: string | null;
  category: 'recepcion' | 'despacho' | 'zona_franca';
  status: 'disponible' | 'ocupado' | 'bloqueado' | 'danado';
  order: number;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  location?: string | null;
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
