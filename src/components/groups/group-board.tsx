"use client";

import { Check, Copy, LogOut, PauseCircle, PlayCircle, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { leaveStudyGroup, setGroupPaused } from "@/features/groups/actions";
import type { GroupBoard as Board } from "@/server/study-group-service";
import { cn } from "@/lib/utils";

/**
 * A group's weekly board.
 *
 * The collective goal sits above the ranking deliberately: the first thing on
 * screen is what the group is doing together, not who is winning. See
 * docs/PLAN.md §5b.
 */
export function GroupBoard({ board }: { board: Board }) {
  const t = useTranslations("groups");
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const you = board.entries.find((entry) => entry.isYou);
  const goalPercent = Math.min(
    100,
    Math.round((board.goalCompleted / Math.max(1, board.goalTotal)) * 100),
  );

  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-start gap-3 border-b px-5 py-4">
        <span className="bg-muted text-muted-foreground rounded-md p-2">
          <Users className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{board.group.name}</h3>
          <p className="text-muted-foreground text-xs">
            {t("members", { count: board.group.memberCount })}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(board.group.joinCode);
              setCopied(true);
            }}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            <span className="text-numeric">{board.group.joinCode}</span>
          </Button>
        </div>
      </div>

      {/* Collective progress first. */}
      <div className="border-b px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-caps">{t("goalLabelShort")}</span>
          <span className="text-numeric text-xs font-medium">
            {t("goalValue", { completed: board.goalCompleted, total: board.goalTotal })}
          </span>
        </div>
        <div
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={goalPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("goalLabelShort")}
        >
          <div className="bg-primary h-full rounded-full" style={{ width: `${goalPercent}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="label-caps">{t("rankHeader")}</span>
      </div>

      {board.entries.every((entry) => entry.sessionsCompleted === 0) ? (
        <p className="text-muted-foreground px-5 pb-4 text-sm">{t("noScores")}</p>
      ) : (
        <ol className="pb-1">
          {board.entries.map((entry, index) => {
            const label = entry.isYou ? t("you") : entry.displayName;

            return (
              <li
                key={entry.userId}
                className={cn(
                  "flex items-center gap-3 px-5 py-2",
                  entry.isYou && "bg-accent/60",
                  entry.isPaused && "opacity-50",
                )}
              >
                <span className="text-numeric text-muted-foreground w-3 text-xs">
                  {entry.isPaused ? "–" : index + 1}
                </span>

                <span
                  className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-medium"
                  aria-hidden="true"
                >
                  {label.charAt(0)}
                </span>

                <span
                  className={cn("min-w-0 flex-1 truncate text-sm", entry.isYou && "font-medium")}
                >
                  {label}
                  {entry.isPaused ? (
                    <span className="text-muted-foreground ml-2 text-xs">({t("paused")})</span>
                  ) : null}
                </span>

                <span className="hidden w-16 sm:block">
                  <span className="bg-muted block h-1 overflow-hidden rounded-full">
                    <span
                      className="bg-success block h-full rounded-full"
                      style={{ width: `${entry.adherencePercent}%` }}
                    />
                  </span>
                </span>

                <span className="text-numeric w-9 text-right text-sm font-medium">
                  {entry.adherencePercent}%
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-muted-foreground border-t px-5 py-3 text-xs leading-relaxed">
        {t("fairnessNote")}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => void setGroupPaused(board.group.id, !(you?.isPaused ?? false)))
          }
        >
          {you?.isPaused ? (
            <PlayCircle className="size-3.5" aria-hidden="true" />
          ) : (
            <PauseCircle className="size-3.5" aria-hidden="true" />
          )}
          {you?.isPaused ? t("resume") : t("pause")}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirmingLeave(true)}
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {t("leave")}
        </Button>

        <p className="text-muted-foreground w-full text-xs">{t("pauseHint")}</p>
      </div>

      <Dialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("leaveConfirm")}</DialogTitle>
            <DialogDescription>{t("leaveBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>
              {t("resume")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await leaveStudyGroup(board.group.id);
                  setConfirmingLeave(false);
                })
              }
            >
              {t("leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
