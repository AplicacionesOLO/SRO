import { useAuth } from '@/contexts/AuthContext';

/**
 * SessionExpiredModal
 * Aparece como overlay cuando el token JWT expira mientras el usuario navega.
 * No redirige silenciosamente — muestra un mensaje claro y un botón para volver a iniciar sesión.
 */
export default function SessionExpiredModal() {
  const { logout } = useAuth();

  const handleLogin = async () => {
    await logout();
    window.location.replace('/login');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop borroso */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Franja superior */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 to-teal-600" />

        <div className="px-8 py-8 flex flex-col items-center text-center gap-5">
          {/* Ícono */}
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-amber-50 border border-amber-100">
            <i className="ri-time-line text-3xl text-amber-500" />
          </div>

          {/* Título */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Sesión expirada
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Tu sesión ha caducado por inactividad o porque el token fue invalidado.
              Por seguridad, necesitás volver a iniciar sesión.
            </p>
          </div>

          {/* Botón */}
          <button
            onClick={handleLogin}
            className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Volver a iniciar sesión
          </button>

          {/* Nota de seguridad */}
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <i className="ri-shield-check-line text-gray-400" />
            Tu trabajo no se perdió. Solo necesitás autenticarte de nuevo.
          </p>
        </div>
      </div>
    </div>
  );
}
