import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonStyleProps = VariantProps<typeof buttonVariants>;

/**
 * A link that looks like a button.
 *
 * Deliberately uses `buttonVariants` (the class helper) rather than the Button
 * component. Base UI's Button always applies button semantics: passing it a
 * link either warns, or with `nativeButton={false}` renders
 * `<a role="button">` — which a screen reader announces as a button even though
 * it navigates, and which muddies Cmd-click and "open in new tab".
 *
 * Styling a real <a> keeps link semantics and gets the same appearance.
 */
export function ButtonLink({
  href,
  className,
  variant,
  size,
  children,
  ...props
}: { href: Route } & ButtonStyleProps & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}

/** Same, for in-page anchors and external URLs, which are not typed routes. */
export function ButtonAnchor({
  className,
  variant,
  size,
  children,
  ...props
}: ButtonStyleProps & ComponentProps<"a">) {
  return (
    <a className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </a>
  );
}
