import type { DocumentStatus } from "@/generated/prisma/enums";
import { DOCUMENT_STATUS_LABELS } from "@/lib/labels";

const DOT_CLASS: Record<DocumentStatus, string> = {
  DRAFT: "bg-slate-dim",
  SENT: "bg-alert",
  PARTIALLY_SIGNED: "bg-alert",
  FULLY_EXECUTED: "bg-live",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 label-strip text-slate">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} />
      {DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}
