// Demo mode (DEMO_MODE=1, for the public demo deployment): the shared demo
// starts fresh — a new epoch, reseeded — once it has been used and then left
// idle, and every new epoch carries limits so one visitor cannot fill it.
// Off by default (local development, tests, any non-demo deployment).

export type DemoSettings = {
  enabled: boolean;
  // A used epoch is replaced once nothing has changed in it for this long.
  idleMs: number;
  // Per epoch, seeded agreements included.
  agreementLimit: number;
  linkLimit: number;
  // How long a reset may hold its claim before another may take over.
  leaseMs: number;
  // After a reset fails, the current demo is used as it is for this long
  // before the next attempt.
  failureCooldownMs: number;
};

const MINUTE = 60 * 1000;

export const DEMO_DEFAULTS: Omit<DemoSettings, "enabled"> = {
  idleMs: 30 * MINUTE,
  agreementLimit: 30,
  linkLimit: 60,
  leaseMs: 5 * MINUTE,
  failureCooldownMs: 5 * MINUTE,
};

export function demoSettings(env: Record<string, string | undefined> = process.env): DemoSettings {
  return { enabled: env.DEMO_MODE === "1", ...DEMO_DEFAULTS };
}
