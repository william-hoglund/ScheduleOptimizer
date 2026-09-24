"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { removeCalendarEvent, saveCalendarEvent } from "@/features/calendar/actions";
import type { CalendarEventDto } from "@/features/calendar/event-dto";
import { useValidationText } from "@/features/shared/use-validation-text";
import { utcToWallClock } from "@/lib/calendar/time";
import type { CourseRow } from "@/lib/supabase/types";
import {
  EVENT_TYPES,
  calendarEventSchema,
  defaultCalendarEventInput,
  type CalendarEventInput,
} from "@/lib/validation/calendar-event";

function initialValues(
  event: CalendarEventDto | null,
  initialRange: { startLocal: string; endLocal: string } | null,
  timeZone: string,
): CalendarEventInput {
  if (event) {
    return {
      title: event.title,
      courseId: event.courseId,
      eventType: event.eventType,
      description: event.description,
      location: event.location,
      startLocal: utcToWallClock(event.startIso, timeZone),
      endLocal: utcToWallClock(event.endIso, timeZone),
      isFixed: event.isFixed,
    };
  }
  return defaultCalendarEventInput(initialRange?.startLocal ?? "", initialRange?.endLocal ?? "");
}

/**
 * The form body.
 *
 * Split out so the parent can remount it with a `key` when the target event or
 * time range changes. Re-seeding through an effect instead would mean calling
 * setState during render-commit, which cascades renders — React's own guidance
 * is to reset a form by remounting it.
 */
function EventForm({
  courses,
  timeZone,
  event,
  initialRange,
  onDone,
}: {
  courses: CourseRow[];
  timeZone: string;
  event: CalendarEventDto | null;
  initialRange: { startLocal: string; endLocal: string } | null;
  onDone: () => void;
}) {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CalendarEventInput>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: initialValues(event, initialRange, timeZone),
  });

  const isImported = event !== null && event.source !== "manual";

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveCalendarEvent(values, event?.id);

      if (result.ok) {
        onDone();
        return;
      }
      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof CalendarEventInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {message(formError)}
          </p>
        ) : null}

        {/* Editing an imported event locally would be overwritten on the next
            sync, so we say where it came from instead of pretending. */}
        {isImported ? (
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
            {t("importedNotice", { source: event.source })}
          </p>
        ) : null}

        <FormField
          label={t("fields.title")}
          placeholder={t("fields.titlePlaceholder")}
          autoFocus
          error={message(errors.title?.message)}
          {...register("title")}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <NativeSelect label={t("fields.type")} {...register("eventType")}>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect label={t("fields.course")} {...register("courseId")}>
            <option value="">{t("fields.noCourse")}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={t("fields.start")}
            type="datetime-local"
            error={message(errors.startLocal?.message)}
            {...register("startLocal")}
          />
          <FormField
            label={t("fields.end")}
            type="datetime-local"
            error={message(errors.endLocal?.message)}
            {...register("endLocal")}
          />
        </div>

        <FormField
          label={t("fields.location")}
          error={message(errors.location?.message)}
          {...register("location")}
        />

        <Controller
          control={control}
          name="isFixed"
          render={({ field }) => (
            <label className="flex items-start gap-3">
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label={t("fields.isFixed")}
              />
              <span>
                <span className="block text-sm font-medium">{t("fields.isFixed")}</span>
                <span className="text-muted-foreground block text-xs">
                  {t("fields.isFixedHint")}
                </span>
              </span>
            </label>
          )}
        />

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="event-description">
            {t("fields.description")}
          </label>
          <Textarea id="event-description" rows={2} {...register("description")} />
        </div>

        <DialogFooter className="sm:justify-between">
          {event ? (
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t("deleteConfirm")}
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : tCommon("save")}
            </Button>
          </div>
        </DialogFooter>
      </form>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody", { title: event?.title ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  if (event) await removeCalendarEvent(event.id);
                  setConfirmingDelete(false);
                  onDone();
                })
              }
            >
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Create or edit a calendar event.
 *
 * Controlled from the parent because it is opened three ways: the toolbar
 * button, clicking an existing event, and dragging out a range on the grid.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  courses,
  timeZone,
  event,
  initialRange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseRow[];
  timeZone: string;
  event: CalendarEventDto | null;
  initialRange: { startLocal: string; endLocal: string } | null;
}) {
  const t = useTranslations("calendar");

  // Identity of what is being edited. Changing it remounts the form with fresh
  // defaults; no effect, no stale values from a previous open.
  const formKey = event ? `event:${event.id}` : `range:${initialRange?.startLocal ?? "new"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? t("editEvent") : t("addEvent")}</DialogTitle>
          <DialogDescription className="sr-only">
            {event ? t("editEvent") : t("addEvent")}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <EventForm
            key={formKey}
            courses={courses}
            timeZone={timeZone}
            event={event}
            initialRange={initialRange}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
