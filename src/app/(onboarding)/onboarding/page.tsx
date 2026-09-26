import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { StepBasics } from "@/components/onboarding/step-basics";
import { StepCourses } from "@/components/onboarding/step-courses";
import { StepDone } from "@/components/onboarding/step-done";
import { StepPlan } from "@/components/onboarding/step-plan";
import { StepPreferences } from "@/components/onboarding/step-preferences";
import { StepStudies } from "@/components/onboarding/step-studies";
import { stepFromNumber } from "@/features/onboarding/steps";
import { defaultTimeZone, isLocale } from "@/i18n/config";
import { utcToLocalDate } from "@/lib/calendar/time";
import { isSegment } from "@/lib/segments";
import { listPrograms } from "@/server/academic-service";
import { requireUser } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { listCourses } from "@/server/course-service";
import { findLatestDraftPlan } from "@/server/planner-service";
import { getStudyPreferences, toPreferencesInput } from "@/server/preference-service";
import { getProfile } from "@/server/profile-service";

/** Its own title: the site default says nothing about where you are. */
export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("pageTitle") };
}

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  // Already finished: nothing to do here.
  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  const t = await getTranslations("onboarding");
  const tDays = await getTranslations("days");

  // Step 0 means "never started" — treat it as step 1.
  const stepNumber = Math.max(profile?.onboarding_step ?? 1, 1);
  const step = stepFromNumber(stepNumber);

  if (step === "basics") {
    return (
      <OnboardingShell step={1} title={t("basics.title")} subtitle={t("basics.subtitle")}>
        <StepBasics
          defaults={{
            fullName: profile?.full_name ?? "",
            timezone: profile?.timezone || defaultTimeZone,
            locale: isLocale(profile?.locale) ? profile.locale : "en",
            segment: isSegment(profile?.segment) ? profile.segment : "student",
          }}
        />
      </OnboardingShell>
    );
  }

  if (step === "studies") {
    return (
      <OnboardingShell step={2} title={t("studies.title")} subtitle={t("studies.subtitle")}>
        <StepStudies />
      </OnboardingShell>
    );
  }

  if (step === "courses") {
    const [courses, programs] = await Promise.all([listCourses(user.id), listPrograms(user.id)]);

    return (
      <OnboardingShell step={3} title={t("courses.title")} subtitle={t("courses.subtitle")}>
        <StepCourses courses={courses} programs={programs} />
      </OnboardingShell>
    );
  }

  if (step === "preferences") {
    const preferences = await getStudyPreferences(user.id);

    return (
      <OnboardingShell step={4} title={t("preferences.title")} subtitle={t("preferences.subtitle")}>
        <StepPreferences defaults={toPreferencesInput(preferences)} />
      </OnboardingShell>
    );
  }

  const timeZone = profile?.timezone || defaultTimeZone;

  if (step === "plan") {
    const today = utcToLocalDate(nowIso(), timeZone);
    const defaultDeadline = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    return (
      <OnboardingShell step={5} title={t("plan.title")} subtitle={t("plan.subtitle")}>
        <StepPlan defaultDeadline={defaultDeadline} />
      </OnboardingShell>
    );
  }

  const [courses, preferencesRow, latestPlan] = await Promise.all([
    listCourses(user.id),
    getStudyPreferences(user.id),
    findLatestDraftPlan(user.id, timeZone),
  ]);
  const preferences = toPreferencesInput(preferencesRow);

  return (
    <OnboardingShell step={6} title={t("done.title")} subtitle={t("done.subtitle")}>
      <StepDone
        name={profile?.full_name ?? user.email ?? ""}
        courseCount={courses.length}
        sessionSummary={t("done.sessionSummary", {
          preferred: preferences.preferredSessionMinutes,
          daily: preferences.maximumDailyMinutes,
        })}
        daysSummary={preferences.preferredDays
          .map((day) => tDays(`short${day}` as "short1"))
          .join(", ")}
        planSummary={
          latestPlan
            ? t("done.planSummary", {
                hours: Math.floor(latestPlan.totalMinutes / 60),
                minutes: latestPlan.totalMinutes % 60,
                days: latestPlan.dayCount,
              })
            : null
        }
      />
    </OnboardingShell>
  );
}
