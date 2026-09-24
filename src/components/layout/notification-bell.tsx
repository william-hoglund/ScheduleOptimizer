"use client";

import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";

import { markAllNotificationsRead } from "@/features/notifications/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  isRead: boolean;
};

export function NotificationBell({
  notifications,
  unreadCount,
  nowIso,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  /**
   * Decided on the server. Without it next-intl falls back to the browser
   * clock, which differs from the server's during hydration — so "2 minutes
   * ago" renders twice with different values and React complains.
   */
  nowIso: string;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("open")} className="relative">
            <Bell className="size-[1.125rem]" aria-hidden="true" />
            {unreadCount > 0 ? (
              <>
                <span
                  className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"
                  aria-hidden="true"
                />
                {/* The count is announced but not drawn — a number that small
                    would be unreadable, and the dot carries the meaning. */}
                <span className="sr-only">{t("unread", { count: unreadCount })}</span>
              </>
            ) : null}
          </Button>
        }
      />

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm font-medium">{t("empty")}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={cn("px-3 py-2", !notification.isRead && "bg-accent/40")}
              >
                <p className="text-sm font-medium">{notification.title}</p>
                {notification.body ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">{notification.body}</p>
                ) : null}
                <time
                  className="text-muted-foreground text-numeric mt-1 block text-[0.6875rem]"
                  dateTime={notification.createdAt}
                >
                  {format.relativeTime(new Date(notification.createdAt), new Date(nowIso))}
                </time>
              </li>
            ))}
          </ul>
        )}

        {unreadCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <div className="p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={() => startTransition(() => void markAllNotificationsRead())}
              >
                {t("markAllRead")}
              </Button>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
