import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { defaultLocale, defaultTimeZone, isLocale, LOCALE_COOKIE } from "./config";

export default getRequestConfig(async () => {
  // `cookies()` is async in Next.js 16 — synchronous access was removed.
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;

  return {
    locale,
    timeZone: defaultTimeZone,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
