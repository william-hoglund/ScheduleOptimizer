"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Animates a section in and out as it crosses the viewport — both scrolling
 * down into it and, deliberately, scrolling back up past it (§ "make it more
 * interesting when scrolling up and down", Session 17). Re-entering the
 * observer's threshold toggles `visible` back to `false` rather than
 * disconnecting after the first trigger, so the motion is something to
 * notice on every pass, not a one-time intro.
 *
 * `tw-animate-css`'s `animate-in` utilities (used for above-the-fold content
 * that's visible from first paint) only ever play once, on mount — wrong for
 * anything off-screen at load, since the animation would already be finished
 * before a visitor scrolls to it. This is the bidirectional counterpart:
 * a CSS *transition* (not a keyframe animation) driven by one class flip,
 * which still respects `prefers-reduced-motion` for free via the global rule
 * in `globals.css` (`transition-duration: 0.01ms !important`).
 *
 * A Server Component page can render this as a wrapper around server-
 * rendered children — only this boundary needs the client.
 */
type Variant = "up" | "scale" | "left" | "right";

const HIDDEN: Record<Variant, string> = {
  up: "translate-y-6 opacity-0",
  scale: "scale-95 opacity-0",
  left: "-translate-x-8 opacity-0",
  right: "translate-x-8 opacity-0",
};

const VISIBLE: Record<Variant, string> = {
  up: "translate-y-0 opacity-100",
  scale: "scale-100 opacity-100",
  left: "translate-x-0 opacity-100",
  right: "translate-x-0 opacity-100",
};

export function RevealOnScroll({
  children,
  className,
  delayMs = 0,
  variant = "up",
  /** Rare case (the hero's first paint already handles its own entrance): stop re-triggering after the first reveal. */
  once = false,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  variant?: Variant;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      // Two-sided margin: a section starts (and re-triggers) its animation a
      // little before it's fully on screen in either scroll direction,
      // rather than snapping in right at the viewport edge.
      { threshold: 0.15, rootMargin: "-8% 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? VISIBLE[variant] : HIDDEN[variant],
        className,
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
