"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { useState } from "react";

import { NavLink } from "./nav-link";
import { mobileNavItems, allNavItems } from "./nav-items";
import { Logo } from "./logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Bottom bar on small screens: four destinations plus "More".
 *
 * A bottom bar rather than a top drawer because it sits in reach of a thumb —
 * a student checking their plan between lectures is holding the phone in one
 * hand.
 */
export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label={t("mainNavigation")}
      className="bg-card fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
      // Keeps the bar clear of the iOS home indicator.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // min-h-14 keeps every target comfortably above the 44px
                  // minimum for touch.
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="text-muted-foreground flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium"
              aria-label={t("openMenu")}
            >
              <Menu className="size-5" aria-hidden="true" />
              <span>{t("openMenu")}</span>
            </SheetTrigger>

            <SheetContent side="bottom" className="rounded-t-xl">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <Logo name={t("mainNavigation")} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4 pb-8">
                {allNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={t(item.labelKey)}
                      icon={<Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />}
                      onNavigate={() => setOpen(false)}
                    />
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
