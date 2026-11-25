import { useId } from "react";

/**
 * The sample post's picture: a drawn tandir patir in the bakery's own warm palette, lit from the
 * top left like the work light. Drawn, not a photo, and the post above it is marked "namuna".
 */
export function SamplePicture({ label }: { label: string }) {
  const id = useId().replace(/:/g, "");
  // The stamp in the middle of a patir: two rings of pricks and one in the centre.
  const ring = (r: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  // Sesame on the rim, scattered by a fixed rule so the server and the browser draw the same.
  const sesame = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.09;
    const r = 82 + ((i * 7) % 13);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (i * 47) % 180 };
  });
  return (
    <svg viewBox="0 20 400 230" role="img" aria-label={label} className="block h-auto w-full">
      <defs>
        <radialGradient id={`${id}-bg`} cx="22%" cy="8%" r="95%">
          <stop offset="0" stopColor="#7a3a17" />
          <stop offset="0.55" stopColor="#3a1a0c" />
          <stop offset="1" stopColor="#170a05" />
        </radialGradient>
        <radialGradient id={`${id}-crust`} cx="38%" cy="32%" r="72%">
          <stop offset="0" stopColor="#f7d49a" />
          <stop offset="0.55" stopColor="#dc9550" />
          <stop offset="1" stopColor="#8a3f17" />
        </radialGradient>
        <radialGradient id={`${id}-crumb`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f8dcaa" />
          <stop offset="1" stopColor="#d9a062" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#${id}-bg)`} />
      {/* The second, smaller patir behind, in shadow. */}
      <ellipse cx="96" cy="214" rx="86" ry="30" fill={`url(#${id}-shade)`} />
      <g transform="translate(96 176)" opacity="0.82">
        <circle r="68" fill={`url(#${id}-crust)`} />
        <circle r="36" fill={`url(#${id}-crumb)`} />
        {ring(22, 10).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#a8622b" />
        ))}
      </g>
      {/* The patir in front. */}
      <ellipse cx="246" cy="228" rx="128" ry="30" fill={`url(#${id}-shade)`} />
      <g transform="translate(246 140)">
        <circle r="104" fill={`url(#${id}-crust)`} />
        {sesame.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx="3.6" ry="1.7" fill="#fff1d2" opacity="0.85" transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
        ))}
        <circle r="56" fill={`url(#${id}-crumb)`} stroke="#c07a3c" strokeOpacity="0.55" strokeWidth="3" />
        {ring(38, 16).map((p, i) => (
          <circle key={`a${i}`} cx={p.x} cy={p.y} r="3.4" fill="#a8622b" />
        ))}
        {ring(20, 8).map((p, i) => (
          <circle key={`b${i}`} cx={p.x} cy={p.y} r="3" fill="#a8622b" />
        ))}
        <circle r="3.4" fill="#a8622b" />
      </g>
    </svg>
  );
}
