"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StepNav } from "./step-nav";
import { CourseFormDialog } from "@/components/courses/course-form-dialog";
import { Button } from "@/components/ui/button";
import { finishCoursesStep } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import type { CourseRow, ProgramRow } from "@/lib/supabase/types";

export function StepCourses({
  courses,
  programs,
}: {
  courses: CourseRow[];
  programs: ProgramRow[];
}) {
  const t = useTranslations("onboarding");
  const tCourses = useTranslations("courses");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasCourses = courses.length > 0;

  return (
    <div className="space-y-5">
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      {hasCourses ? (
        <ul className="space-y-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="bg-card flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: course.color ?? "var(--muted-foreground)" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{course.name}</span>
              {course.code ? (
                <span className="text-numeric text-muted-foreground text-xs">{course.code}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          {t("courses.empty")}
        </p>
      )}

      <CourseFormDialog
        programs={programs}
        trigger={{
          variant: "outline",
          className: "w-full",
          label: tCourses("add"),
          icon: <Plus className="size-4" aria-hidden="true" />,
        }}
      />

      {/* Continuing without a course is blocked on purpose: the next step asks
          how you want to study, and the step after that plans work that does
          not exist yet. Better to say so than to produce an empty plan. */}
      {!hasCourses ? <p className="text-muted-foreground text-xs">{t("courses.needOne")}</p> : null}

      <StepNav step={3}>
        <Button
          type="button"
          disabled={!hasCourses || isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await finishCoursesStep();
              if (!result.ok) setFormError(result.error);
            })
          }
        >
          {isPending ? t("saving") : t("continue")}
        </Button>
      </StepNav>
    </div>
  );
}
