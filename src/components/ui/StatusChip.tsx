import { Ban, CircleCheck, FilePen, Hourglass, PenLine, Send, type LucideIcon } from "lucide-react";
import type { AgreementView } from "@/lib/queue";

// The agreement's state as a chip: an icon and the state's own word, in the
// state's colour. Colour is never the only carrier of the state.
const CHIPS: Record<AgreementView, { label: string; icon: LucideIcon; className: string }> = {
  drafts: {
    label: "Draft",
    icon: FilePen,
    className: "border-state-draft/30 bg-state-draft/10 text-state-draft",
  },
  "waiting-counterparty": {
    label: "Awaiting counterparty",
    icon: Send,
    className: "border-state-waiting/35 bg-state-waiting/10 text-state-waiting",
  },
  "needs-countersign": {
    label: "Awaiting countersignature",
    icon: PenLine,
    className: "border-state-action/35 bg-state-action/10 text-state-action",
  },
  "waiting-countersign": {
    label: "Awaiting countersignature",
    icon: Hourglass,
    className: "border-state-waiting/35 bg-state-waiting/10 text-state-waiting",
  },
  executed: {
    label: "Executed",
    icon: CircleCheck,
    className: "border-state-done/35 bg-state-done/10 text-state-done",
  },
  voided: {
    label: "Voided",
    icon: Ban,
    className: "border-state-void/35 bg-state-void/10 text-state-void",
  },
};

export function chipLabel(view: AgreementView): string {
  return CHIPS[view].label;
}

export function StatusChip({ view, className = "" }: { view: AgreementView; className?: string }) {
  const { label, icon: Icon, className: tone } = CHIPS[view];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap ${tone} ${className}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
