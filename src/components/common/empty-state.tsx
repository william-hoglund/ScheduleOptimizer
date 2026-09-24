import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The state a student sees most often at the start. It should say what this
 * area is for and offer the single next action — never just "No data".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground mb-4 rounded-full p-3">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm text-balance">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
