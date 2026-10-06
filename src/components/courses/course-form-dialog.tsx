"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { ExtractionReview, type ExtractionConfirmInput } from "./extraction-review";
import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { triggerClassName, type TriggerStyle } from "@/components/common/trigger-style";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmExtraction,
  previewExtraction,
  recordCourseDocument,
  type ExtractionPreview,
} from "@/features/course-knowledge/actions";
import { saveCourse } from "@/features/courses/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { courseSchema, type CourseInput } from "@/lib/validation/academic";
import { MAX_DOCUMENT_BYTES, SUPPORTED_DOCUMENT_MIME_TYPES } from "@/lib/validation/course-knowledge";
import type { CourseRow, ProgramRow } from "@/lib/supabase/types";
import type { SaveExtractionOutcome } from "@/server/course-knowledge-service";

const OUTLINE_ERRORS = [
  "tooLarge",
  "unsupportedType",
  "uploadFailed",
  "aiUnavailable",
  "noText",
  "extractionFailed",
  "notFound",
  "invalidInput",
  "unexpected",
] as const;
type OutlineError = (typeof OUTLINE_ERRORS)[number];

function outlineErrorKey(code: string): OutlineError {
  return (OUTLINE_ERRORS as readonly string[]).includes(code) ? (code as OutlineError) : "unexpected";
}

/** Mirrors `DocumentUploadPanel`'s own stages — kept as its own small copy
 *  rather than sharing state machinery, since this dialog has a fixed
 *  "syllabus" document type and folds "pick a file" and "paste text" into
 *  one entry point. The upload → record → extract calls themselves are the
 *  same three server calls either way, just fed a File or a text Blob. */
type OutlineStage =
  | { kind: "idle" }
  | { kind: "pasting" }
  | { kind: "submitting" }
  | { kind: "review"; preview: ExtractionPreview }
  | { kind: "done"; outcome: SaveExtractionOutcome };

const SCALE = [1, 2, 3, 4, 5] as const;

function toFormValues(course: CourseRow | null): CourseInput {
  return {
    name: course?.name ?? "",
    code: course?.code ?? null,
    programId: course?.program_id ?? null,
    description: course?.description ?? null,
    color: course?.color ?? null,
    difficulty: course?.difficulty ?? 3,
    priority: course?.priority ?? 3,
    targetGrade: course?.target_grade ?? null,
    estimatedWeeklyHours: course?.estimated_weekly_hours ?? null,
    startDate: course?.start_date ?? null,
    endDate: course?.end_date ?? null,
  };
}

export function CourseFormDialog({
  programs,
  course = null,
  trigger,
  onSaved,
  /**
   * After creating a brand-new course (never on an edit), go straight to its
   * Course Overview page — that is where uploading a course outline for the
   * AI to read actually lives (Session 16's document → extraction → review
   * pipeline), and a student who just typed in a course name is exactly the
   * person who should see that next, not discover it later by accident.
   *
   * Explicit opt-in, not the default: onboarding's own course step uses this
   * same dialog and must stay on its own flow rather than being yanked away
   * mid-onboarding.
   */
  navigateToCourseOnCreate = false,
}: {
  programs: ProgramRow[];
  course?: CourseRow | null;
  trigger: TriggerStyle;
  onSaved?: () => void;
  navigateToCourseOnCreate?: boolean;
}) {
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  const tDocs = useTranslations("courseKnowledge.documents");
  const tReview = useTranslations("courseKnowledge.review");
  const message = useValidationText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const outlineFileInput = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [outlineStage, setOutlineStage] = useState<OutlineStage>({ kind: "idle" });
  const [outlineText, setOutlineText] = useState("");
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [isOutlinePending, startOutlineTransition] = useTransition();

  function resetOutline() {
    setOutlineStage({ kind: "idle" });
    setOutlineText("");
    setOutlineError(null);
  }

  function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
  }

  /** Uploads to storage, records the document, and runs extraction — shared
   *  by the file-input and paste-text paths below, which only differ in
   *  what blob and file name they hand it. */
  async function submitOutlineDocument(
    file: Blob,
    fileName: string,
    mimeType: (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number],
  ) {
    if (!course) return;

    setOutlineError(null);
    setOutlineStage({ kind: "submitting" });

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setOutlineError("unexpected");
      setOutlineStage({ kind: "pasting" });
      return;
    }

    const storagePath = `${user.id}/${course.id}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;

    const { error: uploadError } = await supabase.storage
      .from("course-documents")
      .upload(storagePath, file, { contentType: mimeType });
    if (uploadError) {
      console.error("[course-form] outline upload failed:", uploadError);
      setOutlineError("uploadFailed");
      setOutlineStage({ kind: "pasting" });
      return;
    }

    const recorded = await recordCourseDocument({
      courseId: course.id,
      fileName,
      fileSize: file.size,
      mimeType,
      storagePath,
      documentType: "syllabus",
    });
    if (!recorded.ok) {
      setOutlineError(recorded.error);
      setOutlineStage({ kind: "pasting" });
      return;
    }

    const preview = await previewExtraction(recorded.data.id);
    if (!preview.ok) {
      setOutlineError(preview.error);
      setOutlineStage({ kind: "pasting" });
      return;
    }

    setOutlineStage({ kind: "review", preview: preview.data });
  }

  function submitOutlineText() {
    const text = outlineText.trim();
    if (!text) return;

    const blob = new Blob([text], { type: "text/plain" });
    if (blob.size > MAX_DOCUMENT_BYTES) {
      setOutlineError("tooLarge");
      return;
    }

    startOutlineTransition(() => submitOutlineDocument(blob, `${tDocs("paste.fileName")}.txt`, "text/plain"));
  }

  function handleOutlineFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      setOutlineError("tooLarge");
      return;
    }
    if (!(SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setOutlineError("unsupportedType");
      return;
    }

    startOutlineTransition(() =>
      submitOutlineDocument(file, file.name, file.type as (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number]),
    );
  }

  function confirmOutline(input: ExtractionConfirmInput) {
    if (outlineStage.kind !== "review" || !course) return;
    const documentId = outlineStage.preview.documentId;

    startOutlineTransition(async () => {
      const result = await confirmExtraction({ documentId, ...input });
      if (!result.ok) {
        setOutlineError(result.error);
        return;
      }
      setOutlineError(null);
      setOutlineStage({ kind: "done", outcome: result.data });
      router.refresh();
    });
  }

  const form = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: toFormValues(course),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Re-seed on open so a cancelled edit does not leave stale values behind.
      reset(toFormValues(course));
      setFormError(null);
    }
    // A closed-and-reopened dialog starts back at the course fields, not
    // wherever a previous paste-and-review session left off.
    resetOutline();
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveCourse(values, course?.id);

      if (result.ok) {
        setOpen(false);
        onSaved?.();
        // `course` being null is what makes this a create rather than an
        // edit — an edit's whole point is changing an existing course's
        // details, not being redirected away from the list mid-review.
        if (navigateToCourseOnCreate && !course) {
          router.push(`/courses/${result.data.id}`);
        }
        return;
      }

      // Server-side validation wins: apply its codes to the matching fields.
      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof CourseInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger aria-label={trigger.ariaLabel} className={triggerClassName(trigger)}>
        {trigger.icon}
        {trigger.label}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? t("edit") : t("add")}</DialogTitle>
          <DialogDescription className="sr-only">{course ? t("edit") : t("add")}</DialogDescription>
        </DialogHeader>

        {outlineStage.kind === "review" ? (
          <ExtractionReview
            preview={outlineStage.preview}
            isPending={isOutlinePending}
            error={
              outlineError ? (
                <p role="alert" className="text-destructive text-sm">
                  {tDocs(`errors.${outlineErrorKey(outlineError)}`)}
                </p>
              ) : undefined
            }
            onConfirm={confirmOutline}
            onCancel={resetOutline}
          />
        ) : outlineStage.kind === "done" ? (
          <div className="space-y-4">
            <div className="border-success/40 bg-success/5 animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border p-4 duration-300">
              <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-sm">
                {tReview("done", {
                  assessments: outlineStage.outcome.assessmentsSaved,
                  milestones: outlineStage.outcome.milestonesSaved,
                  requirements: outlineStage.outcome.requirementsSaved,
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOutlineStage({ kind: "pasting" })}>
                {tDocs("paste.addAnother")}
              </Button>
              <Button variant="ghost" onClick={resetOutline}>
                {tDocs("paste.backToForm")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {message(formError)}
            </p>
          ) : null}

          <FormField
            label={t("fields.name")}
            placeholder={t("fields.namePlaceholder")}
            autoFocus
            error={message(errors.name?.message)}
            {...register("name")}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.code")}
              placeholder={t("fields.codePlaceholder")}
              error={message(errors.code?.message)}
              {...register("code")}
            />

            <NativeSelect label={t("fields.program")} {...register("programId")}>
              <option value="">{t("fields.noProgram")}</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NativeSelect
              label={t("fields.difficulty")}
              {...register("difficulty", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {t(`scale.difficulty${value}` as "scale.difficulty1")}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              label={t("fields.priority")}
              {...register("priority", { valueAsNumber: true })}
            >
              {SCALE.map((value) => (
                <option key={value} value={value}>
                  {t(`scale.priority${value}` as "scale.priority1")}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.weeklyHours")}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={168}
              hint={t("fields.weeklyHoursHint")}
              error={message(errors.estimatedWeeklyHours?.message)}
              {...register("estimatedWeeklyHours", {
                // An empty number input must become null, not NaN.
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
            <FormField
              label={t("fields.targetGrade")}
              error={message(errors.targetGrade?.message)}
              {...register("targetGrade")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("fields.startDate")}
              type="date"
              error={message(errors.startDate?.message)}
              {...register("startDate")}
            />
            <FormField
              label={t("fields.endDate")}
              type="date"
              error={message(errors.endDate?.message)}
              {...register("endDate")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="course-description">
              {t("fields.description")}
            </label>
            <Textarea id="course-description" rows={3} {...register("description")} />
          </div>

          {course ? (
            <div className="space-y-2 border-t pt-4">
              <div>
                <p className="text-sm font-medium">{tDocs("title")}</p>
                <p className="text-muted-foreground text-xs">{tDocs("description")}</p>
              </div>

              {outlineStage.kind === "submitting" ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Upload className="size-3.5 shrink-0 animate-pulse" aria-hidden="true" />
                  {tDocs("paste.reading")}
                </p>
              ) : outlineStage.kind === "pasting" ? (
                <div className="space-y-2">
                  <label className="sr-only" htmlFor="course-outline-text">
                    {tDocs("paste.label")}
                  </label>
                  <Textarea
                    id="course-outline-text"
                    rows={6}
                    placeholder={tDocs("paste.placeholder")}
                    value={outlineText}
                    onChange={(event) => setOutlineText(event.target.value)}
                  />
                  {outlineError ? (
                    <p role="alert" className="text-destructive text-xs">
                      {tDocs(`errors.${outlineErrorKey(outlineError)}`)}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={!outlineText.trim()} onClick={submitOutlineText}>
                      {tDocs("paste.submit")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={resetOutline}>
                      {tCommon("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {outlineError ? (
                    <p role="alert" className="text-destructive text-xs">
                      {tDocs(`errors.${outlineErrorKey(outlineError)}`)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={outlineFileInput}
                      type="file"
                      accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                      onChange={handleOutlineFile}
                      aria-label={tDocs("upload")}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => outlineFileInput.current?.click()}
                    >
                      <Upload className="size-3.5" aria-hidden="true" />
                      {tDocs("upload")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOutlineStage({ kind: "pasting" })}
                    >
                      {tDocs("paste.add")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
