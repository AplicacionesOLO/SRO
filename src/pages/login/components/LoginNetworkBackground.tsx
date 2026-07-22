import { memo } from 'react';

interface Props {
  intensity?: 'low' | 'medium' | 'high';
}

const nodes = [
  { cx: 8, cy: 18 }, { cx: 22, cy: 12 }, { cx: 38, cy: 22 },
  { cx: 52, cy: 8 }, { cx: 68, cy: 28 }, { cx: 82, cy: 16 },
  { cx: 12, cy: 48 }, { cx: 32, cy: 42 }, { cx: 48, cy: 52 },
  { cx: 62, cy: 38 }, { cx: 78, cy: 48 }, { cx: 92, cy: 58 },
  { cx: 18, cy: 72 }, { cx: 42, cy: 68 }, { cx: 58, cy: 78 },
  { cx: 74, cy: 64 }, { cx: 94, cy: 74 }, { cx: 28, cy: 88 },
  { cx: 54, cy: 84 }, { cx: 84, cy: 92 },
];

const connections = [
  [0, 1], [1, 2], [2, 4], [0, 6], [6, 7], [7, 8], [8, 9], [9, 10],
  [1, 7], [3, 9], [4, 10], [6, 12], [7, 13], [8, 13], [9, 14], [10, 15],
  [12, 16], [13, 17], [14, 17], [15, 18], [11, 15], [5, 11], [2, 8],
  [16, 18], [18, 19],
];

const opacityMap = { low: 0.06, medium: 0.12, high: 0.22 };

export default memo(function LoginNetworkBackground({ intensity = 'low' }: Props) {
  const baseOp = opacityMap[intensity];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`grad-${intensity}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(13,148,136,0)" />
          <stop offset="50%" stopColor={`rgba(13,148,136,${baseOp * 2})`} />
          <stop offset="100%" stopColor="rgba(13,148,136,0)" />
        </linearGradient>
      </defs>
      {connections.map(([a, b], i) => (
        <line
          key={`l-${i}`}
          x1={`${nodes[a].cx}%`}
          y1={`${nodes[a].cy}%`}
          x2={`${nodes[b].cx}%`}
          y2={`${nodes[b].cy}%`}
          stroke={`url(#grad-${intensity})`}
          strokeWidth="1"
          style={{
            strokeDasharray: '3 8',
            strokeDashoffset: 100,
            animation: `networkLine ${7 + (i % 5)}s linear infinite`,
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={`${n.cx}%`}
          cy={`${n.cy}%`}
          r="1.5"
          fill={`rgba(6,182,212,${baseOp * 3})`}
          style={{
            animation: `networkNode ${3 + (i % 3)}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </svg>
  );
});