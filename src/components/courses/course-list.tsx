"use client";

import { Archive, ArchiveRestore, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { CourseFormDialog } from "./course-form-dialog";
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
import { archiveCourse, removeCourse } from "@/features/courses/actions";
import type { CourseRow, ProgramRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

function CourseCard({
  course,
  programs,
  programName,
}: {
  course: CourseRow;
  programs: ProgramRow[];
  programName: string | null;
}) {
  const t = useTranslations("courses");
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li
      className={cn(
        "bg-card rounded-lg border p-4 transition-opacity",
        course.archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: course.color ?? "var(--muted-foreground)" }}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {/* h2: the card sits directly under the page heading, with nothing
                between. The size comes from the utility, not the level. */}
            <h2 className="text-sm font-semibold">
              <Link href={`/courses/${course.id}`} className="hover:underline">
                {course.name}
              </Link>
            </h2>
            {course.code ? (
              <span className="text-numeric text-muted-foreground text-xs">{course.code}</span>
            ) : null}
          </div>

          <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {programName ? <span>{programName}</span> : null}
            <span>
              {t("fields.difficulty")}:{" "}
              {t(`scale.difficulty${course.difficulty}` as "scale.difficulty1")}
            </span>
            <span>
              {t("fields.priority")}: {t(`scale.priority${course.priority}` as "scale.priority1")}
            </span>
            {course.estimated_weekly_hours != null ? (
              <span className="text-numeric">
                {t("perWeek", { hours: course.estimated_weekly_hours })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <CourseFormDialog
            programs={programs}
            course={course}
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
            aria-label={course.archived ? t("unarchive") : t("archive")}
            disabled={isPending}
            onClick={() => startTransition(() => void archiveCourse(course.id, !course.archived))}
          >
            {course.archived ? (
              <ArchiveRestore className="size-3.5" aria-hidden="true" />
            ) : (
              <Archive className="size-3.5" aria-hidden="true" />
            )}
          </Button>

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

      {/* Deleting cascades to tasks and study history, so it asks first and
          names what will be lost. Archiving is offered as the softer option. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody", { name: course.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              {t("archive")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await removeCourse(course.id);
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
  );
}

export function CourseList({
  courses,
  programs,
}: {
  courses: CourseRow[];
  programs: ProgramRow[];
}) {
  const t = useTranslations("courses");
  const [showArchived, setShowArchived] = useState(false);

  const programNameById = new Map(programs.map((p) => [p.id, p.name]));
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={t("empty")}
        description={t("emptyBody")}
        action={
          <CourseFormDialog
            programs={programs}
            trigger={{
              label: t("addFirst"),
              icon: <Plus className="size-4" aria-hidden="true" />,
            }}
          />
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {active.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            programs={programs}
            programName={
              course.program_id ? (programNameById.get(course.program_id) ?? null) : null
            }
          />
        ))}
      </ul>

      {archived.length > 0 ? (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t("hideArchived") : t("showArchived")} ({archived.length})
          </Button>

          {showArchived ? (
            <ul className="space-y-2">
              {archived.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  programs={programs}
                  programName={
                    course.program_id ? (programNameById.get(course.program_id) ?? null) : null
                  }
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
