import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One number, with enough room around it to be read at a glance.
 *
 * Deliberately quiet: no colour unless something needs attention, no icon
 * unless it says something the label does not. A dashboard that shouts at a
 * student every morning is a dashboard they stop opening — which is the same
 * reasoning behind the tone rules in §38 of the plan.
 *
 * The value is mono and tabular so a row of tiles lines up and a changing
 * number does not make the layout twitch.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** `attention` is for something the student should act on, not for good news. */
  tone?: "neutral" | "attention";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-xl border p-4",
        tone === "attention" && "border-warning/40 bg-warning/5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        ) : null}
        <p className="label-caps">{label}</p>
      </div>

      <p className="text-numeric mt-2 text-2xl leading-none font-semibold tracking-tight">
        {value}
      </p>

      {hint ? (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}
