import { deliveryAdapter } from "@/lib/delivery/adapters";
import { outboxKey } from "@/lib/delivery/link-crypto";
import { auditIpKey } from "@/lib/request-context";
import { ensureFreshDemo } from "@/lib/demo/epochs";
import { DEMO_DEFAULTS } from "@/lib/demo/settings";

// `npm run demo:reset` (prisma/demo-reset.ts): a forced reset of the public
// demo. It seeds agreements whose outbox messages and signing links must work
// in the deployed app, so the configuration that shapes them is checked first,
// with production's rules whatever NODE_ENV is (outside production the app
// would silently fall back to a public development outbox key or the demo
// outbox). A mistake is reported before any epoch is claimed, so it cannot
// leave a partial or broken epoch behind.

export class DemoResetConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The demo reset is not configured:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "DemoResetConfigError";
  }
}

// What is wrong, by variable name; never a value.
export function demoResetConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const asProduction = { ...env, NODE_ENV: "production" } as NodeJS.ProcessEnv;
  const checks: [string, () => unknown][] = [
    ["DELIVERY_MODE", () => deliveryAdapter(asProduction)],
    ["OUTBOX_ENCRYPTION_KEY", () => outboxKey(asProduction)],
    ["AUDIT_IP_HMAC_KEY", () => auditIpKey(asProduction)],
  ];
  const problems: string[] = [];
  for (const [name, check] of checks) {
    try {
      check();
    } catch (error) {
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

export async function resetDemoNow() {
  const problems = demoResetConfigProblems();
  if (problems.length > 0) throw new DemoResetConfigError(problems);
  return ensureFreshDemo({ force: true, settings: { enabled: true, ...DEMO_DEFAULTS } });
}
