
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Credenciales incorrectas. Por favor, verifica tu correo y contraseña.');
      }
    } catch (err) {
      setError('Error al iniciar sesión. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
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
            </form>

            {/* Note section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-3">Nota:</p>
                <p className="bg-teal-50 p-3 rounded-lg text-teal-800">
                  En caso de no poseer un usuario debes solicitarlo al administrador{' '}
                  <code className="bg-teal-100 px-1 rounded">correo@ologistics.com</code> para poder iniciar sesión.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-teal-600 to-teal-800 items-center justify-center p-12">
        <div className="max-w-lg text-white">
          <h2 className="text-4xl font-bold mb-6">Gestión Eficiente de Andenes</h2>
          <p className="text-xl text-teal-100 mb-8">
            Optimiza la coordinación de llegadas, descargas y salidas de camiones con nuestro sistema
            integral de reservaciones.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-calendar-check-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Calendario Inteligente</h3>
                <p className="text-teal-100">Visualiza y gestiona reservas por día, semana o mes</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-file-list-3-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Auditoría Completa</h3>
                <p className="text-teal-100">Historial detallado de todos los cambios realizados</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <i className="ri-truck-line text-2xl w-6 h-6 flex items-center justify-center"></i>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Control de Andenes</h3>
                <p className="text-teal-100">Monitorea el estado en tiempo real de cada andén</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
