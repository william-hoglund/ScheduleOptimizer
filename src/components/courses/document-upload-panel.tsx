"use client";

import { AlertTriangle, CheckCircle2, ClipboardPaste, FileText, Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmExtraction,
  previewExtraction,
  recordCourseDocument,
  type ExtractionPreview,
} from "@/features/course-knowledge/actions";
import { ExtractionReview, type ExtractionConfirmInput } from "./extraction-review";
import { finishLearningMaterialUpload } from "@/features/learning/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  COURSE_DOCUMENT_TYPES,
  isLearningMaterial,
  LEARNING_MATERIAL_TYPES,
  MAX_DOCUMENT_BYTES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
} from "@/lib/validation/course-knowledge";
import type { CourseDocumentType } from "@/lib/supabase/types";
import type { SaveExtractionOutcome } from "@/server/course-knowledge-service";

/**
 * Upload a course document, review the AI's proposed extraction, confirm.
 *
 * The file is uploaded straight from the browser to Supabase Storage — a
 * Server Action's default body limit is far smaller than a real PDF, so the
 * server only ever handles the small JSON that follows (the storage path,
 * then the reviewed extraction). Same reasoning as the export routes in
 * `import-export`, just for the opposite direction.
 *
 * The review UI itself lives in `extraction-review.tsx`, shared with
 * `CourseFormDialog`'s "paste outline text" path — two ways to get text to
 * the AI, one review screen.
 */

type Stage =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "extracting" }
  | { kind: "review"; preview: ExtractionPreview }
  | { kind: "done"; outcome: SaveExtractionOutcome }
  /** Lecture material: stored for the Learn page, no extraction to review. */
  | { kind: "materialSaved" };

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

export function DocumentUploadPanel({
  courseId,
  materialOnly = false,
}: {
  courseId: string;
  /**
   * The Learn page's version: only lecture slides/notes, several files at
   * once, and a "paste notes" box — study material, never syllabus extraction.
   */
  materialOnly?: boolean;
}) {
  const t = useTranslations("courseKnowledge.documents");
  const tReview = useTranslations("courseKnowledge.review");
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [documentType, setDocumentType] = useState<CourseDocumentType>(materialOnly ? "lecture_slides" : "syllabus");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const typeOptions = materialOnly ? LEARNING_MATERIAL_TYPES : COURSE_DOCUMENT_TYPES;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Uploads to storage, records the document, and runs extraction — shared
   *  by the file-input path below. Returns whether it reached the review stage. */
  async function submitDocument(
    file: Blob,
    fileName: string,
    mimeType: (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number],
    typeOverride?: CourseDocumentType,
    /** How to name it once read: from the file's own name as a hint, from pasted text, or not at all. */
    autoTitle: "pasted" | "file" | null = "file",
  ): Promise<boolean> {
    const type = typeOverride ?? documentType;
    setStage({ kind: "uploading" });

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("unexpected");
      setStage({ kind: "idle" });
      return false;
    }

    const storagePath = `${user.id}/${courseId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;

    const { error: uploadError } = await supabase.storage
      .from("course-documents")
      .upload(storagePath, file, { contentType: mimeType });
    if (uploadError) {
      console.error("[document-upload] storage upload failed:", uploadError);
      setError("uploadFailed");
      setStage({ kind: "idle" });
      return false;
    }

    const recorded = await recordCourseDocument({
      courseId,
      fileName,
      fileSize: file.size,
      mimeType,
      storagePath,
      documentType: type,
    });
    if (!recorded.ok) {
      setError(recorded.error);
      setStage({ kind: "idle" });
      return false;
    }

    if (isLearningMaterial(type)) {
      setStage({ kind: "extracting" });
      const checked = await finishLearningMaterialUpload(recorded.data.id, autoTitle ? { autoTitle } : {});
      if (!checked.ok) {
        setError(checked.error);
        setStage({ kind: "idle" });
        return false;
      }
      setStage({ kind: "materialSaved" });
      return true;
    }

    setStage({ kind: "extracting" });
    const preview = await previewExtraction(recorded.data.id);
    if (!preview.ok) {
      setError(preview.error);
      setStage({ kind: "idle" });
      return false;
    }

    setStage({ kind: "review", preview: preview.data });
    return true;
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    // Several at once only for study material — syllabus extraction reviews one file at a time.
    const files = [...(event.target.files ?? [])].slice(0, materialOnly ? 20 : 1);
    if (fileInput.current) fileInput.current.value = "";
    if (files.length === 0) return;

    if (files.some((file) => file.size > MAX_DOCUMENT_BYTES)) {
      setError("tooLarge");
      return;
    }
    if (files.some((file) => !(SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type))) {
      setError("unsupportedType");
      return;
    }

    setError(null);
    startTransition(async () => {
      for (const file of files) {
        const ok = await submitDocument(file, file.name, file.type as (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number]);
        if (!ok) break;
      }
    });
  }

  /** Pasted notes become a plain-text lecture-notes document, like any upload. */
  function handlePaste() {
    const text = pasteText.trim();
    if (!text) return;
    // No title given: a placeholder now, and the server names it from the text
    // (matched against the course outline) once it has read it.
    const untitled = pasteTitle.trim().length === 0;
    const name = untitled ? t("pastedNotesName") : pasteTitle.trim().slice(0, 120);
    setError(null);
    startTransition(async () => {
      const ok = await submitDocument(
        new Blob([text], { type: "text/plain" }),
        name,
        "text/plain",
        "lecture_notes",
        untitled ? "pasted" : null,
      );
      if (ok) {
        setPasteText("");
        setPasteTitle("");
      }
    });
  }

  function handleConfirm(input: ExtractionConfirmInput) {
    if (stage.kind !== "review") return;
    const documentId = stage.preview.documentId;

    startTransition(async () => {
      const result = await confirmExtraction({ documentId, ...input });
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
        <div className="border-success/40 bg-success/5 animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border p-4 duration-300">
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

  if (stage.kind === "materialSaved") {
    return (
      <div className="space-y-4">
        <div className="border-success/40 bg-success/5 animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border p-4 duration-300">
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">{materialOnly ? t("materialSavedHere") : t("materialSaved")}</p>
        </div>
        <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
          {tReview("startOver")}
        </Button>
      </div>
    );
  }

  if (stage.kind === "review") {
    return (
      <ExtractionReview
        preview={stage.preview}
        isPending={isPending}
        error={errorMessage}
        onConfirm={handleConfirm}
        onCancel={() => setStage({ kind: "idle" })}
      />
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
            {typeOptions.map((type) => (
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
            accept=".pdf,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown"
            onChange={handleFile}
            multiple={materialOnly}
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

      {materialOnly ? (
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="course-paste-text" className="text-sm font-medium">
            {t("pasteNotes")}
          </label>
          <input
            value={pasteTitle}
            onChange={(event) => setPasteTitle(event.target.value)}
            placeholder={t("pasteNotesTitleOptional")}
            aria-label={t("pasteNotesTitleOptional")}
            maxLength={120}
            disabled={busy}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          />
          <Textarea
            id="course-paste-text"
            rows={5}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={t("pasteNotesPlaceholder")}
            disabled={busy}
          />
          <Button size="sm" variant="outline" onClick={handlePaste} disabled={busy || !pasteText.trim()}>
            <ClipboardPaste className="size-4" aria-hidden="true" />
            {t("pasteNotesSave")}
          </Button>
        </div>
      ) : null}

      {!busy ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          {materialOnly ? t("materialDescription") : t("description")}
        </p>
      ) : null}
    </div>
  );
}
