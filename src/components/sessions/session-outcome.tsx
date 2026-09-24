"use client";

import { Check, CircleSlash, MinusCircle, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dismissSession, recordOutcome } from "@/features/sessions/actions";
import type { StudySessionRow } from "@/lib/supabase/types";

/**
 * Recording what happened in a session.
 *
 * The wording matters here more than almost anywhere else in the product. The
 * brief is explicit that the tone must never blame — so the options are "Did
 * it", "Did some of it", "Missed it", not success and failure. Nothing is
 * marked missed automatically; the student says what happened.
 *
 * The reschedule dialog deliberately lives in the *parent*, not here. Recording
 * an outcome revalidates the page, which removes this session from the list and
 * unmounts this component — a dialog owned here would vanish the instant it was
 * needed.
 */
export function SessionOutcome({
  session,
  timeZone,
  onResolved,
  onNeedsReschedule,
}: {
  session: StudySessionRow;
  timeZone: string;
  onResolved?: () => void;
  /** Called when work was missed, so the parent can offer a new time. */
  onNeedsReschedule?: (sessionId: string) => void;
}) {
  const t = useTranslations("sessions.outcome");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [askingPartial, setAskingPartial] = useState(false);
  const [partialMinutes, setPartialMinutes] = useState(
    // Half the planned time is the most likely answer, and easier to adjust
    // than to type from scratch.
    Math.max(5, Math.round(session.planned_minutes / 2)),
  );

  function record(status: "completed" | "missed" | "partial", minutes: number) {
    startTransition(async () => {
      const result = await recordOutcome(session.id, { status, completedMinutes: minutes });
      if (!result.ok) return;

      setAskingPartial(false);

      // Missing or partly missing work is the moment to offer a new time —
      // but only as an offer.
      if (status === "missed" || status === "partial") {
        onNeedsReschedule?.(session.id);
      }
      onResolved?.();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => record("completed", session.planned_minutes)}
        >
          <Check className="size-3.5" aria-hidden="true" />
          {t("completed")}
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setAskingPartial(true)}
        >
          <MinusCircle className="size-3.5" aria-hidden="true" />
          {t("partial")}
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => record("missed", 0)}
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("missed")}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await dismissSession(session.id);
              onResolved?.();
            })
          }
        >
          <CircleSlash className="size-3.5" aria-hidden="true" />
          {t("dismiss")}
        </Button>
      </div>

      <Dialog open={askingPartial} onOpenChange={setAskingPartial}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("howLong")}</DialogTitle>
            <DialogDescription>
              {session.title} ·{" "}
              {format.dateTime(new Date(session.start_at), {
                hour: "2-digit",
                minute: "2-digit",
                timeZone,
              })}
            </DialogDescription>
          </DialogHeader>

          <FormField
            label={t("howLong")}
            type="number"
            min={1}
            max={session.planned_minutes}
            step={5}
            value={partialMinutes}
            onChange={(event) => setPartialMinutes(Number(event.target.value))}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAskingPartial(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button
              disabled={isPending || partialMinutes < 1}
              onClick={() => record("partial", partialMinutes)}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
