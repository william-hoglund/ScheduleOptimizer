import { GraduationCap } from "lucide-react";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StudyHelper, type StudyMaterialOption } from "@/components/learning/study-helper";
import { isAiEnabled } from "@/lib/ai";
import { isLearningMaterial } from "@/lib/validation/course-knowledge";
import { requireUserContext } from "@/server/auth";
import { listCourseDocuments } from "@/server/course-knowledge-service";
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

export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUserContext();
  const t = await getTranslations("learn");

  const course = await getCourse(user.id, id);
  if (!course) notFound();

  let documents: Awaited<ReturnType<typeof listCourseDocuments>> = [];
  try {
    documents = await listCourseDocuments(user.id, id);
  } catch (cause) {
    // Same degrade-gracefully rule as the course page: 0011 may not be applied.
    console.error("[learn] course documents unavailable:", cause);
  }

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
        <EmptyState
          icon={GraduationCap}
          title={t("empty.title")}
          description={t("empty.description")}
          action={<ButtonLink href={`/courses/${id}` as Route}>{t("empty.action")}</ButtonLink>}
        />
      ) : (
        <StudyHelper courseId={id} materials={materials} />
      )}
    </div>
  );
}
