import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CourseFormDialog } from "@/components/courses/course-form-dialog";
import { CourseList } from "@/components/courses/course-list";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { listPrograms } from "@/server/academic-service";
import { requireUser } from "@/server/auth";
import { listCourses } from "@/server/course-service";

export const generateMetadata = () => createPageMetadata("courses");

export default async function CoursesPage() {
  const user = await requireUser();
  const t = await getTranslations();

  const [courses, programs] = await Promise.all([
    listCourses(user.id, { includeArchived: true }),
    listPrograms(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pages.courses.title")}
        description={t("pages.courses.description")}
        actions={
          courses.length > 0 ? (
            <CourseFormDialog
              programs={programs}
              trigger={{
                label: t("courses.add"),
                icon: <Plus className="size-4" aria-hidden="true" />,
              }}
            />
          ) : null
        }
      />

      <CourseList courses={courses} programs={programs} />
    </div>
  );
}
