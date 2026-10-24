import { useEffect, useId, useRef } from 'react';
import { animate } from 'animejs';

type Vertex = { x: number; y: number; height: number };
function elevation(x: number, y: number) {
  const u = x + 16 * Math.sin(y / 38), v = y + 12 * Math.sin(x / 61);
  const hill = (cx: number, cy: number, rx: number, ry: number, h: number) =>
    h * Math.exp(-(((u - cx) / rx) ** 2) - ((v - cy) / ry) ** 2);
  return hill(475, 115, 106, 82, 1.2) + hill(738, 42, 87, 65, 1.1)
    + hill(680, 228, 125, 74, .85) - hill(607, 115, 61, 48, .35);
}

/** @requires A deterministic height field. @ensures Neighbouring triangles share contour endpoints. */
function topographicContours() {
  const columns = 151, rows = 46, step = 6;
  const grid: Vertex[] = Array.from({ length: columns * rows }, (_, i) => {
    const x = i % columns * step - 30, y = Math.floor(i / columns) * step - 30;
    return { x, y, height: elevation(x, y) };
  });
  return Array.from({ length: 13 }, (_, level) => {
    const height = -.15 + level * .105, segments: string[] = [];
    const trace = (points: Vertex[]) => {
      const crosses: { x: number; y: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const a = points[i], b = points[(i + 1) % 3];
        if ((a.height >= height) === (b.height >= height)) continue;
        const t = (height - a.height) / (b.height - a.height);
        crosses.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
      if (crosses.length === 2) segments.push(`M${crosses[0].x.toFixed(2)},${crosses[0].y.toFixed(2)}L${crosses[1].x.toFixed(2)},${crosses[1].y.toFixed(2)}`);
    };
    for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
      const index = row * columns + column, a = grid[index], b = grid[index + 1], c = grid[index + columns + 1], d = grid[index + columns];
      trace([a, b, c]); trace([a, c, d]);
    }
    return segments.join('');
  });
}
const contours = topographicContours();
const lettering = 'M36 0H8L0 8V18L8 25H28L36 33V42L28 50H0 M54 0H94M74 0V50 M112 50V0H140L150 10V20L140 28H112M132 28L152 50 M170 50L188 0H195L213 50M180 34H203 M231 0H271M251 0V50';

/** @requires Browser motion preferences. @ensures Decorative motion pauses off-screen and never captures input. */
export function SignalMark() {
  const root = useRef<SVGSVGElement>(null), gradient = useId().replace(/:/g, '');
  useEffect(() => {
    const element = root.current!, preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const animations = [
      animate(element.querySelector('.signal-topography')!, { x: [-4, 4], y: [2, -2], duration: 24000, alternate: true, loop: true, ease: 'inOutSine', autoplay: false }),
      animate(element.querySelector('.signal-sweep')!, { x1: [-140, 290], x2: [0, 430], duration: 3200, delay: 800, loopDelay: 4000, loop: true, ease: 'linear', autoplay: false }),
    ];
    const sync = () => {
      const playing = visible && !document.hidden && !preference.matches;
      element.dataset.motion = playing ? 'playing' : 'paused';
      animations.forEach(animation => { if (playing) animation.resume(); else { animation.pause(); if (preference.matches) animation.seek(0); } });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element); preference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync); sync();
    return () => { observer.disconnect(); animations.forEach(animation => animation.revert());
      preference.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return <svg className="profile-signal" ref={root} viewBox="0 0 840 210" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <defs><linearGradient id={gradient} className="signal-sweep" gradientUnits="userSpaceOnUse" x1="-140" x2="0" y1="0" y2="0">
      <stop offset="0" stopColor="#ed3158" stopOpacity="0" /><stop offset=".45" stopColor="#f35070" /><stop offset=".65" stopColor="#ff7590" /><stop offset="1" stopColor="#ed3158" stopOpacity="0" />
    </linearGradient></defs>
    <g className="signal-topography" fill="none" stroke="#a3b3bf" strokeLinecap="round">{contours.map((d, i) =>
      <path key={i} className="signal-contour" d={d} strokeWidth={i % 3 === 0 ? 1.1 : .65} opacity={i % 3 === 0 ? .32 : .19} />)}</g>
    <g className="strat-lettering" transform="translate(600 80) skewX(-8) scale(.64)" fill="none" strokeWidth="3" strokeLinejoin="bevel">
      <path d={lettering} stroke="#e1e5e8" opacity=".54" />
      <path d={lettering} stroke={`url(#${gradient})`} opacity=".95" />
    </g>
    <path className="signal-signature-accent" d="M605 126H630" stroke="#ed6c83" strokeWidth="2" opacity=".6" />
  </svg>;
}
