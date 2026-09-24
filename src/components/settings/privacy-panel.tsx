import { Download, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ButtonAnchor } from "@/components/common/button-link";

/**
 * What we hold, and how to take it away with you.
 *
 * The download is a plain link to a route handler, so it works like any other
 * download and needs no JavaScript. Deletion is named here even though it is
 * not built: a privacy page that quietly omits it would be the one place a
 * student is most entitled to a straight answer.
 */
export async function PrivacyPanel() {
  const t = await getTranslations("settings.privacy");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("exportTitle")}
        </h2>

        <p className="text-muted-foreground max-w-prose text-sm">{t("exportBody")}</p>

        <ul className="text-muted-foreground max-w-prose list-disc space-y-1 pl-5 text-sm">
          <li>{t("includesSchedule")}</li>
          <li>{t("includesPlanning")}</li>
          <li>{t("includesAccount")}</li>
          <li>{t("excludesTokens")}</li>
        </ul>

        <ButtonAnchor href="/api/account/export" download>
          <Download className="size-4" aria-hidden="true" />
          {t("download")}
        </ButtonAnchor>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("deleteTitle")}</h2>
        <p className="text-muted-foreground max-w-prose text-sm">{t("deleteBody")}</p>
      </section>
    </div>
  );
}
