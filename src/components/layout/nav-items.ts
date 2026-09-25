import type { Route } from "next";
import {
  ArrowDownUp,
  CheckSquare,
  BarChart3,
  Bot,
  CalendarDays,
  GraduationCap,
  LayoutGrid,
  ListTodo,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** Keys under the `nav` namespace in src/i18n/messages/*.json. */
export type NavLabelKey =
  | "dashboard"
  | "calendar"
  | "planner"
  | "courses"
  | "deadlines"
  | "todos"
  | "insights"
  | "importExport"
  | "advisor"
  | "settings";

export type NavItem = {
  href: Route;
  labelKey: NavLabelKey;
  icon: LucideIcon;
};

/**
 * Ordered by how often a student needs them, not alphabetically. "Today"
 * answers "what now?", which is the question the product exists to answer.
 */
export const primaryNavItems: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutGrid },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/planner", labelKey: "planner", icon: Sparkles },
  { href: "/courses", labelKey: "courses", icon: GraduationCap },
  { href: "/deadlines", labelKey: "deadlines", icon: ListTodo },
  { href: "/todos", labelKey: "todos", icon: CheckSquare },
];

export const secondaryNavItems: readonly NavItem[] = [
  { href: "/insights", labelKey: "insights", icon: BarChart3 },
  { href: "/import-export", labelKey: "importExport", icon: ArrowDownUp },
  { href: "/advisor", labelKey: "advisor", icon: Bot },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export const allNavItems: readonly NavItem[] = [...primaryNavItems, ...secondaryNavItems];

/**
 * Shown in the mobile bottom bar. Four items plus a "More" trigger — five
 * targets is about the limit before they get too small to hit reliably.
 */
export const mobileNavItems: readonly NavItem[] = primaryNavItems.slice(0, 4);
