import { useEffect, useRef, useState } from "react";

export function useScorePosition(target: number, animate: boolean) {
  const [visual, setVisual] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame);
      current.current = target;
      setVisual(target);
    };
    if (!animate || preference.matches) {
      settle();
      return;
    }
    const from = current.current;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 150);
      current.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setVisual(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    preference.addEventListener("change", settle);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", settle);
    };
  }, [target, animate]);
  return animate ? visual : target;
}
