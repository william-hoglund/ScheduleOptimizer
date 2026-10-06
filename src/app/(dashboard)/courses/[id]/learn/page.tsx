import { GraduationCap } from "lucide-react";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";
import { EmptyState } from "@/components/common/empty-state";
import { DocumentUploadPanel } from "@/components/courses/document-upload-panel";
import { PageHeader } from "@/components/layout/page-header";
import { StudyHelper, type StudyMaterialOption } from "@/components/learning/study-helper";
import { isAiEnabled, STUDY_HELP_MODES, type StudyHelpMode } from "@/lib/ai";
import { isLearningMaterial } from "@/lib/validation/course-knowledge";
import { requireUserContext } from "@/server/auth";
import { listCourseDocuments } from "@/server/course-knowledge-service";
import { getCalendarEvent } from "@/server/calendar-service";
import { getCourse } from "@/server/course-service";

/**
 * Studying a course from its own material: summaries, explanations, answers
 * and quizzes drawn only from the slides and notes the student uploaded.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { user } = await requireUserContext();
  const course = await getCourse(user.id, id);
  const t = await getTranslations("learn");
  return { title: course ? t("pageTitle", { course: course.name }) : "Learn" };
}

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ catchUp?: string; mode?: string }>;
}) {
  const { id } = await params;
  const { catchUp, mode } = await searchParams;
  // From a session's "Quiz me": open straight in that mode.
  const initialMode = (STUDY_HELP_MODES as readonly string[]).includes(mode ?? "") ? (mode as StudyHelpMode) : undefined;
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations("learn");
  const format = await getFormatter();

  const course = await getCourse(user.id, id);
  if (!course) notFound();

  let documents: Awaited<ReturnType<typeof listCourseDocuments>> = [];
  try {
    documents = await listCourseDocuments(user.id, id);
  } catch (cause) {
    // Same degrade-gracefully rule as the course page: 0011 may not be applied.
    console.error("[learn] course documents unavailable:", cause);
  }

  // Arriving from "Catch up" on a missed class: start in summary mode, already
  // asking about that lecture. Only honoured for this student's own event in
  // this course.
  const missedEvent = catchUp
    ? await getCalendarEvent(user.id, catchUp).catch(() => null)
    : null;
  const catchUpEvent =
    missedEvent && missedEvent.course_id === id
      ? {
          id: missedEvent.id,
          title: missedEvent.title,
          when: format.dateTime(new Date(missedEvent.start_at), {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone,
          }),
        }
      : null;

  const materials: StudyMaterialOption[] = documents
    .filter((doc) => doc.processing_status !== "failed")
    .map((doc) => ({
      id: doc.id,
      fileName: doc.file_name,
      isLectureMaterial: isLearningMaterial(doc.document_type),
    }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <ButtonLink href={`/courses/${id}` as Route} variant="ghost" size="sm" className="-ml-2">
          {t("backToCourse", { course: course.name })}
        </ButtonLink>
        <PageHeader
          title={t("pageTitle", { course: course.name })}
          description={t("description")}
          actions={
            <ButtonLink href="/how-it-works" variant="outline" size="sm">
              {t("howItWorks")}
            </ButtonLink>
          }
        />
      </div>

      {!isAiEnabled() ? (
        <p className="bg-muted rounded-md p-3 text-sm">{t("errors.aiUnavailable")}</p>
      ) : materials.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <StudyHelper
          courseId={id}
          materials={materials}
          initialMode={initialMode}
          catchUp={
            catchUpEvent
              ? { ...catchUpEvent, request: t("catchUp.request", { title: catchUpEvent.title, when: catchUpEvent.when }) }
              : null
          }
        />
      )}

      <section className="space-y-3 rounded-xl border p-4 sm:p-5">
        <div>
          <h2 className="label-caps">{t("addMaterial.title")}</h2>
          <p className="text-muted-foreground text-sm">{t("addMaterial.description")}</p>
        </div>
        <DocumentUploadPanel courseId={id} materialOnly />
      </section>
    </div>
  );
}
