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
import { saveTask } from "@/features/tasks/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { utcToWallClock } from "@/lib/calendar/time";
import { isErrand } from "@/lib/tasks/task-kinds";
import type { CourseRow, TaskRow } from "@/lib/supabase/types";
import {
  STUDY_METHODS,
  TASK_STATUSES,
  TASK_TYPES,
  defaultTaskInput,
  taskSchema,
  type TaskInput,
} from "@/lib/validation/task";

const SCALE = [1, 2, 3, 4, 5] as const;

function toFormValues(
  task: TaskRow | null,
  timeZone: string,
  parentTaskId: string | null,
): TaskInput {
  if (!task) return { ...defaultTaskInput, parentTaskId };

  return {
    title: task.title,
    courseId: task.course_id,
    parentTaskId: task.parent_task_id,
    description: task.description,
    // Deadlines is the coursework screen; a to-do edited from here keeps its
    // own kind only if this form can represent it.
    taskType: isCoursework(task.task_type) ? task.task_type : "other",
    status: task.status,
    priority: task.priority,
    difficulty: task.difficulty,
    // Stored as an instant, shown as the student's own wall clock.
    deadlineLocal: task.deadline ? utcToWallClock(task.deadline, timeZone) : null,
    estimatedMinutes: task.estimated_minutes,
    completedMinutes: task.completed_minutes,
    preferredStudyMethod: task.preferred_study_method,
  };
}

/** Coursework is everything that is not one of life's errands. */
function isCoursework(type: TaskRow["task_type"]): type is TaskInput["taskType"] {
  return !isErrand(type);
}

export function TaskFormDialog({
  courses,
  task = null,
  parentTaskId = null,
  timeZone,
  trigger,
}: {
  courses: CourseRow[];
  task?: TaskRow | null;
  parentTaskId?: string | null;
  timeZone: string;
  trigger: TriggerStyle;
}) {
  const t = useTranslations("tasks");
  const tCommon = useTranslations("common");
  const message = useValidationText();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: toFormValues(task, timeZone, parentTaskId),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(toFormValues(task, timeZone, parentTaskId));
      setFormError(null);
    }
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveTask(values, task?.id);

      if (result.ok) {
        setOpen(false);
        return;
      }
      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof TaskInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  const heading = task ? t("edit") : parentTaskId ? t("addSubtask") : t("add");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger aria-label={trigger.ariaLabel} className={triggerClassName(trigger)}>
        {trigger.icon}
        {trigger.label}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription className="sr-only">{heading}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {message(formError)}
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
            <NativeSelect label={t("fields.course")} {...register("courseId")}>
              <option value="">{t("fields.noCourse")}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect label={t("fields.type")} {...register("taskType")}>
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.deadline")}
              type="datetime-local"
              error={message(errors.deadlineLocal?.message)}
              {...register("deadlineLocal")}
            />
            <NativeSelect label={t("fields.status")} {...register("status")}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.estimatedMinutes")}
              type="number"
              inputMode="numeric"
              min={0}
              step={15}
              hint={t("fields.estimatedHint")}
              error={message(errors.estimatedMinutes?.message)}
              {...register("estimatedMinutes", { valueAsNumber: true })}
            />
            <FormField
              label={t("fields.completedMinutes")}
              type="number"
              inputMode="numeric"
              min={0}
              step={15}
              error={message(errors.completedMinutes?.message)}
              {...register("completedMinutes", { valueAsNumber: true })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NativeSelect
              label={t("fields.priority")}
              {...register("priority", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              label={t("fields.difficulty")}
              {...register("difficulty", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <NativeSelect label={t("fields.method")} {...register("preferredStudyMethod")}>
            <option value="">{t("fields.noMethod")}</option>
            {STUDY_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`methods.${method}`)}
              </option>
            ))}
          </NativeSelect>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="task-description">
              {t("fields.description")}
            </label>
            <Textarea id="task-description" rows={3} {...register("description")} />
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
