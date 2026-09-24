"use client";

import { Briefcase, CalendarDays, GraduationCap, Pencil, Trash2, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { CalendarSourceForm } from "./calendar-source-form";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeCalendarSource } from "@/features/import-export/actions";
import type { CalendarSourceKind } from "@/lib/supabase/types";
import { useValidationText } from "@/features/shared/use-validation-text";

/**
 * The calendars a student has, and what each one does to their days.
 *
 * This is what makes two programmes plus a job workable: three feeds that can
 * be re-imported, renamed and removed independently, and one of which is
 * allowed to say "a day of me leaves no studying".
 */

export type CalendarSourceView = {
  id: string;
  name: string;
  kind: CalendarSourceKind;
  dayEffect: "none" | "reduce" | "block";
  thresholdMinutes: number;
  reducedDailyMinutes: number;
  eventCount: number;
  importUrl: string | null;
};

const KIND_ICON = {
  study: GraduationCap,
  work: Briefcase,
  personal: User,
} as const;

export function CalendarSourceList({ sources }: { sources: CalendarSourceView[] }) {
  const t = useTranslations("importExport.calendars");
  const message = useValidationText();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarSourceView | null>(null);
  const [withEvents, setWithEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;

    startTransition(async () => {
      const result = await removeCalendarSource(deleting.id, withEvents);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      setWithEvents(false);
    });
  }

  if (sources.length === 0) {
    return <EmptyState icon={CalendarDays} title={t("empty")} description={t("emptyBody")} />;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {message(error)}
        </p>
      ) : null}

      <ul className="space-y-2">
        {sources.map((source) => {
          const Icon = KIND_ICON[source.kind];
          const hours = Math.round((source.thresholdMinutes / 60) * 10) / 10;

          return (
            <li key={source.id} className="bg-card rounded-xl border p-4">
              {editingId === source.id ? (
                <CalendarSourceForm
                  source={source}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="text-sm font-semibold">{source.name}</h3>
                        <Badge variant="outline">{t(`kinds.${source.kind}`)}</Badge>
                        <span className="text-numeric text-muted-foreground text-xs">
                          {t("events", { count: source.eventCount })}
                        </span>
                      </div>

                      <p className="text-muted-foreground mt-1 text-sm">
                        {t(`rule.${source.dayEffect}`, {
                          hours,
                          minutes: source.reducedDailyMinutes,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(source.id)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      {t("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeleting(source);
                        setWithEvents(false);
                        setError(null);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span className="sr-only">{t("delete")}</span>
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("deleteBody", { count: deleting?.eventCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>

          {/*
            Two radio buttons rather than a checkbox: deleting a term of
            lectures should be a thing you chose, not a box you missed.
          */}
          <fieldset className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="delete-events"
                checked={!withEvents}
                onChange={() => setWithEvents(false)}
              />
              {t("deleteKeepEvents")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="delete-events"
                checked={withEvents}
                onChange={() => setWithEvents(true)}
              />
              {t("deleteWithEvents")}
            </label>
          </fieldset>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? t("deleting") : t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
