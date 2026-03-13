import { useState } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';
import { supabase } from '../../../../lib/supabase';

export default function SmtpServiceTab() {
  const { user } = useAuth();
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'Full Access';

  const handleSendTestEmail = async () => {
    if (!testEmail.trim()) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Email requerido',
        message: 'Por favor ingresá un email de destino para enviar la prueba.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'Email inválido',
        message: 'Por favor ingresá un email válido.',
      });
      return;
    }

    setSending(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error('No hay sesión activa');
      }

      const { data, error } = await supabase.functions.invoke('smtp-send', {
        body: {
          to_emails: [testEmail],
          subject: 'Correo de prueba - Sistema de Correspondencia',
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0d9488;">Correo de Prueba</h2>
              <p>Este es un correo de prueba enviado desde el sistema de correspondencia.</p>
              <p>Si recibiste este mensaje, significa que el servicio SMTP está funcionando correctamente.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">
                Enviado por: ${user?.email || 'Sistema'}<br>
                Fecha: ${new Date().toLocaleString('es-ES')}<br>
                Servicio: SMTP Corporativo (relay-smtp.ologistics.com)
              </p>
            </div>
          `,
          sender_email: 'no-reply-sro@ologistics.com',
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido al enviar el correo');
      }

      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Email enviado',
        message: `El correo de prueba se envió exitosamente a ${testEmail}`,
      });

      setTestEmail('');
    } catch (error: any) {
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error al enviar',
        message: error?.message || 'Error al enviar email de prueba',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup((prev) => ({ ...prev, isOpen: false }))}
        confirmText="Aceptar"
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Servicio de Correo SMTP Corporativo</h3>
          <p className="text-sm text-gray-600 mt-1">
            Configuración centralizada de envío de correos electrónicos
          </p>
        </div>

        <div className="p-6">
          <div className="mb-6 bg-teal-50 border border-teal-200 rounded-lg p-4">
            <div className="flex gap-3">
              <i className="ri-server-line text-teal-600 text-xl flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center"></i>
              <div className="text-sm text-teal-900">
                <p className="font-semibold mb-1">Servicio SMTP Corporativo Activo</p>
                <p>
                  Los correos se envían a través del relay SMTP corporativo en{' '}
                  <span className="font-mono font-semibold">relay-smtp.ologistics.com:25</span>
                </p>
                <p className="text-xs mt-2 text-teal-700">
                  <strong>Flujo actual:</strong>
                </p>
                <ol className="text-xs mt-1 ml-4 list-decimal space-y-0.5">
                  <li>Evento dispara Edge Function (correspondence-process-event)</li>
                  <li>Edge Function evalúa reglas y encola en correspondence_outbox</li>
                  <li>Edge Function llama a smtp-send para envío inmediato</li>
                  <li>smtp-send conecta al relay SMTP corporativo y envía el correo</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-teal-100">
              <i className="ri-mail-send-line text-2xl text-teal-600" />
            </div>

            <div className="flex-1">
              <h4 className="text-base font-semibold text-gray-900 mb-1">Servicio Activo</h4>
              <p className="text-sm text-gray-600">
                Los correos se envían desde{' '}
                <span className="font-mono font-semibold text-teal-700">
                  no-reply-sro@ologistics.com
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Todos los correos automáticos del sistema utilizan esta cuenta centralizada
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center"></i>
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-2">Sobre el servicio SMTP centralizado:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>No necesitás conectar tu cuenta personal de Gmail</li>
                  <li>Los correos se envían automáticamente según las reglas configuradas</li>
                  <li>El sistema usa el relay SMTP corporativo seguro</li>
                  <li>Todos los envíos quedan registrados en la bitácora</li>
                  <li>El envío es inmediato mediante Edge Functions de Supabase</li>
                </ul>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <i className="ri-flask-line text-teal-600 w-5 h-5 flex items-center justify-center"></i>
                Enviar Correo de Prueba
              </h4>

              <p className="text-sm text-gray-600 mb-4">
                Enviá un correo de prueba para verificar que el servicio SMTP está funcionando
                correctamente.
              </p>

              <div className="flex gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  disabled={sending}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                />
                <button
                  onClick={handleSendTestEmail}
                  disabled={sending || !testEmail.trim()}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap text-sm font-medium"
                >
                  {sending ? (
                    <>
                      <i className="ri-loader-4-line animate-spin w-5 h-5 flex items-center justify-center"></i>
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-send-plane-line w-5 h-5 flex items-center justify-center"></i>
                      <span>Enviar Prueba</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                El correo de prueba se enviará desde no-reply-sro@ologistics.com vía relay-smtp.ologistics.com
              </p>
            </div>
          )}

          {!isAdmin && (
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex gap-3">
                  <i className="ri-lock-line text-gray-400 text-xl flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center"></i>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium text-gray-700 mb-1">Acceso restringido</p>
                    <p>
                      Solo los administradores pueden enviar correos de prueba. Si necesitás
                      verificar el servicio, contactá a un administrador.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <i className="ri-question-line w-5 h-5 flex items-center justify-center"></i>
          ¿Cómo funciona el envío de correos?
        </h4>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            El sistema envía correos automáticamente cuando ocurren eventos configurados en las{' '}
            <strong>Reglas de Correspondencia</strong>:
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>Creación de nuevas reservas</li>
            <li>Cambios de estado en reservas existentes</li>
            <li>Notificaciones a usuarios, roles o correos externos</li>
          </ul>
          <p className="mt-3">
            Todos los envíos quedan registrados en la <strong>Bitácora de Envíos</strong> para
            auditoría y seguimiento.
          </p>
        </div>
      </div>
    </div>
  );
}