/**
 * Reproduce un sonido corto de notificación usando la Web Audio API.
 * No depende de archivos externos: genera un "ding" de dos tonos.
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    return audioContext;
  } catch {
    return null;
  }
}

export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Reanuda el contexto si el navegador lo suspendió (política de autoplay)
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    // Ding de dos tonos (tipo campanita suave)
    playTone(880, 0, 0.18, 0.25);
    playTone(1174.66, 0.09, 0.22, 0.18);
  } catch {
    // ignore — el sonido es un extra, nunca debe romper la app
  }
}