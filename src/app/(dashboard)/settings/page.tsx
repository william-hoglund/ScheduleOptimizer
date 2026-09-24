import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { PrivacyPanel } from "@/components/settings/privacy-panel";
import { ProfileForm } from "@/components/settings/profile-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defaultTimeZone, isLocale } from "@/i18n/config";
import { isSegment } from "@/lib/segments";
import { requireUser } from "@/server/auth";
import { getStudyPreferences, toPreferencesInput } from "@/server/preference-service";
import { getProfile } from "@/server/profile-service";

export const generateMetadata = () => createPageMetadata("settings");

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations();

  const [profile, preferences] = await Promise.all([
    getProfile(user.id),
    getStudyPreferences(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("pages.settings.title")} description={t("pages.settings.description")} />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t("settings.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("settings.tabs.preferences")}</TabsTrigger>
          <TabsTrigger value="privacy">{t("settings.tabs.privacy")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-6">
          <ProfileForm
            email={profile?.email ?? user.email ?? ""}
            defaults={{
              fullName: profile?.full_name ?? "",
              timezone: profile?.timezone || defaultTimeZone,
              locale: isLocale(profile?.locale) ? profile.locale : "en",
              segment: isSegment(profile?.segment) ? profile.segment : "student",
            }}
          />
        </TabsContent>

        <TabsContent value="preferences" className="pt-6">
          <PreferencesForm defaults={toPreferencesInput(preferences)} />
        </TabsContent>

        <TabsContent value="privacy" className="pt-6">
          <PrivacyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
