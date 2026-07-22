import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const timelineSteps = [
  { time: '10:00', title: 'Reserva creada', detail: 'Cita creada para CEDI 17' },
  { time: '10:42', title: 'Vehículo en acceso', detail: 'ZFDP 11455 · BINTER' },
  { time: '10:47', title: 'IN registrado', detail: 'Inicio de operación' },
  { time: '11:26', title: 'Operación en andén', detail: 'Descarga en progreso' },
  { time: '11:31', title: 'OUT registrado', detail: 'Operación completada' },
];

export default function LoginTimeline() {
  const [activeIndex, setActiveIndex] = useState(2);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= timelineSteps.length ? 0 : next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-[1px] bg-white/[0.06]" />
      <div className="space-y-0">
        {timelineSteps.map((step, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <motion.div
              key={i}
              className="relative flex items-start gap-4 py-2.5"
              animate={{
                opacity: isActive ? 1 : isPast ? 0.6 : 0.35,
              }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
            >
              {/* Dot */}
              <div className="relative flex-shrink-0 w-[30px] flex justify-center">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full border border-sro-teal/40"
                  animate={{
                    backgroundColor: isActive ? 'rgba(13,148,136,0.9)' : 'transparent',
                    borderColor: isActive ? 'rgba(13,148,136,0.8)' : 'rgba(255,255,255,0.15)',
                    boxShadow: isActive
                      ? '0 0 12px rgba(13,148,136,0.4)'
                      : '0 0 0px rgba(13,148,136,0)',
                  }}
                  transition={{ duration: 0.6 }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono text-white/50 tabular-nums">{step.time}</span>
                  <span
                    className={`text-sm font-medium transition-colors duration-500 ${
                      isActive ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
                <motion.p
                  className="text-xs text-white/30 mt-0.5"
                  animate={{ opacity: isActive ? 0.7 : 0.3 }}
                  transition={{ duration: 0.5 }}
                >
                  {step.detail}
                </motion.p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}