import { DOCUMENT_STATUS_LABELS } from "@/lib/labels";
import { DOCUMENT_STATUS_STYLES } from "@/lib/status-styles";
import type { DocumentStatus } from "@/generated/prisma/enums";

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const style = DOCUMENT_STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}