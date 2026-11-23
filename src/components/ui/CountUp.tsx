import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/hooks/useMediaQuery';

/**
 * Display-only count-up for an already formatted figure ("SAR 1,234.56", "12.50%", 7).
 * The final frame always renders the exact original value; computed values are never altered.
 */
const NUM = /-?\d[\d,]*(?:\.\d+)?/;

export function CountUp({ value, duration = 1100 }: { value: string | number; duration?: number }) {
  const text = String(value);
  const [display, setDisplay] = useState(text);
  const raf = useRef<number>();

  useEffect(() => {
    const m = text.match(NUM);
    if (!m || prefersReducedMotion()) {
      setDisplay(text);
      return;
    }
    const raw = m[0];
    const target = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(target) || target === 0) {
      setDisplay(text);
      return;
    }
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const grouped = raw.includes(',') || Math.abs(target) >= 1000;
    const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    const head = text.slice(0, m.index);
    const tail = text.slice((m.index ?? 0) + raw.length);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      if (p >= 1) {
        setDisplay(text);
        return;
      }
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(head + fmt.format(target * e) + tail);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [text, duration]);

  return (
    <>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
