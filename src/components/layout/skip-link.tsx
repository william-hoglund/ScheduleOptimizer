import { getTranslations } from "next-intl/server";

/**
 * The first thing a keyboard or screen-reader user meets on every page.
 *
 * Without it, reaching the content means tabbing through the whole sidebar and
 * top bar on every single navigation. It is invisible until focused, which is
 * why it is easy to forget it exists — and why it must be the first element in
 * the layout, before the header.
 *
 * Every layout that renders a `<main id="main">` must render this above it.
 */
export async function SkipLink() {
  const t = await getTranslations("common");

  return (
    <a
      href="#main"
      className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
    >
      {t("skipToContent")}
    </a>
  );
}
