import { getTranslations } from "next-intl/server";

import { CalendarSourceList, type CalendarSourceView } from "@/components/import-export/calendar-source-list";
import { ExportPanel } from "@/components/import-export/export-panel";
import { GoogleCalendarPanel } from "@/components/import-export/google-calendar-panel";
import { IcsImportPanel } from "@/components/import-export/ics-import-panel";
import { ScheduleImagePanel } from "@/components/import-export/schedule-image-panel";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { isAiEnabled } from "@/lib/ai";
import { utcToLocalDate } from "@/lib/calendar/time";
import { requireUserContext } from "@/server/auth";
import { listCalendarSources } from "@/server/calendar-source-service";
import { nowIso } from "@/server/clock";
import { isGoogleCalendarEnabled } from "@/server/google-calendar-service";
import {
  getGoogleConnectionStatus,
  type GoogleConnectionStatus,
} from "@/server/google-connection-service";

export const generateMetadata = () => createPageMetadata("importExport");

/** Calendar arithmetic on a local date — never "now plus 28 × 24 hours". */
function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export default async function ImportExportPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  const today = utcToLocalDate(nowIso(), timeZone);

  /**
   * Calendars depend on a migration that may not be applied yet. Importing and
   * exporting worked before they existed and must keep working — a missing
   * table hides this section rather than taking the page down, exactly as
   * study groups do on Insights.
   */
  let sources: CalendarSourceView[] = [];
  let calendarsAvailable = true;

  try {
    sources = (await listCalendarSources(user.id)).map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      dayEffect: source.day_effect,
      thresholdMinutes: source.day_effect_threshold_minutes,
      reducedDailyMinutes: source.reduced_daily_minutes,
      eventCount: source.eventCount,
      importUrl: source.import_url,
    }));
  } catch (cause) {
    console.error("[import-export] calendars unavailable:", cause);
    calendarsAvailable = false;
  }

  // Hidden entirely without credentials (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI,
  // ENCRYPTION_KEY) — the same "degrade to hidden, never to a crash" rule as
  // every other optional feature in this app (see AGENTS.md "The AI layer").
  let googleStatus: GoogleConnectionStatus | null = null;
  if (isGoogleCalendarEnabled()) {
    try {
      googleStatus = await getGoogleConnectionStatus(user.id);
    } catch (cause) {
      console.error("[import-export] Google connection status unavailable:", cause);
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("pages.importExport.title")}
        description={t("pages.importExport.description")}
      />

      {calendarsAvailable ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("importExport.calendars.title")}</h2>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
              {t("importExport.calendars.description")}
            </p>
          </div>

          <CalendarSourceList sources={sources} />
        </section>
      ) : null}

      {googleStatus ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("importExport.google.title")}</h2>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
              {t("importExport.google.subtitle")}
            </p>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <GoogleCalendarPanel status={googleStatus} timeZone={timeZone} />
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("importExport.import.title")}</h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            {t("importExport.import.description")}
          </p>
        </div>

        <div className="bg-card rounded-xl border p-5">
          <IcsImportPanel timeZone={timeZone} sources={sources} />
        </div>
      </section>

      {isAiEnabled() ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("importExport.scheduleImage.title")}</h2>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
              {t("importExport.scheduleImage.description")}
            </p>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <ScheduleImagePanel timeZone={timeZone} sources={sources} />
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("importExport.export.title")}</h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            {t("importExport.export.description")}
          </p>
        </div>

        <div className="bg-card rounded-xl border p-5">
          {/* Four weeks: long enough to be a useful printout, short enough that
              the PDF stays a handful of pages. */}
          <ExportPanel defaultStart={today} defaultEnd={addDays(today, 27)} />
        </div>
      </section>
    </div>
  );
}
