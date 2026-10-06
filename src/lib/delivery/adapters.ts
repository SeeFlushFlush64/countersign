import { DeliveryChannel } from "@/generated/prisma/enums";

// How a message leaves Countersign. The outbox (outbox.ts) owns everything
// stateful — claiming, attempts, retries, recording the outcome — so an
// adapter only has to hand one message to its channel, or throw.
//
// Only one adapter exists: the demo outbox, which sends nothing. A real
// email provider would be a second adapter behind this same interface,
// selected by DELIVERY_MODE; none is implemented, so none can be enabled.

export type OutgoingMessage = {
  id: string;
  to: { name: string; email: string };
  subject: string;
  body: string;
  // The counterparty's signing link (a path under /s/), decrypted just for
  // this delivery. Never logged.
  signingPath: string | null;
  // A path into the company app, e.g. the countersign page.
  appPath: string | null;
};

export interface DeliveryAdapter {
  readonly channel: DeliveryChannel;
  deliver(message: OutgoingMessage): Promise<void>;
}

// Demo mode: "delivery" means the message is final and visible in the
// in-app outbox (/outbox). No network call is made and no email is sent.
export const demoOutboxAdapter: DeliveryAdapter = {
  channel: DeliveryChannel.DEMO_OUTBOX,
  async deliver() {},
};

export class DeliveryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryConfigError";
  }
}

export const DELIVERY_MODES = ["demo-outbox"] as const;

// DELIVERY_MODE selects the adapter. Outside production it defaults to the
// demo outbox; production must choose explicitly, so a deployment can never
// silently "deliver" into a demo outbox without saying so. Any other value —
// including the name of an email provider — is refused: no production email
// integration exists. Provider credentials in the environment are never read
// and enable nothing.
export function deliveryAdapter(env: NodeJS.ProcessEnv = process.env): DeliveryAdapter {
  const mode = env.DELIVERY_MODE || (env.NODE_ENV === "production" ? undefined : "demo-outbox");
  if (!mode) {
    throw new DeliveryConfigError(
      "Delivery is not configured: set DELIVERY_MODE=demo-outbox (no email integration exists).",
    );
  }
  if (mode === "demo-outbox") return demoOutboxAdapter;
  throw new DeliveryConfigError(
    `Unsupported DELIVERY_MODE: only ${DELIVERY_MODES.join(", ")} is available (no email integration exists).`,
  );
}
