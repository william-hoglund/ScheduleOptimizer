import { cn } from "@/lib/utils";

/**
 * Abstract mark: three stacked bars of different lengths, reading as a week of
 * blocked-out time. Deliberately not an illustration of a student or a book.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="7" y="9" width="18" height="3.5" rx="1.75" className="fill-primary-foreground" />
      <rect
        x="7"
        y="14.25"
        width="11"
        height="3.5"
        rx="1.75"
        className="fill-primary-foreground opacity-70"
      />
      <rect
        x="7"
        y="19.5"
        width="14.5"
        height="3.5"
        rx="1.75"
        className="fill-primary-foreground opacity-45"
      />
    </svg>
  );
}

export function Logo({ className, name }: { className?: string; name: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-[0.9375rem] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
