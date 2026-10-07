import type {
  DocumentStatus,
  StatusEventType,
  TemplateType,
} from "@/generated/prisma/enums";
import { FileText, Handshake, Image, ScrollText, LucideIcon } from "lucide-react";

export const DOCUMENT_STATUS_STYLES: Record<
  DocumentStatus,
  { bg: string; text: string; dot: string }
> = {
  DRAFT: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400" },
  SENT: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  PARTIALLY_SIGNED: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
  FULLY_EXECUTED: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
};

// Single source of truth for StatusEvent dot colors — consumed by
// Timeline, the /activity feed, and the landing page's activity panel,
// which previously each defined their own copy of this mapping.
export const STATUS_EVENT_DOT: Record<StatusEventType, string> = {
  CREATED: "bg-slate",
  SENT: "bg-alert",
  VIEWED: "bg-slate-dim",
  SIGNED: "bg-signal",
  FULLY_EXECUTED: "bg-live",
};

export const TEMPLATE_TYPE_ICONS: Record<TemplateType, LucideIcon> = {
  NDA: FileText,
  VENDOR_AGREEMENT: Handshake,
  MEDIA_RELEASE: Image,
  LICENSING_ORDER: ScrollText,
};