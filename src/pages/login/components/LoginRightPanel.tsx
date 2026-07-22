import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import LoginNetworkBackground from './LoginNetworkBackground';
import LoginTimeline from './LoginTimeline';
import LoginKPIs from './LoginKPIs';

function useOperationalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function LoginRightPanel() {
  const time = useOperationalClock();

  const timeStr = time.toLocaleTimeString('es-ES', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateStr = time.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="relative w-full h-full overflow-hidden bg-sro-navy-950">
      {/* Background photo */}
      <img
        src="https://readdy.ai/api/search-image?query=Night%20exterior%20of%20modern%20logistics%20distribution%20center%20with%20loading%20docks%20illuminated%20by%20warm%20overhead%20lights%2C%20semi-trucks%20at%20dock%20doors%2C%20wet%20asphalt%20reflecting%20amber%20and%20teal%20lights%2C%20industrial%20warehouse%20architecture%2C%20cinematic%20dark%20atmosphere%2C%20professional%20commercial%20photography%2C%20subtle%20fog%2C%20high%20detail&width=1600&height=900&seq=login-logistics-night&orientation=landscape"
        alt="Centro logístico nocturno"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />

      {/* Dark overlays for readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-sro-navy-950 via-sro-navy-950/80 to-sro-navy-900/60" />
      <div className="absolute inset-0 bg-sro-navy-950/50" />

      {/* Network background layer */}
      <div className="absolute inset-0 opacity-60">
        <LoginNetworkBackground intensity="medium" />
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 h-full flex flex-col p-6 md:p-8 lg:p-10 overflow-y-auto login-panel-scroll"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Clock section */}
        <motion.div variants={itemVariants} className="flex justify-end mb-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-sro-teal-300/50 mb-1">
              Hora Operativa
            </div>
            <div className="text-3xl lg:text-4xl font-bold text-white tracking-tight font-mono tabular-nums">
              {timeStr}
            </div>
            <div className="text-xs text-white/40 mt-1 flex items-center justify-end gap-1.5">
              <i className="ri-time-line text-white/30 w-3 h-3 flex items-center justify-center" />
              {dateStr}
            </div>
          </div>
        </motion.div>

        {/* Title block */}
        <motion.div variants={itemVariants} className="mb-6">
          <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
            Control y gestión integral
            <br />
            <span className="text-sro-teal">de andenes y operaciones</span>
          </h2>
          <p className="text-sm text-white/40 mt-3 max-w-md leading-relaxed">
            Centralizá la programación, monitoreo y control de operaciones de carga y descarga en una sola plataforma.
          </p>
        </motion.div>

        {/* Timeline + Isometric illustration row */}
        <motion.div variants={itemVariants} className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Timeline */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-3">
              Operación en tiempo real
            </div>
            <div className="login-glass rounded-xl p-4 lg:p-5">
              <LoginTimeline />
            </div>
          </div>

          {/* Isometric illustration */}
          <div className="hidden lg:flex flex-shrink-0 w-[200px] xl:w-[240px] items-start justify-center">
            <motion.div
              className="relative w-full aspect-[6/5] rounded-xl overflow-hidden login-glass"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <img
                src="https://readdy.ai/api/search-image?query=Isometric%203D%20illustration%20of%20modern%20logistics%20warehouse%20dock%20bay%2C%20semi%20truck%20with%20trailer%20at%20loading%20bay%2C%20forklift%20carrying%20pallet%2C%20stacked%20cardboard%20boxes%20on%20wooden%20pallets%2C%20clean%20minimal%20design%2C%20dark%20navy%20and%20teal%20color%20palette%2C%20soft%20ambient%20lighting%2C%20professional%20enterprise%20SaaS%20illustration%20style%2C%20no%20text%2C%20subtle%20gradients%2C%20premium%20tech%20aesthetic&width=500&height=420&seq=login-isometric-dock&orientation=squarish"
                alt="Ilustración isométrica logística"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-sro-navy-950/60 to-transparent" />
            </motion.div>
          </div>
        </motion.div>

        {/* KPIs */}
        <motion.div variants={itemVariants} className="mt-auto pt-6 lg:pt-8">
          <LoginKPIs />
          <div className="mt-4 text-center">
            <span className="text-[11px] text-white/25">
              Conectando operaciones,{' '}
              <span className="text-sro-teal/60">optimizando resultados.</span>
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}