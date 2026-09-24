import {
  CalendarRange,
  Compass,
  Download,
  Layers,
  Lock,
  MessageSquareText,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ButtonAnchor, ButtonLink } from "@/components/common/button-link";
import { AudienceSplit } from "@/components/marketing/audience-split";
import { ExampleWeek } from "@/components/marketing/example-week";
import { StudyGroupPreview } from "@/components/marketing/study-group-preview";

const PROBLEM_POINTS = [
  { key: "scattered", icon: Layers },
  { key: "unrealistic", icon: Scale },
  { key: "fragile", icon: RefreshCw },
] as const;

const STEPS = ["one", "two", "three", "four"] as const;

const GROUP_POINTS = [
  { key: "fair", icon: Scale },
  { key: "private", icon: Lock },
  { key: "together", icon: Users },
] as const;

const FEATURES = [
  { key: "combined", icon: CalendarRange },
  { key: "realistic", icon: Scale },
  { key: "adaptive", icon: RefreshCw },
  { key: "explained", icon: MessageSquareText },
  { key: "recovery", icon: ShieldCheck },
  { key: "portable", icon: Download },
] as const;

export default async function LandingPage() {
  const t = await getTranslations("landing");

  return (
    <>
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-w-xl">
            <p className="label-caps">{t("hero.eyebrow")}</p>

            <h1 className="mt-4 text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
              {t("hero.title")}
            </h1>

            <p className="text-muted-foreground mt-5 text-base leading-relaxed text-pretty">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink size="lg" href="/register">
                {t("hero.primaryCta")}
              </ButtonLink>
              <ButtonAnchor size="lg" variant="outline" href="#how-it-works">
                {t("hero.secondaryCta")}
              </ButtonAnchor>
            </div>

            <p className="text-muted-foreground mt-4 text-xs">{t("hero.note")}</p>
          </div>

          <div className="lg:pl-4">
            <ExampleWeek />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="bg-card/40 border-y">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {t("problem.title")}
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed text-pretty">
              {t("problem.body")}
            </p>
          </div>

          <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {PROBLEM_POINTS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <Icon className="text-muted-foreground size-5" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{t(`problem.points.${key}.title`)}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {t(`problem.points.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <AudienceSplit />

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {t("how.title")}
            </h2>
            <p className="text-muted-foreground mt-3">{t("how.subtitle")}</p>
          </div>

          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step} className="border-t pt-5">
                <span className="text-primary font-mono text-xs font-medium tabular-nums">
                  {t(`how.steps.${step}.number`)}
                </span>
                <h3 className="mt-2 text-base font-semibold">{t(`how.steps.${step}.title`)}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {t(`how.steps.${step}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Example plan with its explanation */}
      <section className="bg-card/40 border-y">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {t("example.title")}
            </h2>
            <p className="text-muted-foreground mt-3">{t("example.subtitle")}</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <ExampleWeek />

            <div className="bg-card rounded-xl border p-5">
              <div className="flex items-center gap-2">
                <Compass className="text-primary size-4" aria-hidden="true" />
                <h3 className="label-caps text-foreground">{t("example.explanationLabel")}</h3>
              </div>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
                {t("example.explanation")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Study groups */}
      <section id="groups" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
            <div className="max-w-xl">
              <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                {t("groups.title")}
              </h2>
              <p className="text-muted-foreground mt-3 leading-relaxed text-pretty">
                {t("groups.subtitle")}
              </p>

              <ul className="mt-8 space-y-5">
                {GROUP_POINTS.map(({ key, icon: Icon }) => (
                  <li key={key} className="flex gap-3">
                    <Icon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold">{t(`groups.points.${key}.title`)}</h3>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {t(`groups.points.${key}.body`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <StudyGroupPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <h2 className="max-w-2xl text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {t("features.title")}
          </h2>

          <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li key={key}>
                <Icon className="text-primary size-5" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{t(`features.items.${key}.title`)}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {t(`features.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-card/40 border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {t("cta.title")}
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed text-pretty">
              {t("cta.body")}
            </p>
            <ButtonLink size="lg" className="mt-7" href="/register">
              {t("cta.button")}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
