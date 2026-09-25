"use client";

import { AlertTriangle } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteAccountAction } from "@/features/settings/actions";

/**
 * The one confirmation in this app that asks for more than a click.
 *
 * Every other destructive action here (a course, a task) shows a dialog that
 * names what will be lost and asks for one more click — appropriate for
 * something a student can recreate. A whole account cannot be recreated, so
 * this asks the student to type their own email address before the button
 * even activates. That is friction on purpose: it is the one place in the
 * product where a misclick should be structurally impossible, not just
 * discouraged.
 */
export function DeleteAccountDialog({ email }: { email: string }) {
  const t = useTranslations("settings.privacy");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setErrorCode(null);
    }
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccountAction();
      // A successful call redirects and never returns here — reaching this
      // line at all means it didn't.
      if (!result.ok) setErrorCode(result.error);
    });
  }

  const canDelete = confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="border-destructive text-destructive hover:bg-destructive/10 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
      >
        <AlertTriangle className="size-4" aria-hidden="true" />
        {t("deleteButton")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">{t("deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="delete-account-confirm" className="text-sm font-medium">
            {t("deleteConfirmLabel", { email })}
          </label>
          <Input
            id="delete-account-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        {errorCode ? (
          <p role="alert" className="text-destructive text-sm">
            {errorCode === "notAvailable" ? t("deleteUnavailable") : t("deleteFailed")}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canDelete || isPending}
            onClick={handleDelete}
          >
            {isPending ? t("deleting") : t("deleteButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
