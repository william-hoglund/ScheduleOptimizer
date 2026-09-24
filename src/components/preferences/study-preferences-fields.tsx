"use client";

import { useTranslations } from "next-intl";
import { Controller, type UseFormReturn } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Switch } from "@/components/ui/switch";
import { useValidationText } from "@/features/shared/use-validation-text";
import type { StudyPreferencesInput } from "@/lib/validation/preferences";
import { cn } from "@/lib/utils";

const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const ENERGY_SLOTS = ["morning", "afternoon", "evening"] as const;
const ENERGY_LEVELS = ["high", "medium", "low"] as const;
const BREAK_METHODS = ["pomodoro", "fifty_ten", "ninety_twenty", "none"] as const;
const FLEXIBILITY = ["strict", "balanced", "flexible"] as const;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        {/* h2, not h3: this sits directly under the page or step heading, and
            skipping a level breaks how a screen reader outlines the form.
            `label-caps` fixes the size, so the look is unchanged. */}
        <h2 className="label-caps text-foreground">{title}</h2>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The study-preference inputs, shared by onboarding and settings.
 *
 * Takes the parent's form rather than owning one, so the same fields can be
 * submitted by either screen without the two drifting apart.
 */
export function StudyPreferencesFields({ form }: { form: UseFormReturn<StudyPreferencesInput> }) {
  const t = useTranslations("preferences");
  const tDays = useTranslations("days");
  const message = useValidationText();
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-8">
      <Section title={t("sessionSection")} hint={t("sessionHint")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            label={t("minimumSession")}
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            error={message(errors.minimumSessionMinutes?.message)}
            {...register("minimumSessionMinutes", { valueAsNumber: true })}
          />
          <FormField
            label={t("preferredSession")}
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            error={message(errors.preferredSessionMinutes?.message)}
            {...register("preferredSessionMinutes", { valueAsNumber: true })}
          />
          <FormField
            label={t("maximumSession")}
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            error={message(errors.maximumSessionMinutes?.message)}
            {...register("maximumSessionMinutes", { valueAsNumber: true })}
          />
        </div>
      </Section>

      <Section title={t("loadSection")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={t("maximumDaily")}
            type="number"
            inputMode="numeric"
            min={15}
            max={960}
            error={message(errors.maximumDailyMinutes?.message)}
            {...register("maximumDailyMinutes", { valueAsNumber: true })}
          />
          <FormField
            label={t("weeklyTarget")}
            type="number"
            inputMode="numeric"
            min={0}
            max={6720}
            error={message(errors.weeklyTargetMinutes?.message)}
            {...register("weeklyTargetMinutes", { valueAsNumber: true })}
          />
          <FormField
            label={t("earliestStart")}
            type="time"
            error={message(errors.earliestStartTime?.message)}
            {...register("earliestStartTime")}
          />
          <FormField
            label={t("latestEnd")}
            type="time"
            error={message(errors.latestEndTime?.message)}
            {...register("latestEndTime")}
          />
        </div>
      </Section>

      <Section title={t("daysSection")} hint={t("daysHint")}>
        <Controller
          control={control}
          name="preferredDays"
          render={({ field }) => (
            <div>
              {/* A group of toggles rather than checkboxes: faster to scan, and
                  aria-pressed still announces the state correctly. */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("daysSection")}>
                {ISO_WEEKDAYS.map((day) => {
                  const selected = field.value.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((d) => d !== day)
                            : [...field.value, day].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        "min-h-9 rounded-md border px-3 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {tDays(`short${day}` as "short1")}
                    </button>
                  );
                })}
              </div>
              {errors.preferredDays ? (
                <p className="text-destructive mt-1.5 text-xs">
                  {message(errors.preferredDays.message)}
                </p>
              ) : null}
            </div>
          )}
        />

        <Controller
          control={control}
          name="weekendAllowed"
          render={({ field }) => (
            <label className="flex items-start gap-3">
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label={t("weekendAllowed")}
              />
              <span>
                <span className="block text-sm font-medium">{t("weekendAllowed")}</span>
                <span className="text-muted-foreground block text-xs">
                  {t("weekendAllowedHint")}
                </span>
              </span>
            </label>
          )}
        />
      </Section>

      <Section title={t("breakSection")}>
        <NativeSelect
          label={t("breakMethod")}
          error={message(errors.breakMethod?.message)}
          {...register("breakMethod")}
        >
          {BREAK_METHODS.map((method) => (
            <option key={method} value={method}>
              {t(`breakMethods.${method}`)}
            </option>
          ))}
        </NativeSelect>
      </Section>

      <Section title={t("energySection")} hint={t("energyHint")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {ENERGY_SLOTS.map((slot) => (
            <NativeSelect key={slot} label={t(slot)} {...register(`energyProfile.${slot}`)}>
              {ENERGY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`energyLevels.${level}`)}
                </option>
              ))}
            </NativeSelect>
          ))}
        </div>
      </Section>

      <Section title={t("flexibilitySection")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <NativeSelect label={t("flexibility")} {...register("planningFlexibility")}>
            {FLEXIBILITY.map((level) => (
              <option key={level} value={level}>
                {t(`flexibilityLevels.${level}`)}
              </option>
            ))}
          </NativeSelect>

          <FormField
            label={t("buffer")}
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            hint={t("bufferHint")}
            error={message(errors.bufferPercentage?.message)}
            {...register("bufferPercentage", { valueAsNumber: true })}
          />
        </div>
      </Section>
    </div>
  );
}
