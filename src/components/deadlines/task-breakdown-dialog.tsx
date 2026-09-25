"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { triggerClassName, type TriggerStyle } from "@/components/common/trigger-style";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { acceptTaskBreakdown, breakdownTaskAction } from "@/features/ai-advisor/actions";
import type { TaskBreakdown } from "@/lib/ai";

type State = "idle" | "loading" | "ready" | "error";

/**
 * "Break down with AI" — one task in, a handful of proposed subtasks out,
 * nothing written until the student ticks which ones to keep. Same
 * preview-then-confirm shape as the .ics import review: the model never
 * writes a row, `acceptTaskBreakdown` does, and only for what was ticked.
 */
export function TaskBreakdownDialog({
  taskId,
  trigger,
}: {
  taskId: string;
  trigger: TriggerStyle;
}) {
  const t = useTranslations("tasks");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [subtasks, setSubtasks] = useState<TaskBreakdown["subtasks"]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (!next) {
      // Fresh data next time it opens, rather than a stale proposal.
      setState("idle");
      setErrorCode(null);
      return;
    }

    if (state !== "idle") return;
    setState("loading");
    startTransition(async () => {
      const result = await breakdownTaskAction(taskId);
      if (result.ok) {
        setSubtasks(result.data.subtasks);
        setChecked(result.data.subtasks.map(() => true));
        setState("ready");
      } else {
        setErrorCode(result.error);
        setState("error");
      }
    });
  }

  function handleAccept() {
    const selected = subtasks.filter((_, index) => checked[index]);
    startTransition(async () => {
      const result = await acceptTaskBreakdown(taskId, selected);
      if (result.ok) handleOpenChange(false);
    });
  }

  const selectedCount = checked.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>

      <DialogTrigger aria-label={trigger.ariaLabel} className={triggerClassName(trigger)}>
        {trigger.icon}
        {trigger.label}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Sparkles className="text-primary size-4" aria-hidden="true" />
            {t("breakdown.title")}
          </DialogTitle>
          <DialogDescription>{t("breakdown.description")}</DialogDescription>
        </DialogHeader>

        {state === "loading" ? (
          <p className="text-muted-foreground text-sm">{t("breakdown.loading")}</p>
        ) : null}

        {state === "error" ? (
          <p role="alert" className="text-destructive text-sm">
            {errorCode === "aiUnavailable" ? t("breakdown.unavailable") : t("breakdown.failed")}
          </p>
        ) : null}

        {state === "ready" ? (
          <ul className="space-y-2">
            {subtasks.map((subtask, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <Checkbox
                  checked={checked[index]}
                  onCheckedChange={(value) =>
                    setChecked((current) =>
                      current.map((c, i) => (i === index ? Boolean(value) : c)),
                    )
                  }
                  aria-label={subtask.title}
                  className="mt-0.5"
                />
                <span className="flex-1 text-sm">{subtask.title}</span>
                <span className="text-numeric text-muted-foreground text-xs">
                  {t("breakdown.minutes", { minutes: subtask.estimatedMinutes })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          {state === "ready" ? (
            <Button type="button" disabled={isPending || selectedCount === 0} onClick={handleAccept}>
              {t("breakdown.accept", { count: selectedCount })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
