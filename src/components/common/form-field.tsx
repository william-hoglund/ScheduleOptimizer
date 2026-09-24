"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled input with its error message wired up for screen readers.
 *
 * The three bindings that matter and are easy to forget:
 *   htmlFor/id          — clicking the label focuses the input
 *   aria-describedby    — the error is read out with the field
 *   aria-invalid        — the field is announced as invalid, not just coloured
 */
export function FormField({
  label,
  error,
  hint,
  className,
  ref,
  ...props
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
} & React.ComponentProps<typeof Input>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>

      <Input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />

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
