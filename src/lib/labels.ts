import type {
  Role,
  TemplateType,
  DocumentStatus,
  StatusEventType,
} from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  GENERAL_COUNSEL: "General Counsel",
  CONTRACTS_MANAGER: "Contracts Manager",
  BUSINESS_AFFAIRS: "Business Affairs",
  PARALEGAL: "Paralegal",
};

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  NDA: "Mutual NDA",
  VENDOR_AGREEMENT: "Vendor Agreement",
  MEDIA_RELEASE: "Media Release",
  LICENSING_ORDER: "Licensing Order",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_SIGNED: "Partially Signed",
  FULLY_EXECUTED: "Fully Executed",
  VOIDED: "Voided",
};

export const STATUS_EVENT_LABELS: Record<StatusEventType, string> = {
  CREATED: "Document created",
  SENT: "Sent for signature",
  VIEWED: "Document viewed",
  SIGNED: "Signature captured",
  FULLY_EXECUTED: "Fully executed",
  LINK_REISSUED: "Signing link reissued",
  VOIDED: "Agreement voided",
};
