import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/layout/logo";
import { PreferencesMenu } from "@/components/layout/preferences-menu";
import { SkipLink } from "@/components/layout/skip-link";

/**
 * Onboarding gets its own chrome: no sidebar, no navigation. There is nothing
 * useful to navigate to yet, and an empty app shell around a setup wizard just
 * invites the student to wander off half-finished.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />

      <header className="flex h-14 shrink-0 items-center border-b px-4 lg:px-6">
        <Link href="/dashboard" className="rounded-md">
          <Logo name={t("name")} />
        </Link>
        <div className="ml-auto">
          <PreferencesMenu />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 px-4 py-10">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
