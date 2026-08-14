import { useState, useRef, useEffect } from 'react';
import type { MessagingAttachment } from '@/types/messaging';
import { getFileUrl } from '@/services/messagingService';

interface VoiceNotePlayerProps {
  attachment: MessagingAttachment;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceNotePlayer({ attachment }: VoiceNotePlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let active = true;
    getFileUrl(attachment.id)
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [attachment.id]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrent(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleEnded = () => {
    setPlaying(false);
    setCurrent(0);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 min-w-[180px]">
      <button
        onClick={toggle}
        disabled={!url}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
        title={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? <i className="ri-pause-fill text-base"></i> : <i className="ri-play-fill text-base ml-0.5"></i>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-emerald-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-emerald-600">Nota de voz</span>
          <span className="text-[10px] text-emerald-600 tabular-nums">
            {playing ? formatDuration(current) : formatDuration(duration)}
          </span>
        </div>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}
    </div>
  );
}