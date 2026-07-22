import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoginNetworkBackground from './LoginNetworkBackground';

interface LoginFormPanelProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  error: string;
  loading: boolean;
  googleLoading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function LoginFormPanel({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  loading,
  googleLoading,
  handleSubmit,
  handleGoogleLogin,
}: LoginFormPanelProps) {
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem('sro_login_remember') === 'true';
    } catch {
      return false;
    }
  });
  const [shake, setShake] = useState(false);

  // Load saved email
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sro_login_email');
      if (saved) setEmail(saved);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shake on error
  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error]);

  const onSubmit = (e: React.FormEvent) => {
    if (rememberMe) {
      try {
        localStorage.setItem('sro_login_email', email);
        localStorage.setItem('sro_login_remember', 'true');
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem('sro_login_email');
        localStorage.removeItem('sro_login_remember');
      } catch {
        // ignore
      }
    }
    handleSubmit(e);
  };

  return (
    <div className="relative w-full min-h-screen bg-sro-navy-950 flex flex-col justify-center px-6 md:px-10 lg:px-16 py-10 overflow-y-auto login-panel-scroll">
      {/* Subtle network background */}
      <div className="absolute inset-0 opacity-40">
        <LoginNetworkBackground intensity="low" />
      </div>

      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-sro-navy-950 via-sro-navy-900/80 to-sro-navy-800/40 pointer-events-none" />

      <motion.div
        className="relative z-10 w-full max-w-[400px] mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div variants={itemVariants} className="mb-6">
          <motion.img
            src="https://public.readdy.ai/ai/img_res/139db97b-043a-4e1c-952e-517ea010c36c.png"
            alt="SRO Logo - Sistema de Reservas OLO"
            className="h-24 w-auto mb-1 object-contain"
            animate={{ scale: [1, 1.015, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Title block */}
        <motion.div variants={itemVariants} className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-1">Bienvenido de nuevo</h1>
          <p className="text-sm text-white/40">Ingresa tus credenciales para continuar</p>
        </motion.div>

        {/* Form card */}
        <motion.div variants={itemVariants}>
          <motion.form
            onSubmit={onSubmit}
            animate={shake ? { x: [0, -4, 4, -3, 3, 0] } : {}}
            transition={{ duration: 0.35 }}
            className="login-glass rounded-2xl p-5 md:p-6 lg:p-8"
          >
            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2"
              >
                Correo electrónico
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <motion.i
                    className="ri-mail-line text-white/50 w-5 h-5 flex items-center justify-center"
                    whileFocus={{ color: 'rgba(13,148,136,0.8)' }}
                  />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full h-[52px] pl-12 pr-4 bg-white/[0.10] border border-white/[0.12] rounded-xl text-white text-sm placeholder-white/40 focus:outline-none login-input-glow transition-all duration-300"
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="mt-5">
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2"
              >
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <i className="ri-lock-line text-white/50 w-5 h-5 flex items-center justify-center" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full h-[52px] pl-12 pr-12 bg-white/[0.10] border border-white/[0.12] rounded-xl text-white text-sm placeholder-white/40 focus:outline-none login-input-glow transition-all duration-300"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer text-white/40 hover:text-white/70 hover:bg-white/5 rounded-lg w-10 justify-center mx-1 my-2 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <motion.i
                    className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} w-5 h-5 flex items-center justify-center`}
                    key={showPassword ? 'off' : 'on'}
                    initial={{ rotate: -10, opacity: 0.5 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between mt-5">
              <label className="flex items-center gap-2.5 cursor-pointer group/select">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-[18px] h-[18px] rounded border border-white/20 bg-white/[0.04] peer-checked:bg-sro-teal peer-checked:border-sro-teal transition-all flex items-center justify-center">
                    <i className="ri-check-line text-white text-xs w-4 h-4 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-sm text-white/50 group-hover/select:text-white/70 transition-colors">
                  Recordarme
                </span>
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm text-sro-teal hover:text-sro-teal-300 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* Error message */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2 overflow-hidden"
                >
                  <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={!loading ? { y: -2 } : {}}
              whileTap={!loading ? { scale: 0.98 } : {}}
              className="mt-6 w-full h-[52px] bg-sro-teal text-white rounded-xl font-semibold text-sm hover:bg-sro-teal-700 focus:outline-none focus:ring-2 focus:ring-sro-teal/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2 relative overflow-hidden group"
            >
              {loading ? (
                <>
                  {/* Logistic line animation */}
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[2px] bg-sro-teal-300/40 animate-logisticLineReset" />
                  </div>
                  <span className="relative z-10 flex items-center gap-2">
                    <motion.div
                      className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    Trazando operación...
                  </span>
                </>
              ) : (
                <>
                  <span>Iniciar Sesión</span>
                  <i className="ri-arrow-right-line w-5 h-5 flex items-center justify-center group-hover:translate-x-1 transition-transform duration-200" />
                </>
              )}
            </motion.button>

            {/* Divider */}
            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.08]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-sro-navy-950 text-white/50 rounded text-xs whitespace-nowrap">o continuar con</span>
              </div>
            </div>

            {/* Google login */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className="mt-5 w-full h-[48px] flex items-center justify-center gap-3 bg-white border border-white/[0.06] text-sro-navy-900 rounded-xl font-medium text-sm hover:bg-white/95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {googleLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-sro-navy-900/30 border-t-sro-navy-900 rounded-full animate-spin" />
                  <span>Conectando con Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continuar con Google</span>
                </>
              )}
            </button>
          </motion.form>
        </motion.div>

        {/* Security indicator */}
        <motion.div
          variants={itemVariants}
          className="mt-6 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-sro-teal/10 border border-sro-teal/10 flex items-center justify-center flex-shrink-0">
            <i className="ri-shield-check-line text-sro-teal text-sm w-5 h-5 flex items-center justify-center" />
          </div>
          <div>
            <div className="text-sm text-white/60 font-medium">Plataforma segura y confiable</div>
            <div className="text-xs text-white/25 mt-0.5 leading-relaxed">
              Tus datos están protegidos con encriptación de nivel empresarial.
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          variants={itemVariants}
          className="mt-8 flex items-center justify-between text-[11px] text-white/20"
        >
          <span>© 2026 SRO. Todos los derechos reservados.</span>
          <span className="font-mono text-white/15">v2.1.0</span>
        </motion.div>
      </motion.div>
    </div>
  );
}