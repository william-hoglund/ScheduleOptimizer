import { CalendarOff, Flag, HelpCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { PlannerInput } from "@/lib/planner/types";

/**
 * What the student's planning note actually did to this draft — shown so a
 * misread ("away Thursday" landing on the wrong Thursday) is caught before
 * the plan is approved, not after.
 */
export function PlanNotesSummary({ notes }: { notes: NonNullable<PlannerInput["planNotes"]> }) {
  const t = useTranslations("planner.notes");
  const format = useFormatter();
  // Plain calendar dates: formatted at UTC noon so no timezone can shift the day.
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section className="bg-muted/40 space-y-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">{t("title")}</p>
      {notes.applied.length === 0 ? <p className="text-muted-foreground">{t("nothingApplied")}</p> : null}
      <ul className="space-y-1">
        {notes.applied.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            {item.kind === "unavailable" ? (
              <>
                <CalendarOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("away", { label: item.label, start: day(item.startDate), end: day(item.endDate) })}
              </>
            ) : (
              <>
                <Flag className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("finishBy", { task: item.taskTitle, date: day(item.date) })}
              </>
            )}
          </li>
        ))}
        {notes.rejected.map((text, index) => (
          <li key={`r${index}`} className="text-muted-foreground flex items-start gap-2">
            <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("notApplied", { text })}
          </li>
        ))}
      </ul>
    </section>
  );
}
