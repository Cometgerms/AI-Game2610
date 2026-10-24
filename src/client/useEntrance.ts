import { useLayoutEffect, type RefObject } from 'react';
import { createScope, createTimeline } from 'animejs';

/** @requires A mounted application root. @ensures Finite entrance motion is reverted on navigation and disabled for reduced-motion users. */
export function useEntrance(root: RefObject<HTMLDivElement | null>, page: string, replay: number) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scope: ReturnType<typeof createScope> | undefined;
    const start = () => {
      scope?.revert();
      if (preference.matches) { element.dataset.motion = 'reduced'; return; }
      element.dataset.motion = 'entering';
      scope = createScope({ root }).add(() => {
        const timeline = createTimeline({ defaults: { ease: 'out(3)' }, onComplete: () => { element.dataset.motion = 'ready'; } });
        const headings = element.querySelectorAll('.page-heading h1, .profile-welcome h1');
        if (headings.length) timeline.add(headings, { opacity: [.4, 1], duration: 280 }, 0);
        element.dataset.motion = 'ready';
      });
    };
    start();
    preference.addEventListener('change', start);
    return () => { preference.removeEventListener('change', start); scope?.revert(); delete element.dataset.motion; };
  }, [root, page, replay]);
}
