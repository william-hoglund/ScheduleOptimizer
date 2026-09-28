import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";
import { Logo } from "@/components/layout/logo";
import { PreferencesMenu } from "@/components/layout/preferences-menu";
import { SkipLink } from "@/components/layout/skip-link";
import { ScrollProgressBar } from "@/components/marketing/scroll-progress-bar";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollProgressBar />
      <SkipLink />

      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 lg:px-6">
          <Link href="/" className="rounded-md">
            <Logo name={t("app.name")} />
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <PreferencesMenu />
            <ButtonLink variant="ghost" size="sm" href="/login">
              {t("landing.signIn")}
            </ButtonLink>
            <ButtonLink size="sm" href="/register">
              {t("landing.getStarted")}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 lg:px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="space-y-2">
              <Logo name={t("app.name")} />
              <p className="text-muted-foreground max-w-xs text-xs">
                {t("landing.footer.notAffiliated")}
              </p>
            </div>

            <div className="flex gap-12">
              <div className="space-y-2.5">
                <h2 className="label-caps">{t("landing.footer.product")}</h2>
                <ul className="text-muted-foreground space-y-2 text-sm">
                  <li>
                    <a href="#how-it-works" className="hover:text-foreground transition-colors">
                      {t("landing.footer.howItWorks")}
                    </a>
                  </li>
                  <li>
                    <a href="#features" className="hover:text-foreground transition-colors">
                      {t("landing.footer.features")}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground mt-8 border-t pt-6 text-xs">
            {t("landing.footer.rights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
