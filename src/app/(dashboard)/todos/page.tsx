import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { TodoList } from "@/components/todos/todo-list";
import { TodoQuickAdd } from "@/components/todos/todo-quick-add";
import { groupTodos, minutesThisWeek } from "@/lib/tasks/group-todos";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { listTodos } from "@/server/todo-service";

export const generateMetadata = () => createPageMetadata("todos");

export default async function TodosPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  // Decided once, on the server, and passed down — reading the clock in a
  // client component gives a different answer during hydration.
  const now = nowIso();

  const todos = await listTodos(user.id);
  const grouped = groupTodos(todos, now, timeZone);
  const minutes = minutesThisWeek(grouped);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pages.todos.title")}
        description={
          minutes > 0
            ? t("todos.weekLoad", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
            : t("pages.todos.description")
        }
      />

      <TodoQuickAdd />

      <TodoList todos={grouped} timeZone={timeZone} />
    </div>
  );
}
