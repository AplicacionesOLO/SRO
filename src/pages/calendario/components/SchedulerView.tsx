import { useState, useRef, useEffect } from 'react';
import { Dock, DockReservation, DockStatus } from '../../../types/dock';

interface SchedulerViewProps {
  docks: Dock[];
  reservations: DockReservation[];
  statuses: DockStatus[];
  viewMode: 'day' | 'week' | 'month';
  currentDate: Date;
  selectedWarehouseId: string | null;
  warehouses: any[];
  onCellClick: (dockId: string, date: Date, time: string) => void;
  onReservationClick: (reservation: DockReservation) => void;
  onReservationDrop: (reservationId: string, newDockId: string, newStartDateTime: string) => void;
}

export default function SchedulerView({
  docks,
  reservations,
  statuses,
  viewMode,
  currentDate,
  selectedWarehouseId,
  warehouses,
  onCellClick,
  onReservationClick,
  onReservationDrop
}: SchedulerViewProps) {
  const [draggedReservation, setDraggedReservation] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 6 * 60;
    }
  }, []);

  // Obtener configuración de horarios del almacén seleccionado
  const getWarehouseConfig = () => {
    // Si no hay almacén seleccionado o es "todos", usar horario fijo 5:00 - 20:00
    if (!selectedWarehouseId || selectedWarehouseId === 'all') {
      return {
        startTime: '05:00',
        endTime: '20:00',
        slotInterval: 30
      };
    }

    const warehouse = warehouses.find(w => w.id === selectedWarehouseId);
    if (!warehouse) {
      return {
        startTime: '05:00',
        endTime: '20:00',
        slotInterval: 30
      };
    }

    return {
      startTime: warehouse.business_start_time?.substring(0, 5) || '05:00',
      endTime: warehouse.business_end_time?.substring(0, 5) || '20:00',
      slotInterval: warehouse.slot_interval_minutes || 30
    };
  };

  const getTimeSlots = () => {
    const config = getWarehouseConfig();
    const [startHour, startMinute] = config.startTime.split(':').map(Number);
    const [endHour, endMinute] = config.endTime.split(':').map(Number);
    const interval = config.slotInterval;

    const slots = [];
    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    while (currentMinutes < endMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const minute = currentMinutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      currentMinutes += interval;
    }

    return slots;
  };

  const getDaysInView = () => {
    const days = [];
    if (viewMode === 'day') {
      days.push(new Date(currentDate));
    } else if (viewMode === 'week') {
      for (let i = 0; i < 3; i++) {
        const day = new Date(currentDate);
        day.setDate(currentDate.getDate() + i);
        days.push(day);
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const day = new Date(currentDate);
        day.setDate(currentDate.getDate() + i);
        days.push(day);
      }
    }
    return days;
  };

  const formatDate = (date: Date) => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const getReservationsForDockAndDay = (dockId: string, date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return reservations.filter(res => {
      if (res.dockId !== dockId) return false;
      const resStart = new Date(res.startDateTime);
      const resEnd = new Date(res.endDateTime);
      return resStart < dayEnd && resEnd > dayStart;
    });
  };

  const calculateReservationPosition = (reservation: DockReservation, date: Date) => {
    const config = getWarehouseConfig();
    const [startHour, startMinute] = config.startTime.split(':').map(Number);
    const slotInterval = config.slotInterval;
    
    const dayStart = new Date(date);
    dayStart.setHours(startHour, startMinute, 0, 0);
    
    const resStart = new Date(reservation.startDateTime);
    const resEnd = new Date(reservation.endDateTime);
    
    const startMinutes = (resStart.getTime() - dayStart.getTime()) / (1000 * 60);
    const durationMinutes = (resEnd.getTime() - resStart.getTime()) / (1000 * 60);
    
    const slotHeight = 60;
    const top = (startMinutes / slotInterval) * slotHeight;
    const height = (durationMinutes / slotInterval) * slotHeight;
    
    return { top: `${top}px`, height: `${Math.max(height, 40)}px` };
  };

  const getStatusColor = (statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.color || '#6b7280';
  };

  const getStatusName = (statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.name || 'Sin estado';
  };

  // Helper seguro para obtener el color de la categoría
  const getCategoryColor = (category: any): string => {
    // Si es null/undefined, retornar color por defecto
    if (!category) return '#6b7280';
    
    // Si es un objeto con color, usarlo
    if (typeof category === 'object' && category.color) {
      return category.color;
    }
    
    // Si es string, usar el mapeo existente
    if (typeof category === 'string') {
      const colors: Record<string, string> = {
        recepcion: '#3b82f6',
        despacho: '#10b981',
        zona_franca: '#f59e0b'
      };
      return colors[category] || '#6b7280';
    }
    
    // Fallback por defecto
    return '#6b7280';
  };

  // Helper seguro para obtener el label de la categoría
  const getCategoryLabel = (category: any): string => {
    // Si es null/undefined, retornar vacío
    if (!category) return '';
    
    // Si es string, reemplazar guiones bajos
    if (typeof category === 'string') {
      return category.replace(/_/g, ' ');
    }
    
    // Si es objeto, intentar obtener name, code o convertir a string
    if (typeof category === 'object') {
      return (category.name ?? category.code ?? '').toString();
    }
    
    // Fallback: convertir a string
    return String(category);
  };

  const handleDragStart = (e: React.DragEvent, reservationId: string) => {
    setDraggedReservation(reservationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dockId: string, date: Date, timeSlot: string) => {
    e.preventDefault();
    if (!draggedReservation) return;

    const [hour, minute] = timeSlot.split(':').map(Number);
    const newStartDateTime = new Date(date);
    newStartDateTime.setHours(hour, minute, 0, 0);

    onReservationDrop(draggedReservation, dockId, newStartDateTime.toISOString());
    setDraggedReservation(null);
  };

  const timeSlots = getTimeSlots();
  const days = getDaysInView();
  const config = getWarehouseConfig();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-lg border border-gray-200">
      <div className="flex border-b border-gray-200 bg-gray-50">
        <div className="w-20 flex-shrink-0 border-r border-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
          Hora
        </div>
        
        {docks.map(dock => (
          <div key={dock.id} className="w-[200px] min-w-[200px] flex-shrink-0 border-r border-gray-200">
            <div 
              className="h-16 px-3 py-2 flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: `${getCategoryColor(dock.category)}15` }}
            >
              <div 
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: getCategoryColor(dock.category) }}
              >
                {dock.name}
              </div>
              <div className="text-[10px] text-gray-500 capitalize">
                {getCategoryLabel(dock.category)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="flex" style={{ minHeight: `${timeSlots.length * 60}px` }}>
          <div className="w-20 flex-shrink-0 border-r border-gray-200 bg-gray-50">
            {timeSlots.map(time => (
              <div
                key={time}
                className="h-[60px] border-b border-gray-100 flex items-start justify-center pt-1 text-xs text-gray-500 font-medium"
              >
                {time}
              </div>
            ))}
          </div>

          {docks.map(dock => (
            <div key={dock.id} className="w-[200px] min-w-[200px] flex-shrink-0 border-r border-gray-200 relative">
              {days.map((day, dayIdx) => {
                const dayReservations = getReservationsForDockAndDay(dock.id, day);
                const dayStart = new Date(day);
                dayStart.setHours(0, 0, 0, 0);
                const dayWidth = 100 / days.length;
                const leftPosition = dayIdx * dayWidth;

                return (
                  <div 
                    key={dayIdx}
                    className="absolute top-0 bottom-0"
                    style={{ 
                      left: `${leftPosition}%`, 
                      width: `${dayWidth}%`,
                      borderRight: dayIdx < days.length - 1 ? '1px solid #f3f4f6' : 'none'
                    }}
                  >
                    {timeSlots.map(time => (
                      <div
                        key={time}
                        className="h-[60px] border-b border-gray-100 hover:bg-teal-50/30 transition-colors cursor-pointer group relative"
                        onClick={() => onCellClick(dock.id, day, time)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dock.id, day, time)}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <i className="ri-add-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center"></i>
                        </div>
                      </div>
                    ))}

                    {dayReservations.map(reservation => {
                      const position = calculateReservationPosition(reservation, day);
                      const status = statuses.find(s => s.id === reservation.statusId);
                      
                      return (
                        <div
                          key={reservation.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, reservation.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onReservationClick(reservation);
                          }}
                          className="absolute left-1 right-1 rounded-lg shadow-md hover:shadow-lg transition-all cursor-move overflow-hidden z-10 border-l-4"
                          style={{
                            top: position.top,
                            height: position.height,
                            backgroundColor: `${getStatusColor(reservation.statusId)}20`,
                            borderLeftColor: getStatusColor(reservation.statusId)
                          }}
                        >
                          <div className="p-2 h-full flex flex-col">
                            <div 
                              className="text-[10px] font-bold uppercase tracking-wide mb-1 px-2 py-0.5 rounded inline-block self-start"
                              style={{ 
                                backgroundColor: getStatusColor(reservation.statusId),
                                color: 'white'
                              }}
                            >
                              {getStatusName(reservation.statusId)}
                            </div>
                            <div className="text-xs font-semibold text-gray-900 truncate mb-1">
                              {reservation.driver}
                            </div>
                            <div className="text-[11px] text-gray-600 truncate">
                              DUA: {reservation.dua}
                            </div>
                            <div className="text-[11px] text-gray-600 truncate">
                              {reservation.invoice}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-auto">
                              {new Date(reservation.startDateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - 
                              {new Date(reservation.endDateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
