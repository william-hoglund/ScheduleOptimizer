import type en from "@/i18n/messages/en.json";
import type { Locale } from "@/i18n/config";

/**
 * Makes translation keys type-safe: `t("landing.hero.title")` is checked at
 * compile time, and a typo is a build error rather than a string like
 * "landing.hero.titel" rendered to the student.
 *
 * English is the reference shape. That means this does NOT catch a key that
 * exists in English but is missing from Swedish — `npm run check:messages`
 * covers that.
 */
declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
