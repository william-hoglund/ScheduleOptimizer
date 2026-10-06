"use client";

import { Pencil } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { TaskFormDialog } from "@/components/deadlines/task-form-dialog";
import { Badge } from "@/components/ui/badge";
import type { AssessmentDetailRow, CourseRow, TaskRow } from "@/lib/supabase/types";

export type CourseAssessment = {
  task: TaskRow;
  detail: AssessmentDetailRow | null;
};

const STATUS_VARIANT: Record<TaskRow["status"], "default" | "secondary" | "outline"> = {
  not_started: "outline",
  in_progress: "secondary",
  completed: "default",
  cancelled: "outline",
};

function AssessmentRow({
  assessment,
  course,
  timeZone,
}: {
  assessment: CourseAssessment;
  course: CourseRow;
  timeZone: string;
}) {
  const t = useTranslations("courseKnowledge.assessments");
  const tTasks = useTranslations("tasks");
  const format = useFormatter();
  const { task, detail } = assessment;

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant={STATUS_VARIANT[task.status]}>{tTasks(`statuses.${task.status}`)}</Badge>
          <TaskFormDialog
            // This is deliberately just the one course the page is already
            // on — the full course picker other task edits get is not worth
            // fetching every course's row here just to reassign an
            // assessment from the page you'd have to leave to use Deadlines
            // for that anyway.
            courses={[course]}
            task={task}
            timeZone={timeZone}
            trigger={{
              variant: "ghost",
              size: "icon-sm",
              ariaLabel: tTasks("edit"),
              icon: <Pencil className="size-3.5" aria-hidden="true" />,
            }}
          />
        </div>
      </div>
      <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
        {task.deadline ? (
          <span className="text-numeric">
            {t("due", {
              date: format.dateTime(new Date(task.deadline), {
                day: "numeric",
                month: "short",
                timeZone,
              }),
            })}
          </span>
        ) : (
          <span>{t("noDeadline")}</span>
        )}
        {detail?.weight_percent !== null && detail?.weight_percent !== undefined ? (
          <span className="text-numeric">{t("weight", { percent: detail.weight_percent })}</span>
        ) : null}
        {task.estimated_minutes > 0 ? (
          <span className="text-numeric">
            {task.completed_minutes}/{task.estimated_minutes} min
          </span>
        ) : null}
      </p>
    </li>
  );
}

export function CourseAssessmentsList({
  assessments,
  course,
  timeZone,
}: {
  assessments: CourseAssessment[];
  course: CourseRow;
  timeZone: string;
}) {
  const t = useTranslations("courseKnowledge.assessments");

  if (assessments.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {assessments.map((assessment) => (
        <AssessmentRow key={assessment.task.id} assessment={assessment} course={course} timeZone={timeZone} />
      ))}
    </ul>
  );
}
