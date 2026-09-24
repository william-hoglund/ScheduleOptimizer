"use client";

import { Plus, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { createStudyGroup, joinStudyGroup } from "@/features/groups/actions";
import { useValidationText } from "@/features/shared/use-validation-text";

/**
 * Creating or joining a group.
 *
 * There is no directory and no search: the only way into a group is a code
 * someone shared with you. That is what makes these private by construction
 * rather than by setting.
 */
export function GroupSetup({ hasGroups }: { hasGroups: boolean }) {
  const t = useTranslations("groups");
  const message = useValidationText();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(20);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createStudyGroup({ name, weeklySessionGoal: goal });
      if (result.ok) {
        setMode("none");
        setName("");
      } else {
        setError(result.error);
      }
    });
  }

  function submitJoin() {
    setError(null);
    setNotFound(false);
    startTransition(async () => {
      const result = await joinStudyGroup({ joinCode: code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data.found) {
        setNotFound(true);
        return;
      }
      setMode("none");
      setCode("");
    });
  }

  const buttons = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setMode("create")} disabled={isPending}>
        <Plus className="size-4" aria-hidden="true" />
        {t("create")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setMode("join")} disabled={isPending}>
        <UserPlus className="size-4" aria-hidden="true" />
        {t("join")}
      </Button>
    </div>
  );

  if (mode === "none") {
    return hasGroups ? (
      buttons
    ) : (
      <EmptyState icon={Users} title={t("empty")} description={t("emptyBody")} action={buttons} />
    );
  }

  return (
    <section className="bg-card space-y-4 rounded-xl border p-5">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {message(error)}
        </p>
      ) : null}

      {mode === "create" ? (
        <>
          <FormField
            label={t("nameLabel")}
            placeholder={t("namePlaceholder")}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FormField
            label={t("goalLabel")}
            type="number"
            min={1}
            max={500}
            value={goal}
            onChange={(event) => setGoal(Number(event.target.value))}
          />
          <div className="flex gap-2">
            <Button onClick={submitCreate} disabled={isPending || name.trim().length === 0}>
              {isPending ? t("creating") : t("create")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={isPending}>
              {t("resume")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <FormField
            label={t("codeLabel")}
            placeholder={t("codePlaceholder")}
            autoFocus
            // Codes are stored upper case; showing them that way avoids a
            // "wrong code" that was only a case difference.
            className="uppercase"
            value={code}
            error={notFound ? t("codeNotFound") : undefined}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setNotFound(false);
            }}
          />
          <div className="flex gap-2">
            <Button onClick={submitJoin} disabled={isPending || code.trim().length < 6}>
              {isPending ? t("joining") : t("join")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={isPending}>
              {t("resume")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
