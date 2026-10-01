"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * "Your profile says Europe/Stockholm, but your browser says
 * Australia/Sydney" — catching the gap directly rather than leaving a
 * mismatched zone to be discovered by a confusing calendar.
 *
 * Registration auto-detects the browser's zone (`register-form.tsx`), so a
 * fresh account starts correct. This exists for everything that isn't that:
 * an account from before that existed, a value that was never changed, a
 * student who travels. Comparing on every Settings visit is simpler and more
 * robust than trying to enumerate every way the two could drift apart.
 *
 * Read, never written automatically — the student presses the button. A
 * silent auto-correct would be the same mistake this bug report is about,
 * just pointed the other way, the moment someone is traveling on purpose.
 */
export function TimezoneMismatchHint({
  current,
  onUse,
}: {
  current: string;
  onUse: (zone: string) => void;
}) {
  const t = useTranslations("settings.profile");
  const [browserZone, setBrowserZone] = useState<string | null>(null);

  // Starts null on both server and client so the first paint matches (no
  // hydration mismatch — see AGENTS.md's identical warning about reading the
  // clock in a client component), then fills in once mounted, which is the
  // earliest point a browser API genuinely exists to read.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with a browser API that does not exist during SSR; see comment above.
      setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // An environment too old to report one gets no hint rather than a guess.
    }
  }, []);

  if (!browserZone || browserZone === current) return null;

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
      {t("timezoneMismatch", { zone: browserZone })}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={() => onUse(browserZone)}
      >
        {t("timezoneMismatchUse", { zone: browserZone })}
      </Button>
    </p>
  );
}
