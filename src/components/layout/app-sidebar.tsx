import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { primaryNavItems, secondaryNavItems, type NavItem } from "./nav-items";

async function SidebarLink({ item }: { item: NavItem }) {
  const t = await getTranslations("nav");
  const Icon = item.icon;

  return (
    <NavLink
      href={item.href}
      label={t(item.labelKey)}
      icon={<Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />}
    />
  );
}

export async function AppSidebar() {
  const t = await getTranslations();

  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-60 shrink-0 border-r lg:flex lg:flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" className="rounded-md">
          <Logo name={t("app.name")} />
        </Link>
      </div>

      <nav aria-label={t("nav.mainNavigation")} className="flex flex-1 flex-col gap-1 px-3 py-2">
        {primaryNavItems.map((item) => (
          <SidebarLink key={item.href} item={item} />
        ))}

        <div className="mt-auto flex flex-col gap-1 pt-4">
          {secondaryNavItems.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
