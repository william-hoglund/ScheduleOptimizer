import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { STUDY_HELP_MODES } from "@/lib/ai/schemas/study-help";
import { STUDY_METHODS } from "@/lib/validation/task";

/**
 * A plain guide to what the product does and how each way of studying works,
 * so a student can pick the help that suits them rather than guess.
 */

const PLANNING_POINTS = ["availability", "classes", "deadlines", "startDate", "studyStyle", "logging", "replan"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("howItWorks");
  return { title: t("title") };
}

export default async function HowItWorksPage() {
  const t = await getTranslations("howItWorks");
  const tLearn = await getTranslations("learn");
  const tMethods = await getTranslations("tasks.methods");

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title={t("title")} description={t("description")} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("planning.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {PLANNING_POINTS.map((point) => (
            <li key={point}>{t(`planning.${point}`)}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("learn.title")}</h2>
        <p className="text-muted-foreground text-sm">{t("learn.intro")}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {STUDY_HELP_MODES.map((mode) => (
            <div key={mode} className="rounded-lg border p-3">
              <dt className="text-sm font-medium">{tLearn(`modes.${mode}.name`)}</dt>
              <dd className="text-muted-foreground mt-1 text-sm">{t(`learn.modes.${mode}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground text-sm">{t("learn.material")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("methods.title")}</h2>
        <p className="text-muted-foreground text-sm">{t("methods.intro")}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {STUDY_METHODS.map((method) => (
            <div key={method} className="rounded-lg border p-3">
              <dt className="text-sm font-medium">{tMethods(method)}</dt>
              <dd className="text-muted-foreground mt-1 text-sm">{t(`methods.${method}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
