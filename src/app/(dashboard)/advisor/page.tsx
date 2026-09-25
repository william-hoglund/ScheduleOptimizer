import { Bot } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { AdvisorPanel } from "@/features/ai-advisor/advisor-panel";
import { isAiEnabled } from "@/lib/ai";
import { requireUserContext } from "@/server/auth";

export const generateMetadata = () => createPageMetadata("advisor");

export default async function AdvisorPage() {
  await requireUserContext();
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pages.advisor.title")}
        description={t("pages.advisor.description")}
      />

      {isAiEnabled() ? (
        <AdvisorPanel />
      ) : (
        <EmptyState
          icon={Bot}
          title={t("pages.advisor.emptyTitle")}
          description={t("pages.advisor.emptyBody")}
        />
      )}
    </div>
  );
}
