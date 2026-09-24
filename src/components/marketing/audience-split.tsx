import { Briefcase, GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";

/**
 * The two weeks this product is for, said plainly.
 *
 * Not two products — the engine is identical. What differs is where the time
 * comes from: a student's week is shaped by a timetable, a working
 * professional's by a job that takes the whole day and leaves evenings that are
 * already tired. Someone arriving here should recognise their own week in one
 * of these before they read anything else.
 */

/**
 * Fully qualified keys, not a segment plus a suffix.
 *
 * next-intl checks keys against the message files at compile time, and it can
 * only do that when the whole key is a literal — "student." + a shared list of
 * suffixes would let a key that exists for one segment be used for the other.
 */
const SEGMENTS = [
  {
    key: "student",
    icon: GraduationCap,
    points: ["student.points.timetable", "student.points.exams", "student.points.balance"],
  },
  {
    key: "professional",
    icon: Briefcase,
    points: [
      "professional.points.afterWork",
      "professional.points.realistic",
      "professional.points.protect",
    ],
  },
] as const;

export async function AudienceSplit() {
  const t = await getTranslations("landing.audiences");

  return (
    <section id="who-its-for" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-3 leading-relaxed text-pretty">{t("subtitle")}</p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {SEGMENTS.map(({ key, icon: Icon, points }) => (
            <div
              key={key}
              className="bg-card flex flex-col rounded-2xl border p-6 lg:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold">{t(`${key}.title`)}</h3>
              </div>

              <p className="text-muted-foreground mt-4 text-sm leading-relaxed text-pretty">
                {t(`${key}.body`)}
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                {points.map((point) => (
                  <li key={point} className="flex gap-3">
                    {/* A dash, not a tick: these are facts about the week, not
                        features being sold. */}
                    <span className="text-muted-foreground mt-2 h-px w-3 shrink-0 bg-current" />
                    <span className="text-pretty">{t(point)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                <p className="label-caps">{t(`${key}.measures`)}</p>
                <p className="mt-1.5 text-sm font-medium">{t(`${key}.metric`)}</p>
              </div>

              <div className="pt-6">
                <ButtonLink href="/register" variant={key === "student" ? "default" : "outline"}>
                  {t(`${key}.cta`)}
                </ButtonLink>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
