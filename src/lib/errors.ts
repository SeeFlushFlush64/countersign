// The one error type the lifecycle and delivery functions throw on purpose:
// a refusal the caller can show as-is. Anything else is a bug or an outage.

export type FlowErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID" | "LINK_INVALID";

export class DocumentFlowError extends Error {
  constructor(
    message: string,
    readonly code: FlowErrorCode = "CONFLICT",
  ) {
    super(message);
    this.name = "DocumentFlowError";
  }
}
