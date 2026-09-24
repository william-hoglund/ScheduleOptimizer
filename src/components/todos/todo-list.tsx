"use client";

import { Briefcase, CalendarClock, ClipboardList, FileText, ShoppingBag, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { removeTodo, toggleTodoDone } from "@/features/todos/actions";
import type { GroupedTodo, TodoBucket } from "@/lib/tasks/group-todos";
import type { ErrandType } from "@/lib/tasks/task-kinds";

/**
 * The week's to-dos, grouped the way a week is lived: what is late, what is
 * today, what is coming, and what has no date at all.
 *
 * Every row says how long it takes, because that number is what the planner
 * reserved — seeing it is how a student notices that "quick admin" was given
 * half an hour it did not need, or ten minutes it did.
 */

const TYPE_ICON: Record<ErrandType, typeof FileText> = {
  application: FileText,
  appointment: CalendarClock,
  admin: ClipboardList,
  errand: ShoppingBag,
};

export function TodoList({
  todos,
  timeZone,
}: {
  todos: GroupedTodo[];
  timeZone: string;
}) {
  const t = useTranslations("todos");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();

  if (todos.length === 0) {
    return <EmptyState icon={ClipboardList} title={t("empty")} description={t("emptyBody")} />;
  }

  const buckets = new Map<TodoBucket, GroupedTodo[]>();
  for (const item of todos) {
    buckets.set(item.bucket, [...(buckets.get(item.bucket) ?? []), item]);
  }

  return (
    <div className="space-y-6">
      {[...buckets.entries()].map(([bucket, items]) => (
        <section key={bucket} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="label-caps">{t(`buckets.${bucket}`)}</h2>
            <span className="text-numeric text-muted-foreground text-xs">
              {t("itemCount", { count: items.length })}
            </span>
          </div>

          <ul className="space-y-1.5">
            {items.map(({ task, whenIso, atFixedTime, bucket: itemBucket }) => {
              const Icon = TYPE_ICON[task.task_type as ErrandType] ?? ClipboardList;
              const done = itemBucket === "done";

              return (
                <li key={task.id}>
                  <div className="bg-card hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      className="mt-1"
                      checked={done}
                      disabled={isPending}
                      aria-label={t("markDone", { title: task.title })}
                      onCheckedChange={(checked) =>
                        startTransition(async () => {
                          await toggleTodoDone(task.id, checked === true);
                        })
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={done ? "text-muted-foreground text-sm line-through" : "text-sm"}>
                          {task.title}
                        </span>

                        {whenIso ? (
                          <time
                            className="text-numeric text-muted-foreground text-xs"
                            dateTime={whenIso}
                          >
                            {atFixedTime ? t("atTime") : t("byTime")}{" "}
                            {format.dateTime(new Date(whenIso), {
                              weekday: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone,
                            })}
                          </time>
                        ) : null}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          <Icon className="size-3" aria-hidden="true" />
                          {t(`types.${task.task_type as ErrandType}`)}
                        </Badge>

                        <span className="text-numeric text-muted-foreground text-xs">
                          {t("minutes", { minutes: task.estimated_minutes })}
                        </span>

                        {atFixedTime ? (
                          <Badge variant="secondary">
                            <Briefcase className="size-3" aria-hidden="true" />
                            {t("blocksTime")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await removeTodo(task.id);
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span className="sr-only">{t("remove", { title: task.title })}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
