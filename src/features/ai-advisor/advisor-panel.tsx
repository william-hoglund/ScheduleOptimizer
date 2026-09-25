"use client";

import { Check, Send, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResolvedCommand } from "@/lib/ai/resolve-command";
import { applyAdvisorAction, askAdvisorAction, type AdvisorAnswer } from "./actions";

type Exchange = {
  question: string;
  answer: AdvisorAnswer;
  /** "idle" while a proposed action still awaits a decision from this exchange. */
  actionStatus: "idle" | "applying" | "applied" | "dismissed" | "failed";
};

/**
 * A confirmation card for a proposed change, not a chat bubble with a button
 * bolted on — the distinction matters because nothing here has happened yet.
 * `resolvedAction` already survived re-validation against the student's real
 * data (see resolvePlannerCommand); `rawAction` is only echoed back so the
 * server can re-validate a second time, at the moment it actually runs.
 */
function ProposedActionCard({
  resolvedAction,
  status,
  onDecide,
}: {
  resolvedAction: ResolvedCommand;
  status: Exchange["actionStatus"];
  onDecide: (decision: "apply" | "dismiss") => void;
}) {
  const t = useTranslations("ai");

  if (resolvedAction.kind === "none") return null;

  if (status === "applied") {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-3.5" aria-hidden="true" />
        {t("advisor.applied")}
      </p>
    );
  }
  if (status === "dismissed") return null;
  if (status === "failed") {
    return <p className="text-destructive text-sm">{t("advisor.applyFailed")}</p>;
  }

  return (
    <div className="bg-muted flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <Sparkles className="text-primary size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-medium">{resolvedAction.label}</p>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={status === "applying"}
          onClick={() => onDecide("dismiss")}
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("advisor.dismiss")}
        </Button>
        <Button type="button" size="sm" disabled={status === "applying"} onClick={() => onDecide("apply")}>
          <Check className="size-3.5" aria-hidden="true" />
          {status === "applying" ? t("advisor.applying") : t("advisor.apply")}
        </Button>
      </div>
    </div>
  );
}

export function AdvisorPanel() {
  const t = useTranslations("ai");
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAsk() {
    const question = message.trim();
    if (!question || isPending) return;

    setErrorCode(null);
    startTransition(async () => {
      const result = await askAdvisorAction(question);
      if (!result.ok) {
        setErrorCode(result.error);
        return;
      }
      setMessage("");
      setExchanges((current) => [
        ...current,
        { question, answer: result.data, actionStatus: "idle" },
      ]);
    });
  }

  function decideAction(index: number, decision: "apply" | "dismiss") {
    if (decision === "dismiss") {
      setExchanges((current) =>
        current.map((exchange, i) =>
          i === index ? { ...exchange, actionStatus: "dismissed" } : exchange,
        ),
      );
      return;
    }

    setExchanges((current) =>
      current.map((exchange, i) => (i === index ? { ...exchange, actionStatus: "applying" } : exchange)),
    );
    const exchange = exchanges[index];
    if (!exchange) return;

    startTransition(async () => {
      const result = await applyAdvisorAction(exchange.answer.rawAction);
      setExchanges((current) =>
        current.map((e, i) =>
          i === index ? { ...e, actionStatus: result.ok ? "applied" : "failed" } : e,
        ),
      );
    });
  }

  return (
    <div className="space-y-4">
      {exchanges.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("advisor.intro")}</p>
      ) : null}

      <ul className="space-y-4">
        {exchanges.map((exchange, index) => (
          <li key={index} className="space-y-2">
            <p className="text-sm font-medium">{exchange.question}</p>
            <p className="text-muted-foreground text-sm">{exchange.answer.message}</p>
            {exchange.answer.proposedAction && exchange.answer.proposedAction.kind !== "none" ? (
              <ProposedActionCard
                resolvedAction={exchange.answer.proposedAction}
                status={exchange.actionStatus}
                onDecide={(decision) => decideAction(index, decision)}
              />
            ) : null}
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("advisor.placeholder")}
          rows={2}
          maxLength={600}
          disabled={isPending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleAsk();
            }
          }}
        />
        {errorCode ? (
          <p role="alert" className="text-destructive text-sm">
            {errorCode === "aiUnavailable" ? t("advisor.unavailable") : t("advisor.failed")}
          </p>
        ) : null}
        <Button type="button" disabled={isPending || message.trim().length === 0} onClick={handleAsk}>
          <Send className="size-3.5" aria-hidden="true" />
          {isPending ? t("advisor.asking") : t("advisor.ask")}
        </Button>
      </div>
    </div>
  );
}
