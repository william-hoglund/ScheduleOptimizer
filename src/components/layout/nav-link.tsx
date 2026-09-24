"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The icon arrives as an already-rendered node rather than as a component.
 *
 * A Server Component cannot pass a function (which a Lucide icon is) across the
 * boundary to a Client Component — React has nothing to serialise. Rendered
 * elements serialise fine, so the caller renders the icon and we place it.
 */
export function NavLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: Route;
  label: string;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      // aria-current is what a screen reader announces. The colour change alone
      // would not tell a non-sighted user which page they are on.
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-sidebar-accent-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
