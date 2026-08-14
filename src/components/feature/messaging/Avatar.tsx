interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
}

export default function Avatar({ name, url, size = 32 }: AvatarProps) {
  const initial = (name || '?').charAt(0).toUpperCase();

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover flex-shrink-0 bg-emerald-100"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 text-emerald-700 font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.42) }}
    >
      {initial}
    </div>
  );
}