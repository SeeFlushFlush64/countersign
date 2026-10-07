import { DocumentFlowError } from "@/lib/errors";
import { EXAMPLE_DOMAIN_MESSAGE } from "@/lib/demo/example-domains";
import { DEMO_DEFAULTS } from "@/lib/demo/settings";

// The demo_epochs triggers reject a write with a stable "countersign:demo_…"
// token. This turns one into the message a person sees; anything else is not
// a demo guard and is left to the caller.

const idleMinutes = Math.round(DEMO_DEFAULTS.idleMs / 60_000);

export const DEMO_EPOCH_CLOSED_MESSAGE =
  "This agreement belongs to an earlier session of the demo, which has since been reset.";

const MESSAGES = {
  demo_epoch_closed: [DEMO_EPOCH_CLOSED_MESSAGE, "NOT_FOUND"],
  demo_epoch_immutable: [DEMO_EPOCH_CLOSED_MESSAGE, "CONFLICT"],
  demo_agreement_limit: [
    `The demo has reached its limit of new agreements. It starts fresh once it has been idle for ${idleMinutes} minutes.`,
    "CONFLICT",
  ],
  demo_link_limit: [
    `The demo has reached its limit of signing links. It starts fresh once it has been idle for ${idleMinutes} minutes.`,
    "CONFLICT",
  ],
  demo_example_domain: [EXAMPLE_DOMAIN_MESSAGE, "INVALID"],
} as const;

export function demoGuardError(error: unknown): DocumentFlowError | null {
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
  const token = text.match(/countersign:(demo_[a-z_]+)/)?.[1];
  if (!token || !(token in MESSAGES)) return null;
  const [message, code] = MESSAGES[token as keyof typeof MESSAGES];
  return new DocumentFlowError(message, code);
}
