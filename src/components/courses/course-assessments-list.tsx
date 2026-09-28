"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { AssessmentDetailRow, TaskRow } from "@/lib/supabase/types";

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

function AssessmentRow({ assessment, timeZone }: { assessment: CourseAssessment; timeZone: string }) {
  const t = useTranslations("courseKnowledge.assessments");
  const tTasks = useTranslations("tasks");
  const format = useFormatter();
  const { task, detail } = assessment;

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <Badge variant={STATUS_VARIANT[task.status]}>{tTasks(`statuses.${task.status}`)}</Badge>
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
  timeZone,
}: {
  assessments: CourseAssessment[];
  timeZone: string;
}) {
  const t = useTranslations("courseKnowledge.assessments");

  if (assessments.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {assessments.map((assessment) => (
        <AssessmentRow key={assessment.task.id} assessment={assessment} timeZone={timeZone} />
      ))}
    </ul>
  );
}
