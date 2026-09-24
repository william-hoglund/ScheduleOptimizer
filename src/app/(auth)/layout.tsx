import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/layout/logo";
import { SkipLink } from "@/components/layout/skip-link";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <SkipLink />

      {/* A landmark, not decoration: content outside one is unreachable when a
          screen reader navigates by region. */}
      <header className="mb-8">
        <Link href="/" className="rounded-md">
          <Logo name={t("name")} />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
