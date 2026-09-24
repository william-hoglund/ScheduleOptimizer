"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { saveTodo } from "@/features/todos/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { ERRAND_TYPES, defaultMinutesFor } from "@/lib/tasks/task-kinds";
import { defaultTodoInput, type TodoInput } from "@/lib/validation/todo";

/**
 * Adding a to-do in one line.
 *
 * Only the title is required. Everything else already has an answer: the type
 * decides how long it takes, and leaving both dates empty means "sometime this
 * week", which the planner will find room for.
 *
 * The duration shows its default rather than an empty box, so the number the
 * planner is about to use is visible before it is used.
 */
export function TodoQuickAdd() {
  const t = useTranslations("todos");
  const message = useValidationText();

  const [value, setValue] = useState<TodoInput>(defaultTodoInput);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const minutes = value.estimatedMinutes ?? defaultMinutesFor(value.todoType);
  const atTime = value.fixedStartLocal !== null;

  function set<K extends keyof TodoInput>(key: K, next: TodoInput[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveTodo(null, { ...value, estimatedMinutes: minutes });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue(defaultTodoInput);
      setExpanded(false);
    });
  }

  return (
    <div className="bg-card space-y-4 rounded-xl border p-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {message(error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <FormField
          label={t("fields.title")}
          placeholder={t("fields.titlePlaceholder")}
          className="min-w-0 flex-1"
          value={value.title}
          disabled={isPending}
          onChange={(event) => set("title", event.target.value)}
          onFocus={() => setExpanded(true)}
        />

        <NativeSelect
          label={t("fields.type")}
          className="w-full sm:w-44"
          value={value.todoType}
          disabled={isPending}
          onChange={(event) => set("todoType", event.target.value as TodoInput["todoType"])}
        >
          {ERRAND_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </NativeSelect>

        <Button onClick={submit} disabled={isPending || value.title.trim().length === 0}>
          <Plus className="size-4" aria-hidden="true" />
          {isPending ? t("adding") : t("add")}
        </Button>
      </div>

      {expanded ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label={t("fields.minutes")}
            hint={t("fields.minutesHint", { minutes: defaultMinutesFor(value.todoType) })}
            type="number"
            min={5}
            max={1440}
            step={5}
            value={minutes}
            disabled={isPending}
            onChange={(event) => set("estimatedMinutes", Number(event.target.value))}
          />

          {atTime ? (
            <FormField
              label={t("fields.fixedStart")}
              hint={t("fields.fixedStartHint")}
              type="datetime-local"
              value={value.fixedStartLocal ?? ""}
              disabled={isPending}
              onChange={(event) => set("fixedStartLocal", event.target.value)}
            />
          ) : (
            <FormField
              label={t("fields.deadline")}
              hint={t("fields.deadlineHint")}
              type="datetime-local"
              value={value.deadlineLocal ?? ""}
              disabled={isPending}
              onChange={(event) => set("deadlineLocal", event.target.value)}
            />
          )}

          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() =>
                setValue((current) => ({
                  ...current,
                  // The two are exclusive: something that happens at 14:00 is
                  // not also due at some other time.
                  fixedStartLocal: atTime ? null : "",
                  deadlineLocal: atTime ? "" : null,
                }))
              }
            >
              {atTime ? t("switchToDeadline") : t("switchToTime")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
