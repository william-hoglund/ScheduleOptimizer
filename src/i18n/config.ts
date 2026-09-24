/**
 * Locale configuration.
 *
 * The active locale is stored in a cookie rather than in the URL. A student's
 * language is a personal preference tied to their profile, not a different
 * version of the site, so `/calendar` stays `/calendar` in both languages.
 * From Session 3 the cookie is kept in sync with `profiles.locale`.
 */

export const locales = ["en", "sv"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "study-planner-locale";

/** One year. The choice should survive between terms. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeNames: Record<Locale, string> = {
  en: "English",
  sv: "Svenska",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

/**
 * Fallback until the student has set one. Every absolute time in the product is
 * stored in UTC; this only affects how times are displayed before a profile
 * exists.
 */
export const defaultTimeZone = "Europe/Stockholm";
