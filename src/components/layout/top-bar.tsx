import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { PreferencesMenu } from "./preferences-menu";
import { UserMenu } from "./user-menu";
import { nowIso } from "@/server/clock";
import { countUnread, listNotifications } from "@/server/notification-service";

/**
 * Global search is still deliberately absent — it needs a real search index,
 * which arrives with Insights in Session 9. A control that looks live but does
 * nothing is worse than no control.
 */
export async function TopBar({
  userId,
  email,
  fullName,
}: {
  userId: string;
  email: string;
  fullName: string | null;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const now = new Date(nowIso());

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(userId, { limit: 10 }),
    countUnread(userId),
  ]);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur lg:px-6">
      <Link href="/dashboard" className="rounded-md lg:hidden">
        <Logo name={t("app.name")} />
      </Link>

      <div className="hidden lg:block">
        <time dateTime={now.toISOString()} className="text-muted-foreground text-sm">
          {format.dateTime(now, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </time>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell
          nowIso={now.toISOString()}
          unreadCount={unreadCount}
          notifications={notifications.map((notification) => ({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            createdAt: notification.created_at,
            isRead: notification.read_at !== null,
          }))}
        />
        <PreferencesMenu />
        <UserMenu email={email} fullName={fullName} />
      </div>
    </header>
  );
}
