import { AlertTriangle, Heart, Sparkles } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import type { DailyBriefing, GreetingBand } from "@/lib/briefing/build-daily-briefing";

/**
 * "What actually matters today?" — the Daily Briefing, shown at the top of
 * the Dashboard. Built entirely from `DailyBriefing`, a plain object the
 * server already assembled — this component only renders it.
 */

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export async function DailyBriefingPanel({
  briefing,
  greeting,
  courseNameById,
  timeZone,
}: {
  briefing: DailyBriefing;
  greeting: GreetingBand;
  courseNameById: Record<string, string>;
  timeZone: string;
}) {
  const t = await getTranslations("briefing");
  const tForecast = await getTranslations("intelligence.forecast");
  const format = await getFormatter();

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "numeric", minute: "2-digit", timeZone });

  return (
    <section className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="text-primary size-4" aria-hidden="true" />
        <h2 className="text-base font-semibold">{t(`greeting.${greeting}`)}</h2>
      </div>

      <div className="space-y-2">
        <h3 className="label-caps">{t("focusTitle")}</h3>
        {briefing.focusSessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noFocus")}</p>
        ) : (
          <ol className="space-y-1.5">
            {briefing.focusSessions.map((session, index) => (
              <li key={`${session.startAt}-${index}`} className="flex items-baseline gap-2 text-sm">
                <span className="text-muted-foreground text-numeric">{index + 1}.</span>
                <span className="flex-1">
                  {session.courseId && courseNameById[session.courseId] ? (
                    <span className="text-muted-foreground">{courseNameById[session.courseId]} — </span>
                  ) : null}
                  {session.title}
                </span>
                <span className="text-numeric text-muted-foreground text-xs">
                  {formatMinutes(session.minutes)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="text-numeric flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          {t("plannedLabel")}: <span className="font-medium">{formatMinutes(briefing.plannedMinutesToday)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("availableLabel")}: {formatMinutes(briefing.availableMinutesToday)}
        </span>
      </div>

      {briefing.fixedEventsToday.length > 0 ? (
        <div className="space-y-1">
          <h3 className="label-caps">{t("commitmentsTitle")}</h3>
          <ul className="text-muted-foreground space-y-0.5 text-sm">
            {briefing.fixedEventsToday.map((event, index) => (
              <li key={`${event.startAt}-${index}`} className="text-numeric">
                {time(event.startAt)}–{time(event.endAt)} {event.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {briefing.watchOut ? (
        <p className="text-warning flex items-start gap-1.5 text-sm">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">{t("watchOutTitle")}: </span>
            {tForecast(`reasons.${briefing.watchOut.code}`, briefing.watchOut.details ?? {})}
          </span>
        </p>
      ) : null}

      {briefing.protect ? (
        <p className="flex items-start gap-1.5 text-sm">
          <Heart className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">{t("protectTitle")}: </span>
            {t("protectBody", { title: briefing.protect.title })}
          </span>
        </p>
      ) : null}
    </section>
  );
}
