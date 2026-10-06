"use client";

import { ArrowRight, CalendarClock, Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyReschedule,
  previewReschedule,
  type ReschedulePreview,
} from "@/features/sessions/actions";

/**
 * "Here is exactly what would change."
 *
 * The brief asks for the smallest possible change, shown before it happens. The
 * engine pins every other session so only the missed work moves; this displays
 * the resulting diff and applies it only on confirmation.
 */

/**
 * The body, mounted fresh each time the dialog opens.
 *
 * Remounting rather than resetting state in an effect: clearing state on close
 * would mean a synchronous setState inside an effect, which cascades renders.
 * Starting `loading` at true means the fetch effect never has to set it either.
 */
function RescheduleBody({
  sessionIds,
  timeZone,
  onClose,
  targetDate,
}: {
  sessionIds: string[];
  timeZone: string;
  onClose: () => void;
  /** A day the student picked; the engine looks only there. */
  targetDate?: string;
}) {
  const t = useTranslations("sessions.reschedule");
  const format = useFormatter();
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    // A real planning run, so it happens on open rather than up front.
    void previewReschedule(sessionIds, targetDate ? { targetDate } : {}).then((result) => {
      if (cancelled) return;
      if (result.ok) setPreview(result.data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionIds, targetDate]);

  const time = (iso: string) =>
    format.dateTime(new Date(iso), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });

  const removed = preview?.changes.filter((change) => change.kind === "removed") ?? [];
  const added = preview?.changes.filter((change) => change.kind === "added") ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{applied ? t("applied") : t("title")}</DialogTitle>
        <DialogDescription>
          {loading ? t("checking") : applied ? "" : added.length > 0 ? t("unchanged") : ""}
        </DialogDescription>
      </DialogHeader>

      {applied ? (
        <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Check className="text-success size-4" aria-hidden="true" />
          {t("applied")}
        </p>
      ) : loading ? (
        <p className="text-muted-foreground py-6 text-sm">{t("checking")}…</p>
      ) : added.length === 0 ? (
        <div className="space-y-2 py-2">
          <p className="text-sm font-medium">{t("nothingFound")}</p>
          <p className="text-muted-foreground text-sm">{t("nothingFoundBody")}</p>
        </div>
      ) : (
        <div className="space-y-4 py-1">
          {removed.map((change, index) => {
            const replacement = added[index];

            return (
              <div
                key={`${change.startIso}-${index}`}
                className="bg-muted/40 space-y-2 rounded-lg border p-3"
              >
                <p className="text-sm font-medium">{change.title}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("removed")}</span>
                  <span className="text-numeric line-through opacity-60">
                    {time(change.startIso)}
                  </span>

                  {replacement ? (
                    <>
                      <ArrowRight className="text-muted-foreground size-3" aria-hidden="true" />
                      <span className="text-muted-foreground">{t("added")}</span>
                      <span className="text-numeric text-foreground font-medium">
                        {time(replacement.startIso)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Anything beyond a one-for-one swap: the engine may split the work
              differently to make it fit. */}
          {added.slice(removed.length).map((change, index) => (
            <div
              key={`extra-${index}`}
              className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs"
            >
              <CalendarClock className="text-muted-foreground size-3.5" aria-hidden="true" />
              <span className="font-medium">{change.title}</span>
              <span className="text-numeric">{time(change.startIso)}</span>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          {t("cancel")}
        </Button>

        {!applied && preview && added.length > 0 ? (
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await applyReschedule(preview.previewId);
                if (result.ok) setApplied(true);
              })
            }
          >
            <Check className="size-4" aria-hidden="true" />
            {isPending ? t("applying") : t("apply")}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function RescheduleDialog({
  open,
  onOpenChange,
  sessionIds,
  timeZone,
  chooseDay = false,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionIds: string[];
  timeZone: string;
  /** "Can't do this": ask which day first, then find a time on it. */
  chooseDay?: boolean;
  /** The student's local date, the earliest day that can be picked. */
  today?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          chooseDay ? (
            <ChooseDayBody
              key={sessionIds.join(",")}
              sessionIds={sessionIds}
              timeZone={timeZone}
              today={today}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <RescheduleBody
              key={sessionIds.join(",")}
              sessionIds={sessionIds}
              timeZone={timeZone}
              onClose={() => onOpenChange(false)}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Pick a day, then the normal preview-and-confirm for that day. */
function ChooseDayBody({
  sessionIds,
  timeZone,
  today,
  onClose,
}: {
  sessionIds: string[];
  timeZone: string;
  today?: string;
  onClose: () => void;
}) {
  const t = useTranslations("sessions.reschedule");
  const [day, setDay] = useState("");
  const [confirmedDay, setConfirmedDay] = useState<string | null>(null);

  if (confirmedDay) {
    return <RescheduleBody sessionIds={sessionIds} timeZone={timeZone} onClose={onClose} targetDate={confirmedDay} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("chooseDayTitle")}</DialogTitle>
        <DialogDescription>{t("chooseDayDescription")}</DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <label htmlFor="reschedule-day" className="text-sm font-medium">
          {t("chooseDayLabel")}
        </label>
        <input
          id="reschedule-day"
          type="date"
          min={today}
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className="border-input bg-background mt-1.5 block h-9 w-full rounded-md border px-3 text-sm"
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button disabled={!day} onClick={() => setConfirmedDay(day)}>
          <CalendarClock className="size-4" aria-hidden="true" />
          {t("findTime")}
        </Button>
      </DialogFooter>
    </>
  );
}
