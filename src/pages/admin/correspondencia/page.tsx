import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAuth } from '../../../contexts/AuthContext';
import { correspondenceService } from '../../../services/correspondenceService';
import type { CorrespondenceRule, CorrespondenceRuleFormData } from '../../../types/correspondence';
import { CORRESPONDENCE_EVENT_LABELS } from '../../../types/correspondence';
import RuleModal from './components/RuleModal';
import LogsTab from './components/LogsTab';
import SmtpServiceTab from './components/SmtpServiceTab';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

export default function CorrespondenciaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, loading: permissionsLoading, orgId } = usePermissions();
  const { user } = useAuth();
  
  // ✅ Leer tab desde query param o usar default
  const tabFromUrl = searchParams.get('tab') as 'gmail' | 'rules' | 'logs' | null;
  const [activeTab, setActiveTab] = useState<'gmail' | 'rules' | 'logs'>(tabFromUrl || 'gmail');
  
  const [rules, setRules] = useState<CorrespondenceRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CorrespondenceRule | null>(null);

  // ✅ Estados para popups
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  // ✅ Estado para confirmación de eliminación
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    ruleId: string;
    ruleName: string;
  }>({
    isOpen: false,
    ruleId: '',
    ruleName: ''
  });

  // ✅ Verificar permisos de tabs
  const canViewGmailTab = can('correspondence.gmail_account.view');
  const canViewRulesTab = can('correspondence.rules.view');
  const canViewLogsTab = can('correspondence.logs.view');

  // ✅ Determinar primer tab disponible
  const getDefaultTab = (): 'gmail' | 'rules' | 'logs' => {
    if (canViewGmailTab) return 'gmail';
    if (canViewRulesTab) return 'rules';
    if (canViewLogsTab) return 'logs';
    return 'gmail'; // fallback
  };

  // ✅ Ajustar tab activo si no tiene permiso
  useEffect(() => {
    if (permissionsLoading) return;
    
    if (activeTab === 'gmail' && !canViewGmailTab) {
      setActiveTab(getDefaultTab());
    } else if (activeTab === 'rules' && !canViewRulesTab) {
      setActiveTab(getDefaultTab());
    } else if (activeTab === 'logs' && !canViewLogsTab) {
      setActiveTab(getDefaultTab());
    }
  }, [permissionsLoading, canViewGmailTab, canViewRulesTab, canViewLogsTab, activeTab]);

  // ✅ Sincronizar tab con URL
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // FIX: Estabilizar loadRules con useCallback
  const loadRules = useCallback(async () => {
    // FIX: Solo cargar si orgId existe
    if (!orgId) {
      console.log('[CorrespondenciaPage] loadRules - no orgId, skipping');
      setRules([]);
      setLoadingRules(false);
      return;
    }
    
    console.log('[CorrespondenciaPage] loadRules start', { orgId });
    setLoadingRules(true);
    
    try {
      const data = await correspondenceService.getRules(orgId);
      console.log('[CorrespondenciaPage] loadRules success', { 
        orgId, 
        count: data.length,
        rules: data.map(r => ({ id: r.id, name: r.name }))
      });
      setRules(data);
    } catch (error) {
      console.error('[CorrespondenciaPage] loadRules error', { orgId, error });
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, [orgId]); // FIX: Solo depender de orgId

  // FIX: useEffect solo depende de loadRules (que ya depende de orgId)
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // ✅ Handler para cambiar tab y actualizar URL
  const handleTabChange = (tab: 'gmail' | 'rules' | 'logs') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleCreateRule = async (data: CorrespondenceRuleFormData) => {
    if (!orgId) return;
    
    try {
      await correspondenceService.createRule(orgId, data);
      await loadRules();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error al crear regla:', error);
      throw error;
    }
  };

  const handleUpdateRule = async (data: CorrespondenceRuleFormData) => {
    if (!selectedRule) return;
    
    try {
      await correspondenceService.updateRule(selectedRule.id, data);
      await loadRules();
      setIsModalOpen(false);
      setSelectedRule(null);
    } catch (error) {
      console.error('Error al actualizar regla:', error);
      throw error;
    }
  };

  const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      await correspondenceService.toggleRuleStatus(ruleId, !currentStatus);
      await loadRules();
    } catch (error) {
      console.error('Error al cambiar estado de regla:', error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al cambiar el estado de la regla'
      });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    setDeleteConfirm({
      isOpen: true,
      ruleId,
      ruleName: rule?.name || 'esta regla'
    });
  };

  const confirmDeleteRule = async () => {
    const ruleId = deleteConfirm.ruleId;
    setDeleteConfirm({ isOpen: false, ruleId: '', ruleName: '' });

    try {
      await correspondenceService.deleteRule(ruleId);
      await loadRules();
      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Regla eliminada',
        message: 'La regla de correspondencia se ha eliminado correctamente.'
      });
    } catch (error) {
      console.error('Error al eliminar regla:', error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al eliminar la regla'
      });
    }
  };

  const openEditModal = (rule: CorrespondenceRule) => {
    setSelectedRule(rule);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setSelectedRule(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRule(null);
  };

  const getRecipientsSummary = (rule: CorrespondenceRule) => {
    const parts: string[] = [];
    
    if (rule.recipient_users.length > 0) {
      parts.push(`${rule.recipient_users.length} usuario(s)`);
    }
    if (rule.recipient_roles.length > 0) {
      parts.push(`${rule.recipient_roles.length} rol(es)`);
    }
    if (rule.recipient_external_emails.length > 0) {
      parts.push(`${rule.recipient_external_emails.length} externo(s)`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Sin destinatarios';
  };

  const getConditionSummary = (rule: CorrespondenceRule) => {
    if (rule.event_type === 'reservation_created') {
      return 'Al crear reserva';
    }

    const parts: string[] = [];
    if (rule.status_from?.name) {
      parts.push(`De: ${rule.status_from.name}`);
    }
    if (rule.status_to?.name) {
      parts.push(`A: ${rule.status_to.name}`);
    }

    return parts.length > 0 ? parts.join(' → ') : 'Cualquier cambio';
  };

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
            <p className="text-gray-600">Verificando permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes una organización asignada.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasAccess = user?.role === 'ADMIN' || user?.role === 'Full Access' || can('correspondence.view');

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes permisos para acceder a esta sección.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Verificar si tiene al menos un tab visible
  const hasAnyTabAccess = canViewGmailTab || canViewRulesTab || canViewLogsTab;

  if (!hasAnyTabAccess && !permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sin Acceso a Tabs</h2>
            <p className="text-gray-600 mb-6">No tienes permisos para ver ninguna sección de Correspondencia.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ✅ Popup de notificaciones */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup(prev => ({ ...prev, isOpen: false }))}
        confirmText="Aceptar"
      />

      {/* ✅ Popup de confirmación de eliminación */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        type="warning"
        title="Eliminar regla"
        message={`¿Estás seguro de eliminar "${deleteConfirm.ruleName}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={confirmDeleteRule}
        onCancel={() => setDeleteConfirm({ isOpen: false, ruleId: '', ruleName: '' })}
      />

      <div className="px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Correspondencia</h1>
          <p className="text-gray-600">Gestiona el envío automatizado de correos electrónicos</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex gap-8">
              {canViewGmailTab && (
                <button
                  onClick={() => handleTabChange('gmail')}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    activeTab === 'gmail'
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <i className="ri-mail-send-line mr-2"></i>
                  Servicio de Correo
                </button>
              )}
              {canViewRulesTab && (
                <button
                  onClick={() => handleTabChange('rules')}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    activeTab === 'rules'
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <i className="ri-file-list-3-line mr-2"></i>
                  Reglas de Correspondencia
                </button>
              )}
              {canViewLogsTab && (
                <button
                  onClick={() => handleTabChange('logs')}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    activeTab === 'logs'
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <i className="ri-history-line mr-2"></i>
                  Bitácora de Envíos
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          {activeTab === 'gmail' && canViewGmailTab && (
            <SmtpServiceTab />
          )}
          {activeTab === 'rules' && canViewRulesTab && (
            <div className="space-y-4">
              {/* Botón Nueva Regla */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  {rules.length} regla(s) configurada(s)
                </p>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <i className="ri-add-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  Nueva Regla
                </button>
              </div>

              {/* Lista de Reglas */}
              {loadingRules ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin mb-2"></i>
                    <p className="text-gray-600 text-sm">Cargando reglas...</p>
                  </div>
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-12">
                  <i className="ri-mail-line text-5xl text-gray-300 mb-4"></i>
                  <p className="text-gray-500 mb-4">No hay reglas de correspondencia configuradas</p>
                  <button
                    onClick={openCreateModal}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    Crear Primera Regla
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Nombre</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Evento</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Condición</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Destinatarios</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                            <div className="text-xs text-gray-500 truncate max-w-xs">
                              {rule.subject}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {CORRESPONDENCE_EVENT_LABELS[rule.event_type]}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {getConditionSummary(rule)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {getRecipientsSummary(rule)}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleRule(rule.id, rule.is_active)}
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                                rule.is_active
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                            >
                              {rule.is_active ? 'Activa' : 'Inactiva'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditModal(rule)}
                                className="text-teal-600 hover:text-teal-700 transition-colors"
                                title="Editar"
                              >
                                <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-red-600 hover:text-red-700 transition-colors"
                                title="Eliminar"
                              >
                                <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {activeTab === 'logs' && canViewLogsTab && <LogsTab />}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <i className="ri-information-line text-blue-600 text-xl w-6 h-6 flex items-center justify-center flex-shrink-0"></i>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900 mb-1">
                Envío Centralizado de Correos
              </h3>
              <p className="text-sm text-blue-800">
                El sistema utiliza un servicio SMTP centralizado para enviar correos automáticamente. 
                Los correos se envían desde <strong>no-reply-sro@ologistics.com</strong> cuando ocurren los eventos configurados en las reglas activas.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {orgId && (
        <RuleModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={selectedRule ? handleUpdateRule : handleCreateRule}
          rule={selectedRule}
          orgId={orgId}
        />
      )}
    </div>
  );
}
