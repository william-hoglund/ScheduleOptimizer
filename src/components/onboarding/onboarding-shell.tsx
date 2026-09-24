import { getTranslations } from "next-intl/server";

import { LAST_STEP } from "@/features/onboarding/steps";

export async function OnboardingShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("onboarding");
  const percent = Math.round((step / LAST_STEP) * 100);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps">{t("stepLabel", { current: step, total: LAST_STEP })}</span>
          <span className="text-numeric text-muted-foreground text-xs">{percent}%</span>
        </div>

        <div
          className="bg-muted h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("stepLabel", { current: step, total: LAST_STEP })}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <h1>{title}</h1>
        {subtitle ? <p className="text-muted-foreground text-sm text-pretty">{subtitle}</p> : null}
      </div>

      {children}
    </div>
  );
}
