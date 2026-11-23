import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Measures the active NavLink (aria-current="page") inside a container to drive the sliding glass highlight. */
export function useNavHighlight<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const location = useLocation();
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!el || !el.offsetWidth) {
        setBox(null);
        return;
      }
      // offsets relative to the container (the container is the offsetParent)
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== ref.current) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      setBox({ x, y, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const t = window.setTimeout(measure, 260); // after width transitions settle
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, ...deps]);
  return { ref, box };
}
