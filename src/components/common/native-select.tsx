"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A plain <select> styled to match the Input.
 *
 * Used instead of the fancy listbox for long option lists — the time-zone
 * picker has roughly 400 entries, where a native control is both faster and
 * better behaved: real keyboard type-ahead, and the OS picker on mobile.
 */
export function NativeSelect({
  label,
  error,
  hint,
  className,
  children,
  ref,
  ...props
}: {
  label?: string;
  error?: string | undefined;
  hint?: string | undefined;
} & React.ComponentProps<"select">) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}

      <div className="relative">
        <select
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "border-input bg-background h-9 w-full appearance-none rounded-lg border px-3 py-1 pr-9 text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
      </div>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
