import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export type PageKey =
  | "dashboard"
  | "calendar"
  | "planner"
  | "courses"
  | "deadlines"
  | "todos"
  | "insights"
  | "importExport"
  | "settings";

export async function createPageMetadata(pageKey: PageKey): Promise<Metadata> {
  const t = await getTranslations("pages");
  return {
    title: t(`${pageKey}.title`),
    description: t(`${pageKey}.description`),
  };
}

/**
 * The shape every dashboard route takes before its feature is built: a real
 * header and an honest empty state explaining what will appear here.
 *
 * Each session replaces one of these with the real screen.
 */
export async function PlaceholderPage({ pageKey, icon }: { pageKey: PageKey; icon: LucideIcon }) {
  const t = await getTranslations("pages");

  return (
    <div className="space-y-6">
      <PageHeader title={t(`${pageKey}.title`)} description={t(`${pageKey}.description`)} />
      <EmptyState
        icon={icon}
        title={t(`${pageKey}.emptyTitle`)}
        description={t(`${pageKey}.emptyBody`)}
      />
    </div>
  );
}
