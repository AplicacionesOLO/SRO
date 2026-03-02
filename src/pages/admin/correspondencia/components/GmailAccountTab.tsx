// ⚠️ DEPRECATED - 2026-02-13
// Este componente ya NO se usa. Ha sido reemplazado por SmtpServiceTab.
// El sistema ahora utiliza SMTP centralizado (no-reply-sro@ologistics.com).
// Los clientes externos NO necesitan conectar sus cuentas de Gmail.
// 
// Se mantiene temporalmente para referencia histórica.
// Plan: eliminar este archivo cuando se confirme que SmtpServiceTab funciona correctamente.

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../../../../contexts/AuthContext";

import {
  getGmailConnectionStatus,
  getGmailAuthUrl,
  disconnectGmailAccount,
} from "../../../../services/gmailAccountService";

import type { GmailConnectionStatus } from "../../../../types/gmailAccount";
import { ConfirmModal } from "../../../../components/base/ConfirmModal";

export default function GmailAccountTab() {
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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

  // ✅ Estado para confirmación de desconexión
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  const orgId = useMemo(() => user?.orgId ?? null, [user?.orgId]);

  const redirectUrl = useMemo(() => {
    const url = `${window.location.origin}${window.location.pathname}?tab=gmail`;
    return url;
  }, []);

  const debugCtx = useMemo(() => {
    return {
      authLoading,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      userOrgId: user?.orgId ?? null,
      resolvedOrgId: orgId,
      origin: window.location.origin,
      href: window.location.href,
      redirectUrl,
    };
  }, [authLoading, user?.id, user?.email, user?.orgId, orgId, redirectUrl]);

  const loadConnectionStatus = useCallback(async () => {
    if (authLoading || !user?.id || !orgId) {
      console.log("[GmailAccountTab] loadConnectionStatus:skip", debugCtx);
      return;
    }

    try {
      setLoading(true);
      console.log("[GmailAccountTab] calling getGmailConnectionStatus", { orgId, userId: user.id });

      const connectionStatus = await getGmailConnectionStatus(orgId, user.id);

      console.log("[GmailAccountTab] connectionStatus:ok", connectionStatus);
      setStatus(connectionStatus);
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "Unknown",
        stack: error instanceof Error ? error.stack : undefined,
        raw: error,
      };

      console.error("[GmailAccountTab] connectionStatus:error", {
        error: errorDetails,
        debugCtx,
      });

      setStatus(null);
    } finally {
      setLoading(false);
      console.log("[GmailAccountTab] loadConnectionStatus:done", debugCtx);
    }
  }, [authLoading, user?.id, orgId, debugCtx]);

  useEffect(() => {
    console.log("[GmailAccountTab] useEffect:init", debugCtx);
    if (!authLoading) loadConnectionStatus();
  }, [authLoading, loadConnectionStatus, debugCtx]);

  const handleConnect = async () => {
    console.log("[GmailAccountTab] handleConnect:start", {
      orgId,
      userId: user?.id,
      redirectUrl,
      origin: window.location.origin,
    });

    if (authLoading) {
      console.warn("[GmailAccountTab] handleConnect blocked: authLoading=true");
      return;
    }
    if (!user?.id || !orgId) {
      console.warn("[GmailAccountTab] handleConnect blocked: missing user/orgId", debugCtx);
      setPopup({
        isOpen: true,
        type: 'warning',
        title: 'No se puede conectar',
        message: 'No se puede conectar Gmail: el usuario no tiene organización asignada.'
      });
      return;
    }

    try {
      setConnecting(true);

      const authUrl = await getGmailAuthUrl(orgId, user.id, redirectUrl);

      console.log("[GmailAccountTab] handleConnect:authUrl", { authUrl });
      window.location.href = authUrl;
    } catch (error) {
      console.error("[GmailAccountTab] handleConnect:error", error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error de conexión',
        message: 'Error al iniciar conexión con Gmail. Revisá la consola para más detalles.'
      });
    } finally {
      setConnecting(false);
      console.log("[GmailAccountTab] handleConnect:finally", { orgId, userId: user?.id });
    }
  };

  const handleDisconnect = async () => {
    console.log("[GmailAccountTab] handleDisconnect:start", { orgId, userId: user?.id });

    if (authLoading) return;
    if (!user?.id || !orgId) return;

    // ✅ Mostrar popup de confirmación en lugar de confirm()
    setDisconnectConfirm(true);
  };

  const confirmDisconnect = async () => {
    setDisconnectConfirm(false);

    if (!user?.id || !orgId) return;

    try {
      setDisconnecting(true);

      console.log("[GmailAccountTab] disconnect:calling disconnectGmailAccount", { orgId, userId: user.id });
      const res = await disconnectGmailAccount(orgId, user.id);
      console.log("[GmailAccountTab] disconnect:ok", res);

      // ✅ Limpiar estado inmediatamente para evitar mostrar datos stale
      setStatus(null);

      // ✅ Forzar reload completo del estado
      await loadConnectionStatus();
      
      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Cuenta desconectada',
        message: 'Tu cuenta de Gmail ha sido desconectada exitosamente.'
      });
    } catch (error) {
      console.error("[GmailAccountTab] handleDisconnect:error", error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error al desconectar cuenta de Gmail.'
      });
    } finally {
      setDisconnecting(false);
      console.log("[GmailAccountTab] handleDisconnect:finally", { orgId, userId: user?.id });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-gray-600">
          <i className="ri-loader-4-line text-2xl animate-spin"></i>
          <span>Cargando estado de conexión...</span>
        </div>
      </div>
    );
  }

  if (!user?.id || !orgId) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cuenta Gmail</h3>
              <p className="text-sm text-gray-600 mt-1">
                Falta <b>orgId</b> para conectar Gmail. Revisá que el usuario tenga organización asignada.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Debug: userId={user?.id ?? "null"} | user.orgId={String(user?.orgId)} | resolvedOrgId={String(orgId)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ DETERMINAR CONEXIÓN SOLO POR status.connected === true
  const isConnected = status?.connected === true;
  
  // ✅ LOG DE RENDERSTATE para debugging
  console.log("[GmailAccountTab] renderState", {
    connected: status?.connected,
    accountStatus: status?.account?.status,
    gmail: status?.account?.gmail_email,
    isConnected,
  });

  const hasError = status?.account?.status?.toLowerCase() === "error";

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* ✅ Popup de notificaciones */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup(prev => ({ ...prev, isOpen: false }))}
        confirmText="Aceptar"
      />

      {/* ✅ Popup de confirmación de desconexión */}
      <ConfirmModal
        isOpen={disconnectConfirm}
        type="warning"
        title="Desconectar Gmail"
        message="¿Estás seguro de desconectar tu cuenta de Gmail? Las reglas que usen esta cuenta dejarán de funcionar."
        confirmText="Desconectar"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectConfirm(false)}
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Conexión de Cuenta Gmail</h3>
          <p className="text-sm text-gray-600 mt-1">Conecta tu cuenta de Gmail para enviar correos desde el sistema</p>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isConnected ? "bg-green-100" : hasError ? "bg-red-100" : "bg-gray-100"
              }`}
            >
              <i
                className={`text-2xl ${
                  isConnected
                    ? "ri-checkbox-circle-fill text-green-600"
                    : hasError
                    ? "ri-error-warning-fill text-red-600"
                    : "ri-mail-line text-gray-400"
                }`}
              />
            </div>

            <div className="flex-1">
              <h4 className="text-base font-semibold text-gray-900 mb-1">
                {isConnected ? "Cuenta Conectada" : hasError ? "Error de Conexión" : "Sin Conexión"}
              </h4>

              {/* ✅ SOLO MOSTRAR SECCIÓN "Cuenta Conectada" SI connected === true */}
              {isConnected && status?.account && (
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Correo:</span> {status.account.gmail_email}
                  </p>

                  <p className="text-xs text-gray-500">
                    Conectado el{" "}
                    {new Date(status.account.created_at).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

                  {!!status?.account?.expires_at && (
                    <p className="text-xs text-gray-500">
                      Expira:{" "}
                      {new Date(status.account.expires_at).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              )}

              {hasError && status?.account?.last_error && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">
                    <strong>Error:</strong> {status.account.last_error}
                  </p>
                </div>
              )}

              {!isConnected && !hasError && (
                <p className="text-sm text-gray-600">
                  Necesitás conectar tu cuenta de Gmail para poder enviar correos automáticos desde el sistema.
                </p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-2">Información importante:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Los correos se enviarán desde tu cuenta personal de Gmail</li>
                  <li>Solo se solicitará permiso para enviar correos (no leer)</li>
                  <li>Puedes desconectar tu cuenta en cualquier momento</li>
                  <li>La conexión es segura y usa OAuth 2.0 de Google</li>
                </ul>
                <p className="text-xs text-blue-900/70 mt-2">
                  Debug orgId usado: <b>{orgId}</b>
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {!isConnected ? (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {connecting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-google-fill"></i>
                    <span>Conectar con Gmail</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={handleConnect}
                  disabled={connecting || disconnecting}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {connecting ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      <span>Reconectando...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-refresh-line"></i>
                      <span>Reconectar</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting || connecting}
                  className="px-6 py-2.5 bg-white text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {disconnecting ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      <span>Desconectando...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-link-unlink"></i>
                      <span>Desconectar</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <i className="ri-question-line"></i>¿Necesitas ayuda?
        </h4>
        <p className="text-sm text-gray-600">Si tienes problemas para conectar tu cuenta, verifica que:</p>
        <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside ml-2">
          <li>Estés usando una cuenta de Gmail válida</li>
          <li>Hayas aceptado todos los permisos solicitados</li>
          <li>Tu navegador permita ventanas emergentes</li>
        </ul>
      </div>
    </div>
  );
}
