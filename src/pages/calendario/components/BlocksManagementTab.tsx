import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { calendarService, type DockTimeBlock, type Dock } from '../../../services/calendarService';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import BlockModal from './BlockModal';

type FilterType = 'all' | 'manual' | 'client';
type FilterStatus = 'all' | 'active' | 'past';

const isClientPickupBlock = (reason: string) => reason?.startsWith('CLIENT_PICKUP:');

const formatDateTime = (dt: string) => {
  const d = new Date(dt);
  return d.toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateShort = (dt: string) => {
  const d = new Date(dt);
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function BlocksManagementTab() {
  const { can, orgId } = usePermissions();

  const [blocks, setBlocks] = useState<DockTimeBlock[]>([]);
  const [docks, setDocks] = useState<Dock[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDockId, setFilterDockId] = useState('all');
  const [filterType, setFilterType] = useState<FilterType>('manual');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active');

  // BlockModal
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<DockTimeBlock | null>(null);
  const [allowEdit, setAllowEdit] = useState(false);
  const [renewalMode, setRenewalMode] = useState(false);

  // Popup de renovación
  const [renewalConfirm, setRenewalConfirm] = useState<{ isOpen: boolean; block: DockTimeBlock | null }>({
    isOpen: false,
    block: null,
  });

  // Popup de eliminación
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; block: DockTimeBlock | null }>({
    isOpen: false,
    block: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canCreate = can('dock_blocks.create');
  const canUpdate = can('dock_blocks.update');
  const canDelete = can('dock_blocks.delete');
  const hasFullAccess = can('admin.matrix.update');

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [blocksData, docksData] = await Promise.all([
        calendarService.getAllDockTimeBlocksForManagement(orgId),
        calendarService.getDocks(orgId),
      ]);
      setBlocks(blocksData);
      setDocks(docksData);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const now = useMemo(() => new Date(), []);

  const filteredBlocks = useMemo(() => {
    return blocks.filter((block) => {
      // Tipo
      const isClient = isClientPickupBlock(block.reason);
      if (filterType === 'manual' && isClient) return false;
      if (filterType === 'client' && !isClient) return false;

      // Estado (activo/vencido)
      const endDt = new Date(block.end_datetime);
      if (filterStatus === 'active' && endDt < now) return false;
      if (filterStatus === 'past' && endDt >= now) return false;

      // Andén
      if (filterDockId !== 'all' && block.dock_id !== filterDockId) return false;

      // Búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const dockName = (block.dock?.name || '').toLowerCase();
        const reason = (block.reason || '').toLowerCase();
        const creatorName = (block.creator?.name || '').toLowerCase();
        if (!dockName.includes(term) && !reason.includes(term) && !creatorName.includes(term)) return false;
      }

      return true;
    });
  }, [blocks, filterType, filterStatus, filterDockId, searchTerm, now]);

  // Abrir BlockModal para crear
  const handleCreate = () => {
    setSelectedBlock(null);
    setAllowEdit(false);
    setRenewalMode(false);
    setBlockModalOpen(true);
  };

  // Abrir BlockModal para editar (directo)
  const handleEdit = (block: DockTimeBlock) => {
    setSelectedBlock(block);
    setAllowEdit(true);
    setRenewalMode(false);
    setBlockModalOpen(true);
  };

  // Abrir popup de confirmación de renovación
  const handleRenewClick = (block: DockTimeBlock) => {
    setRenewalConfirm({ isOpen: true, block });
  };

  // Confirmar renovación → abrir modal de edición con renewalMode
  const handleRenewConfirm = () => {
    const block = renewalConfirm.block;
    setRenewalConfirm({ isOpen: false, block: null });
    if (!block) return;
    setSelectedBlock(block);
    setAllowEdit(true);
    setRenewalMode(true);
    setBlockModalOpen(true);
  };

  // Abrir popup de confirmación de eliminación
  const handleDeleteClick = (block: DockTimeBlock) => {
    setDeleteConfirm({ isOpen: true, block });
  };

  // Confirmar eliminación
  const handleDeleteConfirm = async () => {
    const block = deleteConfirm.block;
    if (!block) return;
    setDeleteConfirm({ isOpen: false, block: null });
    try {
      setDeleteLoading(true);
      await calendarService.deleteDockTimeBlock(block.id);
      await loadData();
    } catch {
      // no-op
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleModalSave = async () => {
    setBlockModalOpen(false);
    setSelectedBlock(null);
    await loadData();
  };

  const handleModalClose = () => {
    setBlockModalOpen(false);
    setSelectedBlock(null);
    setAllowEdit(false);
    setRenewalMode(false);
  };

  const getBlockTypeBadge = (block: DockTimeBlock) => {
    if (isClientPickupBlock(block.reason)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 whitespace-nowrap">
          <i className="ri-user-line text-[10px]"></i>
          Cliente Retira
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
        <i className="ri-lock-line text-[10px]"></i>
        Manual
      </span>
    );
  };

  const getStatusBadge = (block: DockTimeBlock) => {
    const endDt = new Date(block.end_datetime);
    const isActive = endDt >= now;
    return isActive ? (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
        Activo
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 whitespace-nowrap">
        Vencido
      </span>
    );
  };

  const getDockName = (block: DockTimeBlock) => {
    if (block.dock?.name) return block.dock.name;
    const found = docks.find((d) => d.id === block.dock_id);
    return found?.name || block.dock_id.slice(0, 8) + '...';
  };

  const getReasonDisplay = (reason: string) => {
    if (isClientPickupBlock(reason)) {
      const parts = reason.split(':');
      return `Regla de cliente (ID: ${parts[1]?.slice(0, 8) || '?'}...)`;
    }
    return reason;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Gestión de Bloqueos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredBlocks.length} bloqueo{filteredBlocks.length !== 1 ? 's' : ''} encontrado{filteredBlocks.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line mr-2 w-4 h-4 inline-flex items-center justify-center"></i>
            Nuevo Bloqueo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 flex items-center justify-center"></i>
              <input
                type="text"
                placeholder="Buscar por andén, motivo o creador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filtro andén */}
          <select
            value={filterDockId}
            onChange={(e) => setFilterDockId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">Todos los andenes</option>
            {docks.map((dock) => (
              <option key={dock.id} value={dock.id}>{dock.name}</option>
            ))}
          </select>

          {/* Filtro tipo */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'manual', 'client'] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filterType === t ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'all' ? 'Todos' : t === 'manual' ? 'Manuales' : 'Cliente Retira'}
              </button>
            ))}
          </div>

          {/* Filtro estado */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'active', 'past'] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filterStatus === s ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Vencidos'}
              </button>
            ))}
          </div>

          {/* Botón limpiar filtros */}
          {(searchTerm || filterDockId !== 'all' || filterType !== 'manual' || filterStatus !== 'active') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterDockId('all');
                setFilterType('manual');
                setFilterStatus('active');
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap cursor-pointer"
            >
              <i className="ri-filter-off-line mr-1"></i>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin w-8 h-8 flex items-center justify-center mx-auto"></i>
            <p className="text-sm text-gray-500 mt-2">Cargando bloqueos...</p>
          </div>
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <i className="ri-lock-unlock-line text-3xl text-gray-400 w-8 h-8 flex items-center justify-center"></i>
          </div>
          <p className="font-medium text-gray-700">No hay bloqueos</p>
          <p className="text-sm text-gray-500 mt-1">Ajusta los filtros o crea un nuevo bloqueo.</p>
          {canCreate && (
            <button
              onClick={handleCreate}
              className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm font-medium whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Bloqueo
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Andén</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Inicio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Fin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Creado por</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBlocks.map((block) => {
                  const isClient = isClientPickupBlock(block.reason);
                  return (
                    <tr key={block.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">{getBlockTypeBadge(block)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {block.dock?.category?.color && (
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: block.dock.category.color }}
                            />
                          )}
                          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {getDockName(block)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {formatDateTime(block.start_datetime)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {formatDateTime(block.end_datetime)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[240px]">
                        <span className="block truncate" title={getReasonDisplay(block.reason)}>
                          {getReasonDisplay(block.reason)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {block.creator?.name || 'Sistema'}
                        <div className="text-xs text-gray-400">{formatDateShort(block.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(block)}</td>
                      <td className="px-4 py-3">
                        {isClient ? (
                          /* Bloques de cliente: solo lectura */
                          <span className="text-xs text-gray-400 italic">Solo lectura</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {/* Editar */}
                            {canUpdate && (
                              <button
                                onClick={() => handleEdit(block)}
                                title="Editar bloqueo"
                                className="p-1.5 rounded hover:bg-gray-100 cursor-pointer transition-colors"
                              >
                                <i className="ri-edit-line text-gray-500 hover:text-gray-700 text-sm w-4 h-4 flex items-center justify-center"></i>
                              </button>
                            )}
                            {/* Renovar (Admin / Full Access) */}
                            {(canUpdate && hasFullAccess) && (
                              <button
                                onClick={() => handleRenewClick(block)}
                                title="Renovar bloqueo"
                                className="p-1.5 rounded hover:bg-teal-50 cursor-pointer transition-colors"
                              >
                                <i className="ri-refresh-line text-teal-600 text-sm w-4 h-4 flex items-center justify-center"></i>
                              </button>
                            )}
                            {/* Eliminar */}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteClick(block)}
                                title="Eliminar bloqueo"
                                disabled={deleteLoading}
                                className="p-1.5 rounded hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <i className="ri-delete-bin-line text-red-500 text-sm w-4 h-4 flex items-center justify-center"></i>
                              </button>
                            )}
                            {/* Si no hay permisos: solo visualización */}
                            {!canUpdate && !canDelete && (
                              <span className="text-xs text-gray-400 italic">Solo lectura</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer con conteo */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
            Mostrando {filteredBlocks.length} de {blocks.length} bloqueos totales
          </div>
        </div>
      )}

      {/* BlockModal */}
      {blockModalOpen && (
        <BlockModal
          block={selectedBlock}
          docks={docks}
          allowEdit={allowEdit}
          renewalMode={renewalMode}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}

      {/* Popup de confirmación de renovación */}
      <ConfirmModal
        isOpen={renewalConfirm.isOpen}
        type="info"
        title="Renovar Bloqueo"
        message={`¿Deseas renovar el bloqueo del andén "${renewalConfirm.block ? getDockName(renewalConfirm.block) : ''}"? Se abrirá el editor para que puedas modificar las fechas y duración del bloqueo.`}
        confirmText="Sí, renovar"
        cancelText="Cancelar"
        showCancel
        onConfirm={handleRenewConfirm}
        onCancel={() => setRenewalConfirm({ isOpen: false, block: null })}
      />

      {/* Popup de confirmación de eliminación */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        type="warning"
        title="Eliminar Bloqueo"
        message={`¿Estás seguro de que deseas eliminar este bloqueo del andén "${deleteConfirm.block ? getDockName(deleteConfirm.block) : ''}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ isOpen: false, block: null })}
      />
    </div>
  );
}
