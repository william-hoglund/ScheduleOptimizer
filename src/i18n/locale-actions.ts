"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

/**
 * Switches the interface language.
 *
 * From Session 3 this also writes to `profiles.locale`, so the choice follows
 * the student to a different device rather than living only in this browser.
 */
export async function setLocale(next: string): Promise<void> {
  if (!isLocale(next)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
