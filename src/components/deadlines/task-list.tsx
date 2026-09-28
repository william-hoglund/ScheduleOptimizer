"use client";

import { Check, ListTodo, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { TaskBreakdownDialog } from "./task-breakdown-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeTask, updateTaskProgress } from "@/features/tasks/actions";
import type { CourseRow, TaskRow } from "@/lib/supabase/types";
import { daysUntil, groupTasks, TASK_GROUP_ORDER } from "@/lib/tasks/group-tasks";
import { cn } from "@/lib/utils";

function DeadlineLabel({
  task,
  nowIso,
  timeZone,
}: {
  task: TaskRow;
  nowIso: string;
  timeZone: string;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();

  if (!task.deadline) {
    return <span className="text-muted-foreground text-xs">{t("noDeadline")}</span>;
  }

  const isOverdue =
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    new Date(task.deadline).getTime() < new Date(nowIso).getTime();
  const days = daysUntil(task.deadline, nowIso, timeZone);

  const relative = isOverdue
    ? t("overdue")
    : days === 0
      ? t("dueToday")
      : days === 1
        ? t("dueTomorrow")
        : t("dueInDays", { days });

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={cn(isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
        {relative}
      </span>
      <time dateTime={task.deadline} className="text-muted-foreground">
        {format.dateTime(new Date(task.deadline), {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        })}
      </time>
    </span>
  );
}

function TaskRowItem({
  task,
  subtasks,
  courses,
  courseName,
  courseColor,
  nowIso,
  timeZone,
  aiEnabled,
  depth = 0,
}: {
  task: TaskRow;
  subtasks: TaskRow[];
  courses: CourseRow[];
  courseName: string | null;
  courseColor: string | null;
  nowIso: string;
  timeZone: string;
  aiEnabled: boolean;
  depth?: number;
}) {
  const t = useTranslations("tasks");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isDone = task.status === "completed";

  return (
    <>
      <li
        className={cn("bg-card rounded-lg border p-3", depth > 0 && "ml-6", isDone && "opacity-60")}
      >
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isDone ? t("markNotDone") : t("markDone")}
            disabled={isPending}
            className="mt-0.5 shrink-0"
            onClick={() =>
              startTransition(
                () =>
                  void updateTaskProgress(task.id, {
                    status: isDone ? "in_progress" : "completed",
                    // Finishing a task means its whole estimate is behind you.
                    completedMinutes: isDone ? task.completed_minutes : task.estimated_minutes,
                  }),
              )
            }
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border transition-colors duration-200",
                isDone ? "bg-success border-success text-white" : "border-muted-foreground/40",
              )}
            >
              {isDone ? (
                <Check className="animate-in zoom-in duration-300 size-3" aria-hidden="true" />
              ) : null}
            </span>
          </Button>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn("text-sm font-medium", isDone && "line-through")}>
                {task.title}
              </span>
              <span className="text-muted-foreground text-xs">{t(`types.${task.task_type}`)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {courseName ? (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: courseColor ?? "var(--muted-foreground)" }}
                    aria-hidden="true"
                  />
                  {courseName}
                </span>
              ) : null}

              <DeadlineLabel task={task} nowIso={nowIso} timeZone={timeZone} />

              {task.estimated_minutes > 0 ? (
                <span className="text-numeric text-muted-foreground text-xs">
                  {t("ofEstimate", {
                    done: task.completed_minutes,
                    total: task.estimated_minutes,
                  })}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {/* Only one level of nesting: a subtask cannot have subtasks, which
                keeps the planner's splitting logic and this list simple. */}
            {depth === 0 ? (
              <TaskFormDialog
                courses={courses}
                parentTaskId={task.id}
                timeZone={timeZone}
                trigger={{
                  variant: "ghost",
                  size: "icon-sm",
                  ariaLabel: t("addSubtask"),
                  icon: <Plus className="size-3.5" aria-hidden="true" />,
                }}
              />
            ) : null}

            {/* Breaking a subtask down further would nest past the one level
                the planner and this list both assume. */}
            {depth === 0 && aiEnabled && !isDone ? (
              <TaskBreakdownDialog
                taskId={task.id}
                trigger={{
                  variant: "ghost",
                  size: "icon-sm",
                  ariaLabel: t("breakdown.trigger"),
                  icon: <Sparkles className="size-3.5" aria-hidden="true" />,
                }}
              />
            ) : null}

            <TaskFormDialog
              courses={courses}
              task={task}
              timeZone={timeZone}
              trigger={{
                variant: "ghost",
                size: "icon-sm",
                ariaLabel: t("edit"),
                icon: <Pencil className="size-3.5" aria-hidden="true" />,
              }}
            />

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("deleteConfirm")}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="text-destructive size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("deleteTitle")}</DialogTitle>
              <DialogDescription>{t("deleteBody", { title: task.title })}</DialogDescription>
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
                    await removeTask(task.id);
                    setConfirmingDelete(false);
                  })
                }
              >
                {t("deleteConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </li>

      {subtasks.map((subtask) => (
        <TaskRowItem
          key={subtask.id}
          task={subtask}
          subtasks={[]}
          courses={courses}
          courseName={courseName}
          courseColor={courseColor}
          nowIso={nowIso}
          timeZone={timeZone}
          aiEnabled={aiEnabled}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

export function TaskList({
  tasks,
  courses,
  nowIso,
  timeZone,
  aiEnabled = false,
}: {
  tasks: TaskRow[];
  courses: CourseRow[];
  nowIso: string;
  timeZone: string;
  aiEnabled?: boolean;
}) {
  const t = useTranslations("tasks");

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const topLevel = tasks.filter((task) => !task.parent_task_id);
  const subtasksByParent = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    const list = subtasksByParent.get(task.parent_task_id) ?? [];
    list.push(task);
    subtasksByParent.set(task.parent_task_id, list);
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title={t("empty")}
        description={t("emptyBody")}
        action={
          <TaskFormDialog
            courses={courses}
            timeZone={timeZone}
            trigger={{
              label: t("addFirst"),
              icon: <Plus className="size-4" aria-hidden="true" />,
            }}
          />
        }
      />
    );
  }

  const grouped = groupTasks(topLevel, nowIso, timeZone);

  return (
    <div className="space-y-8">
      {TASK_GROUP_ORDER.map((key) => {
        const group = grouped.get(key) ?? [];
        if (group.length === 0) return null;

        return (
          <section key={key} className="space-y-2">
            <h2 className="label-caps">
              {t(`groups.${key}`)} <span className="text-numeric">({group.length})</span>
            </h2>
            <ul className="space-y-2">
              {group.map((task) => {
                const course = task.course_id ? courseById.get(task.course_id) : undefined;
                return (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    subtasks={subtasksByParent.get(task.id) ?? []}
                    courses={courses}
                    courseName={course?.name ?? null}
                    courseColor={course?.color ?? null}
                    nowIso={nowIso}
                    timeZone={timeZone}
                    aiEnabled={aiEnabled}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
