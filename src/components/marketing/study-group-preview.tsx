import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";

/**
 * Illustration of a study group board, shown on the landing page. Static
 * example data — the real thing arrives in Session 9.
 *
 * The ranking metric is deliberately "how much of your own plan you kept",
 * not hours studied.
 *
 * Streaks are deliberately absent: the product does not compute them yet, and
 * advertising a feature that does not exist is worse than a plainer preview. Ranking on hours punishes a light course load, rewards
 * sleep deprivation, and pushes people to over-plan — the opposite of what the
 * planner is trying to teach.
 */

type Member = {
  name: string;
  adherence: number;
  isYou?: boolean;
};

const MEMBERS: readonly Member[] = [
  { name: "Elin", adherence: 94 },
  { name: "", adherence: 88, isYou: true },
  { name: "Mattias", adherence: 81 },
  { name: "Sofia", adherence: 76 },
  { name: "Ahmed", adherence: 71 },
];

const GOAL_COMPLETED = 47;
const GOAL_TOTAL = 60;

export async function StudyGroupPreview() {
  const t = await getTranslations("landing.groups");
  const goalPercent = Math.round((GOAL_COMPLETED / GOAL_TOTAL) * 100);

  return (
    <div className="bg-card animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-xl border duration-700">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <span className="bg-muted text-muted-foreground rounded-md p-2">
          <Users className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{t("groupName")}</h3>
          <p className="text-muted-foreground text-xs">{t("members", { count: MEMBERS.length })}</p>
        </div>
      </div>

      {/* The collective goal sits above the ranking on purpose: the first thing
          you see is what the group is doing together, not who is winning. */}
      <div className="border-b px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-caps">{t("goalLabel")}</span>
          <span className="text-numeric text-xs font-medium">
            {t("goalValue", { completed: GOAL_COMPLETED, total: GOAL_TOTAL })}
          </span>
        </div>
        <div
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={goalPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("goalLabel")}
        >
          <div className="bg-primary h-full rounded-full" style={{ width: `${goalPercent}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="label-caps">{t("rankHeader")}</span>
      </div>

      <ol className="pb-1">
        {MEMBERS.map((member, index) => {
          const label = member.isYou ? t("you") : member.name;

          return (
            <li
              key={label}
              className={cn(
                "animate-in fade-in slide-in-from-bottom-1 flex items-center gap-3 px-5 py-2 duration-500 fill-mode-both",
                member.isYou && "bg-accent/60",
              )}
              style={{ animationDelay: `${150 + index * 70}ms` }}
            >
              <span className="text-numeric text-muted-foreground w-3 text-xs">{index + 1}</span>

              <span
                className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-medium"
                aria-hidden="true"
              >
                {label.charAt(0)}
              </span>

              <span
                className={cn("min-w-0 flex-1 truncate text-sm", member.isYou && "font-medium")}
              >
                {label}
              </span>

              {/* A quiet bar rather than a big number: the gap between 94% and
                  71% should read as a nudge, not a verdict. */}
              <span className="hidden w-16 sm:block">
                <span className="bg-muted block h-1 overflow-hidden rounded-full">
                  <span
                    className="bg-success block h-full rounded-full"
                    style={{ width: `${member.adherence}%` }}
                  />
                </span>
              </span>

              <span className="text-numeric w-9 text-right text-sm font-medium">
                {member.adherence}%
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground border-t px-5 py-3 text-xs leading-relaxed">
        {t("note")}
      </p>
    </div>
  );
}
