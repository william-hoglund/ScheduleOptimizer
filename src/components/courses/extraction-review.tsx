"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExtractionPreview } from "@/features/course-knowledge/actions";
import {
  type AssessmentSelection,
  type MilestoneSelection,
  type RequirementSelection,
} from "@/lib/validation/course-knowledge";
import type { ExtractedAssessment, ExtractedMilestone, ExtractedRequirement } from "@/lib/ai";

/**
 * What a student ticks after an upload or a paste is read — shared between
 * `DocumentUploadPanel` (the course page's own document list) and
 * `CourseFormDialog` (pasting outline text straight from Edit course), so
 * that second path isn't a second, drifting copy of the same review UI.
 * Everything here mirrors `ImportReviewList`'s shape: parsed facts in,
 * nothing saved until the student says so, the save itself left to the
 * caller since each embeds this in a different flow.
 */

const MAX_ITEMS_PER_KIND = 30;

type ReviewSelection = {
  assessments: boolean[];
  milestones: boolean[];
  requirements: boolean[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A confirmed single date, or null.
 *
 * The prompt asks the model for YYYY-MM-DD-or-null, but a live run returned a
 * date *range* as free text for a reading week instead of null — the schema
 * has no format constraint on this field, only the confirm schema does, so
 * an unguarded value here would pass the checkbox as "has a date" and then
 * fail validation on confirm, silently blocking the whole save. Treated the
 * same as no date: nothing to attach to a single `milestone_date` column.
 */
function confirmedDate(date: string | null): string | null {
  return date !== null && ISO_DATE_RE.test(date) ? date : null;
}

/** Low-confidence items start unticked — ambiguous extractions need a deliberate yes. */
function defaultChecked(confidence: "high" | "medium" | "low"): boolean {
  return confidence !== "low";
}

function initialSelection(extraction: ExtractionPreview["extraction"]): ReviewSelection {
  return {
    assessments: extraction.assessments.map((a) => defaultChecked(a.confidence)),
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
  index,
}: {
  item: ExtractedAssessment;
  checked: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 rounded-lg border p-3 duration-300 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
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
  index,
}: {
  item: ExtractedMilestone;
  checked: boolean;
  onToggle: () => void;
  index: number;
}) {
  const t = useTranslations("courseKnowledge.review");
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 rounded-lg border p-3 duration-300 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
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
  index,
}: {
  item: ExtractedRequirement;
  checked: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 rounded-lg border p-3 duration-300 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
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

export type ExtractionConfirmInput = {
  assessments: AssessmentSelection[];
  milestones: MilestoneSelection[];
  requirements: RequirementSelection[];
};

export function ExtractionReview({
  preview,
  isPending,
  error,
  onConfirm,
  onCancel,
}: {
  preview: ExtractionPreview;
  isPending: boolean;
  error?: React.ReactNode;
  onConfirm: (input: ExtractionConfirmInput) => void;
  onCancel: () => void;
}) {
  const tReview = useTranslations("courseKnowledge.review");
  const [selection, setSelection] = useState<ReviewSelection>(() => initialSelection(preview.extraction));

  function toggle(kind: keyof ReviewSelection, index: number) {
    setSelection((current) => {
      const next = { ...current, [kind]: [...current[kind]] };
      next[kind][index] = !next[kind][index];
      return next;
    });
  }

  function handleConfirm() {
    const { extraction } = preview;

    const assessments: AssessmentSelection[] = extraction.assessments
      .filter((_, i) => selection.assessments[i])
      // Same malformed-date guard as milestones: a deadline that isn't clean
      // ISO would otherwise fail server-side validation and block the whole
      // save rather than just arriving as "no deadline set".
      .map((a) => ({ ...a, deadlineLocal: confirmedDate(a.deadlineLocal) }))
      .slice(0, MAX_ITEMS_PER_KIND);
    const milestones: MilestoneSelection[] = extraction.milestones
      .filter((m, i) => selection.milestones[i] && confirmedDate(m.date) !== null)
      .map((m) => ({ ...m, date: confirmedDate(m.date) as string }))
      .slice(0, MAX_ITEMS_PER_KIND);
    const requirements: RequirementSelection[] = extraction.requirements
      .filter((_, i) => selection.requirements[i])
      .slice(0, MAX_ITEMS_PER_KIND);

    onConfirm({ assessments, milestones, requirements });
  }

  const { extraction } = preview;
  const totalFound = extraction.assessments.length + extraction.milestones.length + extraction.requirements.length;

  return (
    <div className="animate-in fade-in duration-300 space-y-5">
      <div>
        <h3 className="text-sm font-semibold">{tReview("title")}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{tReview("description")}</p>
        {extraction.documentSummary ? (
          <p className="bg-muted/50 mt-2 rounded-lg p-3 text-sm">{extraction.documentSummary}</p>
        ) : null}
      </div>

      {error}

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
                    checked={selection.assessments[i] ?? false}
                    onToggle={() => toggle("assessments", i)}
                    index={i}
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
                    checked={selection.milestones[i] ?? false}
                    onToggle={() => toggle("milestones", i)}
                    index={i}
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
                    checked={selection.requirements[i] ?? false}
                    onToggle={() => toggle("requirements", i)}
                    index={i}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleConfirm} disabled={isPending}>
          {isPending ? tReview("saving") : tReview("confirm")}
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
          {tReview("cancel")}
        </Button>
      </div>
    </div>
  );
}
