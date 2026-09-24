import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { TaskFormDialog } from "@/components/deadlines/task-form-dialog";
import { TaskList } from "@/components/deadlines/task-list";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { listCourses } from "@/server/course-service";
import { listTasks } from "@/server/task-service";

export const generateMetadata = () => createPageMetadata("deadlines");

export default async function DeadlinesPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  const [tasks, courses] = await Promise.all([listTasks(user.id), listCourses(user.id)]);

  // "Now" is decided once, on the server, and passed down. Reading the clock in
  // a client component instead would give a different answer during hydration
  // and produce a mismatch.
  const now = nowIso();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pages.deadlines.title")}
        description={t("pages.deadlines.description")}
        actions={
          tasks.length > 0 ? (
            <TaskFormDialog
              courses={courses}
              timeZone={timeZone}
              trigger={{
                label: t("tasks.add"),
                icon: <Plus className="size-4" aria-hidden="true" />,
              }}
            />
          ) : null
        }
      />

      <TaskList tasks={tasks} courses={courses} nowIso={now} timeZone={timeZone} />
    </div>
  );
}
