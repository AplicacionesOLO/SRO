import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthFlowError, type AuthErrorKind } from '@/utils/authErrors';
import LoginFormPanel from './components/LoginFormPanel';
import LoginRightPanel from './components/LoginRightPanel';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
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
    setErrorDetail('');
    setErrorKind(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user) {
        const redirectPath = user.role === 'CASETILLA' ? '/casetilla' : ((location.state as any)?.returnUrl || '/calendario');
        navigate(redirectPath, { replace: true });
      } else {
        setError('No pudimos iniciar sesión. Revisá los datos e intentá de nuevo.');
        setErrorKind('unknown');
      }
    } catch (err) {
      if (err instanceof AuthFlowError) {
        setError(err.message);
        setErrorDetail(err.detail);
        setErrorKind(err.kind);
      } else {
        setError('No pudimos iniciar sesión. Revisá tu conexión e intentá de nuevo.');
        setErrorKind('unknown');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setErrorDetail('');
    setErrorKind(null);
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
          errorDetail={errorDetail}
          errorKind={errorKind}
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