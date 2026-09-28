"use client";

import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  confirmExtraction,
  previewExtraction,
  recordCourseDocument,
  type ExtractionPreview,
} from "@/features/course-knowledge/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  COURSE_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  type AssessmentSelection,
  type MilestoneSelection,
  type RequirementSelection,
} from "@/lib/validation/course-knowledge";
import type { CourseDocumentType } from "@/lib/supabase/types";
import type { ExtractedAssessment, ExtractedMilestone, ExtractedRequirement } from "@/lib/ai";
import type { SaveExtractionOutcome } from "@/server/course-knowledge-service";

/**
 * Upload a course document, review the AI's proposed extraction, confirm.
 *
 * The file is uploaded straight from the browser to Supabase Storage — a
 * Server Action's default body limit is far smaller than a real PDF, so the
 * server only ever handles the small JSON that follows (the storage path,
 * then the reviewed extraction). Same reasoning as the export routes in
 * `import-export`, just for the opposite direction.
 */

const MAX_ITEMS_PER_KIND = 30;

type Stage =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "extracting" }
  | { kind: "review"; preview: ExtractionPreview; selection: ReviewSelection }
  | { kind: "done"; outcome: SaveExtractionOutcome };

type ReviewSelection = {
  assessments: boolean[];
  milestones: boolean[];
  requirements: boolean[];
};

const KNOWN_ERRORS = [
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

type KnownError = (typeof KNOWN_ERRORS)[number];

function errorKey(code: string): KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? (code as KnownError) : "unexpected";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
}

/** Low-confidence items start unticked — §40.16: ambiguous extractions need a deliberate yes. */
function defaultChecked(confidence: "high" | "medium" | "low"): boolean {
  return confidence !== "low";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A confirmed single date, or null.
 *
 * The prompt asks the model for YYYY-MM-DD-or-null, but a live run
 * (Session 15) returned a date *range* as free text ("2026-10-12 to
 * 2026-10-16") for a reading week instead of null — the schema has no format
 * constraint on this field, only `confirmExtractionSchema` does, so an
 * unguarded value here would pass the checkbox as "has a date" and then fail
 * validation on confirm, silently blocking the whole save. Treated the same
 * as no date: nothing to attach to a single `milestone_date` column.
 */
function confirmedDate(date: string | null): string | null {
  return date !== null && ISO_DATE_RE.test(date) ? date : null;
}

function initialSelection(extraction: ExtractionPreview["extraction"]): ReviewSelection {
  return {
    assessments: extraction.assessments.map((a) => defaultChecked(a.confidence)),
    // A milestone with no confirmed date has nothing to save — see the schema
    // note in lib/validation/course-knowledge.ts.
    milestones: extraction.milestones.map((m) => confirmedDate(m.date) !== null && defaultChecked(m.confidence)),
    requirements: extraction.requirements.map((r) => defaultChecked(r.confidence)),
  };
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const t = useTranslations("courseKnowledge.knowledge");
  const variant = confidence === "low" ? "outline" : confidence === "medium" ? "secondary" : "default";
  return (
    <Badge variant={variant} className="shrink-0">
      {t(`confidence${confidence === "high" ? "High" : confidence === "medium" ? "Medium" : "Low"}`)}
    </Badge>
  );
}

function SourceNote({ page }: { page: number | null }) {
  const t = useTranslations("courseKnowledge.knowledge");
  if (page === null) return null;
  return <span className="text-muted-foreground text-xs">{t("sourcePage", { page })}</span>;
}

function AssessmentRow({
  item,
  checked,
  onToggle,
}: {
  item: ExtractedAssessment;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.title}</p>
          <ConfidenceBadge confidence={item.confidence} />
        </div>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
          {item.deadlineLocal ? <span className="text-numeric">{item.deadlineLocal}</span> : null}
          {item.weightPercent !== null ? (
            <span className="text-numeric">{item.weightPercent}%</span>
          ) : null}
          {item.wordCount !== null ? (
            <span className="text-numeric">{item.wordCount} words</span>
          ) : null}
          <SourceNote page={item.sourcePage} />
        </p>
        {item.description ? (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        ) : null}
      </div>
    </li>
  );
}

function MilestoneRow({
  item,
  checked,
  onToggle,
}: {
  item: ExtractedMilestone;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("courseKnowledge.review");
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        disabled={confirmedDate(item.date) === null}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.title}</p>
          <ConfidenceBadge confidence={item.confidence} />
        </div>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
          {confirmedDate(item.date) ? (
            <span className="text-numeric">{confirmedDate(item.date)}</span>
          ) : (
            <span>{t("missingDate")}</span>
          )}
          <SourceNote page={item.sourcePage} />
        </p>
      </div>
    </li>
  );
}

function RequirementRow({
  item,
  checked,
  onToggle,
}: {
  item: ExtractedRequirement;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.title}</p>
          <ConfidenceBadge confidence={item.confidence} />
        </div>
        {item.description ? (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        ) : null}
        <SourceNote page={item.sourcePage} />
      </div>
    </li>
  );
}

export function DocumentUploadPanel({ courseId }: { courseId: string }) {
  const t = useTranslations("courseKnowledge.documents");
  const tReview = useTranslations("courseKnowledge.review");
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [documentType, setDocumentType] = useState<CourseDocumentType>("syllabus");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("tooLarge");
      return;
    }
    if (!(SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("unsupportedType");
      return;
    }

    setError(null);
    setStage({ kind: "uploading" });

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("unexpected");
        setStage({ kind: "idle" });
        return;
      }

      const storagePath = `${user.id}/${courseId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("course-documents")
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) {
        console.error("[document-upload] storage upload failed:", uploadError);
        setError("uploadFailed");
        setStage({ kind: "idle" });
        return;
      }

      const recorded = await recordCourseDocument({
        courseId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath,
        documentType,
      });
      if (!recorded.ok) {
        setError(recorded.error);
        setStage({ kind: "idle" });
        return;
      }

      setStage({ kind: "extracting" });
      const preview = await previewExtraction(recorded.data.id);
      if (!preview.ok) {
        setError(preview.error);
        setStage({ kind: "idle" });
        return;
      }

      setStage({ kind: "review", preview: preview.data, selection: initialSelection(preview.data.extraction) });
    });
  }

  function toggle(kind: keyof ReviewSelection, index: number) {
    setStage((current) => {
      if (current.kind !== "review") return current;
      const next = { ...current.selection, [kind]: [...current.selection[kind]] };
      next[kind][index] = !next[kind][index];
      return { ...current, selection: next };
    });
  }

  function handleConfirm() {
    if (stage.kind !== "review") return;
    const { preview, selection } = stage;

    const assessments: AssessmentSelection[] = preview.extraction.assessments
      .filter((_, i) => selection.assessments[i])
      // Same malformed-date guard as milestones: a deadline that isn't clean
      // ISO would otherwise fail server-side validation and block the whole
      // save rather than just arriving as "no deadline set".
      .map((a) => ({ ...a, deadlineLocal: confirmedDate(a.deadlineLocal) }))
      .slice(0, MAX_ITEMS_PER_KIND);
    const milestones: MilestoneSelection[] = preview.extraction.milestones
      .filter((m, i) => selection.milestones[i] && confirmedDate(m.date) !== null)
      .map((m) => ({ ...m, date: confirmedDate(m.date) as string }))
      .slice(0, MAX_ITEMS_PER_KIND);
    const requirements: RequirementSelection[] = preview.extraction.requirements
      .filter((_, i) => selection.requirements[i])
      .slice(0, MAX_ITEMS_PER_KIND);

    startTransition(async () => {
      const result = await confirmExtraction({
        documentId: preview.documentId,
        assessments,
        milestones,
        requirements,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setStage({ kind: "done", outcome: result.data });
    });
  }

  const errorMessage = error ? (
    <p role="alert" className="text-destructive flex items-center gap-1.5 text-sm">
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      {t(`errors.${errorKey(error)}`)}
    </p>
  ) : null;

  if (stage.kind === "done") {
    return (
      <div className="space-y-4">
        <div className="border-success/40 bg-success/5 flex items-start gap-3 rounded-lg border p-4">
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            {tReview("done", {
              assessments: stage.outcome.assessmentsSaved,
              milestones: stage.outcome.milestonesSaved,
              requirements: stage.outcome.requirementsSaved,
            })}
          </p>
        </div>
        <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
          {tReview("startOver")}
        </Button>
      </div>
    );
  }

  if (stage.kind === "review") {
    const { extraction } = stage.preview;
    const totalFound =
      extraction.assessments.length + extraction.milestones.length + extraction.requirements.length;

    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold">{tReview("title")}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{tReview("description")}</p>
          {extraction.documentSummary ? (
            <p className="bg-muted/50 mt-2 rounded-lg p-3 text-sm">{extraction.documentSummary}</p>
          ) : null}
        </div>

        {errorMessage}

        {totalFound === 0 ? (
          <p className="text-muted-foreground text-sm">{tReview("noneFound")}</p>
        ) : (
          <>
            {extraction.assessments.length > 0 ? (
              <div className="space-y-2">
                <h4 className="label-caps">{tReview("assessmentsHeading")}</h4>
                <ul className="space-y-2">
                  {extraction.assessments.map((item, i) => (
                    <AssessmentRow
                      key={i}
                      item={item}
                      checked={stage.selection.assessments[i] ?? false}
                      onToggle={() => toggle("assessments", i)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {extraction.milestones.length > 0 ? (
              <div className="space-y-2">
                <h4 className="label-caps">{tReview("milestonesHeading")}</h4>
                <ul className="space-y-2">
                  {extraction.milestones.map((item, i) => (
                    <MilestoneRow
                      key={i}
                      item={item}
                      checked={stage.selection.milestones[i] ?? false}
                      onToggle={() => toggle("milestones", i)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {extraction.requirements.length > 0 ? (
              <div className="space-y-2">
                <h4 className="label-caps">{tReview("requirementsHeading")}</h4>
                <ul className="space-y-2">
                  {extraction.requirements.map((item, i) => (
                    <RequirementRow
                      key={i}
                      item={item}
                      checked={stage.selection.requirements[i] ?? false}
                      onToggle={() => toggle("requirements", i)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? tReview("saving") : tReview("confirm")}
          </Button>
          <Button variant="ghost" disabled={isPending} onClick={() => setStage({ kind: "idle" })}>
            {tReview("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  const busy = stage.kind === "uploading" || stage.kind === "extracting";

  return (
    <div className="space-y-3">
      {errorMessage}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="course-document-type">
            {t("typeLabel")}
          </label>
          <select
            id="course-document-type"
            value={documentType}
            disabled={busy}
            onChange={(event) => setDocumentType(event.target.value as CourseDocumentType)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm sm:w-auto"
          >
            {COURSE_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            onChange={handleFile}
            disabled={busy}
            aria-label={t("upload")}
            className="hidden"
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {stage.kind === "uploading"
              ? t("uploading")
              : stage.kind === "extracting"
                ? t("extracting")
                : t("upload")}
          </Button>
        </div>
      </div>

      {!busy ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          {t("description")}
        </p>
      ) : null}
    </div>
  );
}
