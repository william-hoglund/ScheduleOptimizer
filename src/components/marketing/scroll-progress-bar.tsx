"use client";

import { useEffect, useState } from "react";

/**
 * A slim bar across the very top of the viewport tracking how far down the
 * page a visitor has scrolled — the one piece of motion that's constantly,
 * subtly responsive to scrolling itself, rather than triggered by crossing a
 * section boundary. rAF-throttled so it costs nothing on scroll.
 */
export function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    function update() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const value = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, value)));
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="bg-primary/10 fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden="true">
      <div
        className="bg-primary h-full transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
