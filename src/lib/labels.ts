import type {
  ArtifactKind,
  ArtifactStatus,
  DeliveryStatus,
  MessageKind,
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

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  SIGNING_REQUEST: "Signature request",
  SIGNING_LINK_REISSUED: "New signing link",
  COUNTERSIGN_REQUEST: "Countersignature request",
  AGREEMENT_EXECUTED: "Executed notice",
  AGREEMENT_VOIDED: "Voided notice",
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Queued",
  SENDING: "Sending",
  DELIVERED: "In demo outbox",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  PREVIEW: "Draft preview",
  FROZEN: "Frozen copy (as sent)",
  EXECUTED: "Executed PDF",
};

export const ARTIFACT_STATUS_LABELS: Record<ArtifactStatus, string> = {
  PENDING: "Generating",
  READY: "Ready",
  FAILED: "Failed",
};
