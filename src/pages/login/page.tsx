import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if user becomes authenticated (e.g. after Google OAuth callback)
  useEffect(() => {
    if (user) {
      const redirectPath = user.role === 'CASETILLA' ? '/casetilla' : ((location.state as any)?.returnUrl || '/calendario');
      navigate(redirectPath, { replace: true });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user) {
        const redirectPath = user.role === 'CASETILLA' ? '/casetilla' : ((location.state as any)?.returnUrl || '/calendario');
        navigate(redirectPath, { replace: true });
      } else {
        setError('Credenciales incorrectas. Por favor, verifica tu correo y contraseña.');
      }
    } catch (err) {
      setError('Error al iniciar sesión. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError('Error al iniciar sesión con Google. Por favor, intenta de nuevo.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gradient-to-br from-teal-50 to-white">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/894bf9da2b8030a7b0ba3c4dadd1585d.png"
              alt="SRO Logo"
              className="h-20 w-auto mx-auto mb-6 object-contain"
            />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Sistema de Reservas OLO
            </h1>
            <p className="text-gray-600">Ingresa tus credenciales para continuar</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-mail-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="tu@email.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-lock-line text-gray-400 w-5 h-5 flex items-center justify-center"></i>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <i
                      className={`${
                        showPassword ? 'ri-eye-off-line' : 'ri-eye-line'
                      } w-5 h-5 flex items-center justify-center`}
                    ></i>
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center"></i>
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">o continuar con</span>
                </div>
              </div>

              {/* Google login button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {googleLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Conectando con Google...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continuar con Google
                  </>
                )}
              </button>
            </form>

            {/* Note section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-3">Nota:</p>
                <p className="bg-teal-50 p-3 rounded-lg text-teal-800">
                  En caso de no poseer un usuario debes solicitarlo al administrador{' '}
                  <code className="bg-teal-100 px-1 rounded">CR: kramirez@ologistics.com / VNZ: srodriguez@febeca.com&nbsp;</code> para poder iniciar sesión.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-teal-600 to-teal-800 items-center justify-center p-12">
        <div className="max-w-lg text-white">
          <h2 className="text-4xl font-bold mb-6">Control y gestión integral de andenes</h2>
          <p className="text-xl text-teal-100 mb-8">
            Centralizá la programación, monitoreo y control de operaciones de carga y descarga en una sola plataforma.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-calendar-check-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Programación centralizada</h3>
                <p className="text-teal-100">Gestioná reservas de forma ordenada y sin conflictos</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-file-list-3-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Trazabilidad operativa</h3>
                <p className="text-teal-100">Accedé al historial completo de cada operación y sus cambios</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-truck-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Visibilidad en tiempo real</h3>
                <p className="text-teal-100">Supervisá el estado de cada andén y sus operaciones activas</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}