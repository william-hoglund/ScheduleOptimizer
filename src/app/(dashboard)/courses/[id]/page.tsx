import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { CourseAssessmentsList, type CourseAssessment } from "@/components/courses/course-assessments-list";
import { CourseDocumentsList } from "@/components/courses/course-documents-list";
import { CourseKnowledgePanel } from "@/components/courses/course-knowledge-panel";
import { DocumentUploadPanel } from "@/components/courses/document-upload-panel";
import { ButtonLink } from "@/components/common/button-link";
import { StatTile } from "@/components/common/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { listCalendarEvents } from "@/server/calendar-service";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { getCourse } from "@/server/course-service";
import {
  listAssessmentDetails,
  listCourseDocuments,
  listCourseMilestones,
  listCourseRequirements,
} from "@/server/course-knowledge-service";
import { listTasks } from "@/server/task-service";
import type { CalendarEventRow, TaskRow } from "@/lib/supabase/types";

/**
 * The course as a persistent knowledge object (docs/PLAN.md §40.5): what the
 * system currently understands about this course, not just a form for
 * editing its name. "Assessments" reuses the ordinary `tasks` table (see
 * 0011_course_knowledge.sql) — a task with a course-work type *is* an
 * assessment here, so there is exactly one list the planner and this page
 * both read from.
 */

const ASSESSMENT_TASK_TYPES: readonly TaskRow["task_type"][] = [
  "assignment",
  "exam",
  "project",
  "presentation",
  "lab",
  "reading",
];

const CLASS_EVENT_TYPES: readonly CalendarEventRow["event_type"][] = ["lecture", "seminar", "lab"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { user } = await requireUserContext();
  const course = await getCourse(user.id, id);
  return { title: course?.name ?? "Course" };
}

export default async function CourseOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations("courseKnowledge");
  const format = await getFormatter();

  const course = await getCourse(user.id, id);
  if (!course) notFound();

  const now = nowIso();
  const horizonEndIso = new Date(Date.parse(now) + 120 * 86_400_000).toISOString();

  const [allTasks, events] = await Promise.all([
    listTasks(user.id, { includeCompleted: true }),
    listCalendarEvents(user.id, now, horizonEndIso),
  ]);

  const assessmentTasks = allTasks.filter(
    (task) => task.course_id === id && ASSESSMENT_TASK_TYPES.includes(task.task_type),
  );
  const courseEvents = events.filter((event) => event.course_id === id);

  // The course-knowledge tables depend on migration 0011, which may not be
  // applied yet on every environment — degrade this section rather than
  // taking the whole page down, exactly as calendar_sources and study groups
  // already do elsewhere (see import-export/page.tsx).
  let documents: Awaited<ReturnType<typeof listCourseDocuments>> = [];
  let requirements: Awaited<ReturnType<typeof listCourseRequirements>> = [];
  let milestones: Awaited<ReturnType<typeof listCourseMilestones>> = [];
  let assessmentDetails: Awaited<ReturnType<typeof listAssessmentDetails>> = [];
  let knowledgeAvailable = true;

  try {
    [documents, requirements, milestones, assessmentDetails] = await Promise.all([
      listCourseDocuments(user.id, id),
      listCourseRequirements(user.id, id),
      listCourseMilestones(user.id, id),
      listAssessmentDetails(user.id, id),
    ]);
  } catch (cause) {
    console.error("[course-overview] course knowledge unavailable:", cause);
    knowledgeAvailable = false;
  }

  const detailByTaskId = new Map(assessmentDetails.map((detail) => [detail.task_id, detail]));
  const assessments: CourseAssessment[] = assessmentTasks
    .map((task) => ({ task, detail: detailByTaskId.get(task.id) ?? null }))
    .sort((a, b) => {
      if (!a.task.deadline) return 1;
      if (!b.task.deadline) return -1;
      return a.task.deadline.localeCompare(b.task.deadline);
    });

  const isOpen = (task: TaskRow) => task.status !== "completed" && task.status !== "cancelled";

  const nextClass = courseEvents.find((event) => CLASS_EVENT_TYPES.includes(event.event_type));
  const nextExamEvent = courseEvents.find((event) => event.event_type === "exam");
  const nextDeadline = assessments.find((a) => a.task.deadline && isOpen(a.task));
  const nextExamTask = assessments.find((a) => a.task.task_type === "exam" && isOpen(a.task));

  const shortDate = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", timeZone });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <ButtonLink href="/courses" variant="ghost" size="sm" className="-ml-2">
          {t("backToCourses")}
        </ButtonLink>
        <PageHeader
          title={course.name}
          description={course.description ?? undefined}
          actions={<ButtonLink href={`/courses/${id}/learn` as Route}>{t("studyThisCourse")}</ButtonLink>}
        />
      </div>

      <section className="space-y-3">
        <h2 className="label-caps">{t("upcoming.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={t("upcoming.nextClass")}
            value={nextClass ? shortDate(nextClass.start_at) : "—"}
            hint={nextClass?.title ?? t("upcoming.none")}
          />
          <StatTile
            label={t("upcoming.nextDeadline")}
            value={nextDeadline?.task.deadline ? shortDate(nextDeadline.task.deadline) : "—"}
            hint={nextDeadline?.task.title ?? t("upcoming.none")}
          />
          <StatTile
            label={t("upcoming.nextExam")}
            value={
              nextExamEvent
                ? shortDate(nextExamEvent.start_at)
                : nextExamTask?.task.deadline
                  ? shortDate(nextExamTask.task.deadline)
                  : "—"
            }
            hint={nextExamEvent?.title ?? nextExamTask?.task.title ?? t("upcoming.none")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label-caps">{t("assessments.title")}</h2>
        <CourseAssessmentsList assessments={assessments} course={course} timeZone={timeZone} />
      </section>

      {knowledgeAvailable ? (
        <>
          <section className="space-y-3">
            <h2 className="label-caps">{t("knowledge.title")}</h2>
            <CourseKnowledgePanel requirements={requirements} milestones={milestones} timeZone={timeZone} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="label-caps">{t("documents.title")}</h2>
            </div>
            <DocumentUploadPanel courseId={id} />
            <CourseDocumentsList documents={documents} />
          </section>
        </>
      ) : null}
    </div>
  );
}
