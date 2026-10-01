"use client";

import { Calendar, CalendarCheck, Link2Off, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ImportReviewList } from "./import-review-list";
import { ButtonAnchor } from "@/components/common/button-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  confirmGoogleImport,
  disconnectGoogleAction,
  previewGoogleSync,
} from "@/features/import-export/actions";
import type { ImportSelection } from "@/lib/validation/import-export";
import type { ImportOutcome, ImportPreview } from "@/server/import-service";
import type { GoogleConnectionStatus } from "@/server/google-connection-service";

/**
 * Google Calendar: connect, sync, disconnect.
 *
 * "Sync now" runs the exact same preview-then-confirm pipeline as an `.ics`
 * import (`ImportReviewList` is the same component, unmodified) — OAuth
 * consent is not treated as a second "yes" to writing every event straight
 * to the calendar. The student still sees and ticks what a sync would do.
 */

type Stage = { kind: "idle" } | { kind: "review"; preview: ImportPreview } | { kind: "done"; outcome: ImportOutcome };

const KNOWN_ERRORS = [
  "notConnected",
  "revoked",
  "notConfigured",
  "denied",
  "invalidState",
  "unexpected",
] as const;
type KnownError = (typeof KNOWN_ERRORS)[number];

function errorKey(code: string): KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? (code as KnownError) : "unexpected";
}

export function GoogleCalendarPanel({ status, timeZone }: { status: GoogleConnectionStatus; timeZone: string }) {
  const t = useTranslations("importExport.google");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // The OAuth callback can only communicate by redirecting with a query
  // string — there is no in-page JavaScript state to hand an error to. Read
  // it from the URL this component was first rendered with; the effect below
  // then strips it, so a reload doesn't keep re-showing it.
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("google") === "error" ? (searchParams.get("googleError") ?? "unexpected") : null,
  );
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get("google")) router.replace(pathname as Route);
    // Only ever run this for the query string this component was first
    // rendered with — router.replace changes it on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately run-once; see comment above.
  }, []);

  function sync() {
    setError(null);
    startTransition(async () => {
      const result = await previewGoogleSync();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStage({ kind: "review", preview: result.data });
    });
  }

  function confirm(events: ImportSelection[]) {
    startTransition(async () => {
      const result = await confirmGoogleImport({ events });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStage({ kind: "done", outcome: result.data });
    });
  }

  function disconnect() {
    startTransition(async () => {
      await disconnectGoogleAction();
      setConfirmingDisconnect(false);
      setStage({ kind: "idle" });
    });
  }

  const errorMessage = error ? (
    <p role="alert" className="text-destructive text-sm">
      {t(`errors.${errorKey(error)}`)}
    </p>
  ) : null;

  if (stage.kind === "review") {
    return (
      <div className="space-y-4">
        {errorMessage}
        {stage.preview.rows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{t("nothingNew")}</p>
            <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
              {t("close")}
            </Button>
          </div>
        ) : (
          <ImportReviewList
            preview={stage.preview}
            timeZone={timeZone}
            isPending={isPending}
            onConfirm={confirm}
            onCancel={() => setStage({ kind: "idle" })}
          />
        )}
      </div>
    );
  }

  if (stage.kind === "done") {
    return (
      <div className="border-success/40 bg-success/5 animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border p-4 duration-300">
        <CalendarCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium">{t("doneTitle")}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("doneBody", { inserted: stage.outcome.inserted, updated: stage.outcome.updated })}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStage({ kind: "idle" })}>
            {t("close")}
          </Button>
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="space-y-3">
        {errorMessage}
        <p className="text-muted-foreground text-sm">{t("description")}</p>
        <ButtonAnchor href="/api/calendar/google/connect">
          <Calendar className="size-4" aria-hidden="true" />
          {t("connect")}
        </ButtonAnchor>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{status.externalAccountId}</p>
          <p className="text-muted-foreground text-xs">
            {status.lastSyncedAt
              ? t("lastSynced", { date: new Date(status.lastSyncedAt).toLocaleString() })
              : t("neverSynced")}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={sync} disabled={isPending}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {isPending ? t("syncing") : t("sync")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmingDisconnect(true)}
            disabled={isPending}
          >
            <Link2Off className="size-3.5" aria-hidden="true" />
            {t("disconnect")}
          </Button>
        </div>
      </div>

      <Dialog open={confirmingDisconnect} onOpenChange={setConfirmingDisconnect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("disconnectConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("disconnectConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingDisconnect(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={isPending}>
              {isPending ? t("disconnecting") : t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
