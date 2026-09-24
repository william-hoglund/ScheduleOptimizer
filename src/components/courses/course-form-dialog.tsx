"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { triggerClassName, type TriggerStyle } from "@/components/common/trigger-style";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { saveCourse } from "@/features/courses/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { courseSchema, type CourseInput } from "@/lib/validation/academic";
import type { CourseRow, ProgramRow } from "@/lib/supabase/types";

const SCALE = [1, 2, 3, 4, 5] as const;

function toFormValues(course: CourseRow | null): CourseInput {
  return {
    name: course?.name ?? "",
    code: course?.code ?? null,
    programId: course?.program_id ?? null,
    description: course?.description ?? null,
    color: course?.color ?? null,
    difficulty: course?.difficulty ?? 3,
    priority: course?.priority ?? 3,
    targetGrade: course?.target_grade ?? null,
    estimatedWeeklyHours: course?.estimated_weekly_hours ?? null,
    startDate: course?.start_date ?? null,
    endDate: course?.end_date ?? null,
  };
}

export function CourseFormDialog({
  programs,
  course = null,
  trigger,
  onSaved,
}: {
  programs: ProgramRow[];
  course?: CourseRow | null;
  trigger: TriggerStyle;
  onSaved?: () => void;
}) {
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  const message = useValidationText();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: toFormValues(course),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Re-seed on open so a cancelled edit does not leave stale values behind.
      reset(toFormValues(course));
      setFormError(null);
    }
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveCourse(values, course?.id);

      if (result.ok) {
        setOpen(false);
        onSaved?.();
        return;
      }

      // Server-side validation wins: apply its codes to the matching fields.
      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof CourseInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger aria-label={trigger.ariaLabel} className={triggerClassName(trigger)}>
        {trigger.icon}
        {trigger.label}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? t("edit") : t("add")}</DialogTitle>
          <DialogDescription className="sr-only">{course ? t("edit") : t("add")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {message(formError)}
            </p>
          ) : null}

          <FormField
            label={t("fields.name")}
            placeholder={t("fields.namePlaceholder")}
            autoFocus
            error={message(errors.name?.message)}
            {...register("name")}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.code")}
              placeholder={t("fields.codePlaceholder")}
              error={message(errors.code?.message)}
              {...register("code")}
            />

            <NativeSelect label={t("fields.program")} {...register("programId")}>
              <option value="">{t("fields.noProgram")}</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NativeSelect
              label={t("fields.difficulty")}
              {...register("difficulty", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {t(`scale.difficulty${value}` as "scale.difficulty1")}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              label={t("fields.priority")}
              {...register("priority", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {t(`scale.priority${value}` as "scale.priority1")}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.weeklyHours")}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={168}
              hint={t("fields.weeklyHoursHint")}
              error={message(errors.estimatedWeeklyHours?.message)}
              {...register("estimatedWeeklyHours", {
                // An empty number input must become null, not NaN.
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
            <FormField
              label={t("fields.targetGrade")}
              error={message(errors.targetGrade?.message)}
              {...register("targetGrade")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.startDate")}
              type="date"
              error={message(errors.startDate?.message)}
              {...register("startDate")}
            />
            <FormField
              label={t("fields.endDate")}
              type="date"
              error={message(errors.endDate?.message)}
              {...register("endDate")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="course-description">
              {t("fields.description")}
            </label>
            <Textarea id="course-description" rows={3} {...register("description")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
