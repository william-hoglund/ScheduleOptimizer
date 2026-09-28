import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { CourseMilestoneRow, CourseRequirementRow, ExtractionConfidence } from "@/lib/supabase/types";

/**
 * Facts extracted from uploaded course documents (docs/PLAN.md §40.3, §40.11).
 * Read-only, server-rendered — nothing here is interactive, and everything
 * shown is a fact with a confidence and a source, never a suggestion. Any AI
 * *recommendation* (a prep timeline, "start researching now") belongs to the
 * advisor's propose/confirm path, not this panel.
 */

async function ConfidenceBadge({ confidence }: { confidence: ExtractionConfidence }) {
  const t = await getTranslations("courseKnowledge.knowledge");
  const variant = confidence === "low" ? "outline" : confidence === "medium" ? "secondary" : "default";
  const label =
    confidence === "high"
      ? t("confidenceHigh")
      : confidence === "medium"
        ? t("confidenceMedium")
        : t("confidenceLow");

  return (
    <Badge variant={variant} className="shrink-0">
      {label}
    </Badge>
  );
}

async function SourcePage({ page }: { page: number | null }) {
  const t = await getTranslations("courseKnowledge.knowledge");
  if (page === null) return null;
  return <span className="text-muted-foreground text-xs">{t("sourcePage", { page })}</span>;
}

async function RequirementRow({ requirement }: { requirement: CourseRequirementRow }) {
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{requirement.title}</p>
        <ConfidenceBadge confidence={requirement.confidence} />
      </div>
      {requirement.description ? (
        <p className="text-muted-foreground mt-1 text-xs">{requirement.description}</p>
      ) : null}
      <SourcePage page={requirement.source_page} />
    </li>
  );
}

async function MilestoneRow({ milestone, timeZone }: { milestone: CourseMilestoneRow; timeZone: string }) {
  const format = await getFormatter();

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{milestone.title}</p>
        <ConfidenceBadge confidence={milestone.confidence} />
      </div>
      <p className="text-numeric text-muted-foreground mt-1 text-xs">
        {format.dateTime(new Date(`${milestone.milestone_date}T00:00:00`), {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone,
        })}
      </p>
      {milestone.description ? (
        <p className="text-muted-foreground mt-1 text-xs">{milestone.description}</p>
      ) : null}
      <SourcePage page={milestone.source_page} />
    </li>
  );
}

export async function CourseKnowledgePanel({
  requirements,
  milestones,
  timeZone,
}: {
  requirements: CourseRequirementRow[];
  milestones: CourseMilestoneRow[];
  timeZone: string;
}) {
  const t = await getTranslations("courseKnowledge.knowledge");

  if (requirements.length === 0 && milestones.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">{t("description")}</p>

      {milestones.length > 0 ? (
        <div className="space-y-2">
          <h3 className="label-caps">{t("milestonesTitle")}</h3>
          <ul className="space-y-2">
            {milestones.map((milestone) => (
              <MilestoneRow key={milestone.id} milestone={milestone} timeZone={timeZone} />
            ))}
          </ul>
        </div>
      ) : null}

      {requirements.length > 0 ? (
        <div className="space-y-2">
          <h3 className="label-caps">{t("requirementsTitle")}</h3>
          <ul className="space-y-2">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.id} requirement={requirement} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
