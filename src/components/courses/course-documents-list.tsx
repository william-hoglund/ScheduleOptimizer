"use client";

import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { removeCourseDocument } from "@/features/course-knowledge/actions";
import type { CourseDocumentRow, DocumentProcessingStatus } from "@/lib/supabase/types";

const STATUS_ICON: Record<DocumentProcessingStatus, typeof Clock> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
};

const STATUS_TONE: Record<DocumentProcessingStatus, string> = {
  pending: "text-muted-foreground",
  processing: "text-muted-foreground animate-spin",
  completed: "text-success",
  failed: "text-destructive",
};

function DocumentRow({ document }: { document: CourseDocumentRow }) {
  const t = useTranslations("courseKnowledge.documents");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const StatusIcon = STATUS_ICON[document.processing_status];

  return (
    <li className="flex items-center gap-3 rounded-lg border p-3">
      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.file_name}</p>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <StatusIcon className={`size-3 shrink-0 ${STATUS_TONE[document.processing_status]}`} aria-hidden="true" />
          {t(`status.${document.processing_status}`)}
        </p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await removeCourseDocument(document.id);
                setConfirming(false);
              })
            }
          >
            {t("delete")}
          </Button>
          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirming(false)}>
            ×
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete")}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="text-destructive size-3.5" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

export function CourseDocumentsList({ documents }: { documents: CourseDocumentRow[] }) {
  const t = useTranslations("courseKnowledge.documents");

  if (documents.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {documents.map((document) => (
        <DocumentRow key={document.id} document={document} />
      ))}
    </ul>
  );
}
