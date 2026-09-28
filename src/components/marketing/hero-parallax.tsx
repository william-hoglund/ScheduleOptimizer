"use client";

import { useEffect, useRef } from "react";

/**
 * A gentle depth effect on the hero visual: it drifts down slightly slower
 * than the page scrolls past it, capped so it settles rather than running
 * away on a long scroll. Written directly to the DOM node's transform in a
 * scroll listener (not React state) — a value that changes on every scroll
 * tick has no business going through a render.
 */
export function HeroParallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // An inline `transform` set directly on the node (below) would outrank a
    // `motion-reduce:` utility class on specificity alone, so reduced motion
    // has to be checked here rather than left to CSS.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;

    function update() {
      if (node) {
        const offset = Math.min(Math.max(window.scrollY, 0), 400) * 0.08;
        node.style.transform = `translateY(${offset}px)`;
      }
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div ref={ref}>{children}</div>;
}
