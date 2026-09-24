import { getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">{t("body")}</p>
      <ButtonLink className="mt-6" href="/dashboard">
        {t("action")}
      </ButtonLink>
    </div>
  );
}
