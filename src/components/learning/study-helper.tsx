"use client";

import { AlertTriangle, BookOpen, HelpCircle, Lightbulb, ListChecks, Loader2, MessageCircleQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { askStudyHelper } from "@/features/learning/actions";
import type { StudyHelp, StudyHelpMode } from "@/lib/ai";
import { STUDY_HELP_MODES } from "@/lib/ai/schemas/study-help";
import { AI_LIMITS } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/**
 * The Learn page's interactive part: pick material, pick how you want help,
 * optionally say what about, get an answer drawn only from that material.
 *
 * Answers stack newest-first so a student can ask follow-ups and still scroll
 * back to an earlier summary — a study session, not a single query.
 */

export type StudyMaterialOption = { id: string; fileName: string; isLectureMaterial: boolean };

type Answer = { id: number; mode: StudyHelpMode; request: string; help: StudyHelp; truncated: boolean };

const MODE_ICON = {
  summary: BookOpen,
  explain: Lightbulb,
  ask: MessageCircleQuestion,
  quiz: ListChecks,
} as const;

export function StudyHelper({ courseId, materials }: { courseId: string; materials: StudyMaterialOption[] }) {
  const t = useTranslations("learn");
  const [mode, setMode] = useState<StudyHelpMode>("summary");
  const [request, setRequest] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => {
    const lecture = materials.filter((m) => m.isLectureMaterial);
    return new Set((lecture.length > 0 ? lecture : materials).map((m) => m.id));
  });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsRequest = mode === "explain" || mode === "ask";
  const canSubmit = selected.size > 0 && (!needsRequest || request.trim().length > 0) && !isPending;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    const sentRequest = request.trim();
    startTransition(async () => {
      const result = await askStudyHelper({ courseId, documentIds: [...selected], mode, request: sentRequest });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAnswers((current) => [{ id: Date.now(), mode, request: sentRequest, ...result.data }, ...current]);
      if (mode === "ask" || mode === "explain") setRequest("");
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-xl border p-4 sm:p-5">
        <div className="space-y-2">
          <h2 className="label-caps">{t("modeLabel")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t("modeLabel")}>
            {STUDY_HELP_MODES.map((m) => {
              const Icon = MODE_ICON[m];
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`modes.${m}.name`)}
                  </span>
                  <span className="text-muted-foreground text-xs">{t(`modes.${m}.hint`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="study-request" className="text-sm font-medium">
            {needsRequest ? t("requestLabelRequired") : t("requestLabelOptional")}
          </label>
          <Textarea
            id="study-request"
            rows={2}
            maxLength={AI_LIMITS.maxStudyRequestChars}
            placeholder={t(`modes.${mode}.placeholder`)}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) submit();
            }}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("materialLabel")}</legend>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {materials.map((material) => (
              <li key={material.id}>
                <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm">
                  <Checkbox
                    checked={selected.has(material.id)}
                    onCheckedChange={(value) => toggle(material.id, value === true)}
                  />
                  <span className="truncate">{material.fileName}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {error ? (
          <p role="alert" className="text-destructive flex items-center gap-1.5 text-sm">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {t(`errors.${errorKey(error)}`)}
          </p>
        ) : null}

        <Button onClick={submit} disabled={!canSubmit}>
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isPending ? t("working") : t(`modes.${mode}.submit`)}
        </Button>
      </section>

      {answers.length > 0 ? (
        <section className="space-y-4" aria-live="polite">
          {answers.map((answer) => (
            <AnswerCard key={answer.id} answer={answer} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

const KNOWN_ERRORS = ["aiUnavailable", "notFound", "noText", "helpFailed", "required", "tooLong"] as const;
function errorKey(error: string): (typeof KNOWN_ERRORS)[number] | "unexpected" {
  return (KNOWN_ERRORS as readonly string[]).includes(error)
    ? (error as (typeof KNOWN_ERRORS)[number])
    : "unexpected";
}

function AnswerCard({ answer }: { answer: Answer }) {
  const t = useTranslations("learn");
  const { help } = answer;

  return (
    <article className="animate-in fade-in slide-in-from-bottom-2 space-y-4 rounded-xl border p-4 duration-300 sm:p-5">
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs">
          {t(`modes.${answer.mode}.name`)}
          {answer.request ? ` · ${answer.request}` : ""}
        </p>
        <h3 className="text-lg font-semibold">{help.title}</h3>
      </header>

      {!help.coveredByMaterial ? (
        <p className="bg-muted flex items-start gap-2 rounded-md p-3 text-sm">
          <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("notCovered")}
        </p>
      ) : null}

      {help.sections.map((section, index) => (
        <div key={index} className="space-y-1">
          <h4 className="text-sm font-semibold">{section.heading}</h4>
          <p className="text-sm leading-relaxed whitespace-pre-line">{section.body}</p>
        </div>
      ))}

      {help.keyPoints.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="label-caps">{t("keyPoints")}</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {help.keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {help.quiz.length > 0 ? (
        <ol className="space-y-2">
          {help.quiz.map((item, index) => (
            <li key={index} className="rounded-lg border p-3">
              <p className="text-sm font-medium">
                {index + 1}. {item.question}
              </p>
              <details className="mt-1.5">
                <summary className="text-primary cursor-pointer text-xs font-medium">{t("showAnswer")}</summary>
                <p className="mt-1.5 text-sm whitespace-pre-line">{item.answer}</p>
              </details>
            </li>
          ))}
        </ol>
      ) : null}

      {help.sources.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("sources")}{" "}
          {help.sources
            .map((source) => (source.page ? `${source.documentName} (${t("page", { page: source.page })})` : source.documentName))
            .join(" · ")}
        </p>
      ) : null}

      {answer.truncated ? <p className="text-muted-foreground text-xs">{t("truncated")}</p> : null}
    </article>
  );
}
