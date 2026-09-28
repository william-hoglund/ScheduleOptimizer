"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fades a section in the first time it scrolls into view.
 *
 * `tw-animate-css`'s `animate-in` utilities (used elsewhere for above-the-fold
 * content) play once, on mount — for anything below the fold that means the
 * animation has already finished before a visitor scrolls to it, which is no
 * animation at all. This is the client-side counterpart for everything that
 * starts off-screen: an `IntersectionObserver` flips one class once, the
 * transition (not a keyframe animation) does the rest, and it still respects
 * `prefers-reduced-motion` for free via the global rule in `globals.css`
 * (`transition-duration: 0.01ms !important`), same as `animate-in` does.
 *
 * A Server Component page can still render this as a wrapper around server-
 * rendered children — only this boundary needs the client.
 */
export function RevealOnScroll({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
