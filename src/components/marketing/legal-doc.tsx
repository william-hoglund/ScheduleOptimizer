import type { ReactNode } from "react";

/**
 * Shared typographic primitives for the Privacy Policy and Terms of Service
 * pages. Hand-styled with the same tokens as the rest of the app (no prose
 * plugin) rather than one-off classes repeated in two long documents.
 */

export function LegalLayout({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 lg:px-6 lg:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Last updated: {lastUpdated}</p>
      {intro ? <div className="text-muted-foreground mt-6 leading-relaxed">{intro}</div> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-lg font-semibold tracking-tight first:mt-0 mt-10">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground mt-3 leading-relaxed">{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5">{children}</ul>;
}

export function Li({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="text-foreground font-medium">{children}</strong>;
}

/** A note the reader (or you, before launch) needs to act on — not normal body copy. */
export function CalloutNote({ children }: { children: ReactNode }) {
  return (
    <div className="border-warning/40 bg-warning/5 mt-4 rounded-lg border p-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}
