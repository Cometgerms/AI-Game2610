import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

/** @requires Browser motion preferences. @ensures Decorative motion pauses in hidden tabs and never captures input. */
export function AmbientGlow() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let animations: ReturnType<typeof animate>[] = [];
    const sync = () => {
      animations.forEach(animation => animation.revert()); animations = [];
      if (!root.current || reduced.matches || document.hidden) return;
      animations = [...root.current.children].map((element, i) => animate(element, { x: [0, i ? -70 : 100], y: [0, i ? 55 : -40], scale: [1, 1.12], duration: 22000 + i * 5000, alternate: true, loop: true, ease: 'inOutSine' }));
    };
    sync(); reduced.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
    return () => { animations.forEach(animation => animation.revert()); reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return <div className="ambient-glow" ref={root} aria-hidden="true"><i /><i /></div>;
}
