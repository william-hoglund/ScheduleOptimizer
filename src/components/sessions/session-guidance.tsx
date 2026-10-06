"use client";

import { Flag, Hammer, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";

import { guidanceKind, sessionPhase } from "@/lib/sessions/session-phase";
import { cn } from "@/lib/utils";

const PHASE_ICON = { intro: Rocket, work: Hammer, finish: Flag } as const;

/** What this sitting is for: a phase tag and one line of concrete guidance. */
export function SessionGuidance({
  generationReason,
  taskType,
  className,
}: {
  generationReason: string | null;
  taskType: string | null | undefined;
  className?: string;
}) {
  const t = useTranslations("sessions.guidance");
  const phase = sessionPhase(generationReason);
  if (!phase) return null;

  const kind = guidanceKind(taskType);
  const Icon = PHASE_ICON[phase];

  return (
    <div className={cn("mt-1.5 space-y-0.5", className)}>
      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium">
        <Icon className="size-3" aria-hidden="true" />
        {t(`${kind}.${phase}.label`)}
      </span>
      <p className="text-muted-foreground text-xs leading-relaxed">{t(`${kind}.${phase}.todo`)}</p>
    </div>
  );
}
