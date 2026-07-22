import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import LoginFormPanel from './components/LoginFormPanel';
import LoginRightPanel from './components/LoginRightPanel';

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
    <div className="min-h-screen flex flex-col md:flex-row bg-sro-navy-950">
      {/* Left panel - Login form */}
      <div className="w-full md:w-[45%] lg:w-[40%] flex-shrink-0">
        <LoginFormPanel
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          loading={loading}
          googleLoading={googleLoading}
          handleSubmit={handleSubmit}
          handleGoogleLogin={handleGoogleLogin}
        />
      </div>

      {/* Right panel - Operational dashboard */}
      <div className="hidden md:flex md:w-[55%] lg:w-[60%] flex-shrink-0">
        <LoginRightPanel />
      </div>
    </div>
  );
}