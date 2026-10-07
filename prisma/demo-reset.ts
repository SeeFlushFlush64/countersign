import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { describeDatabaseTarget } from "../src/lib/database-target";
import { closeRenderer } from "../src/lib/pdf/render";
import { resetDemoNow } from "../src/lib/demo/reset-now";

// `npm run demo:reset`: start the public demo fresh now — a new demo epoch,
// seeded and made current, the previous epoch retired (nothing is deleted).
// Used once after deploying, instead of `npm run seed`; afterwards the app
// resets itself lazily (src/lib/demo/epochs.ts).
//
//   DEMO_RESET_ALLOW_REMOTE=1  required for anything other than localhost
//   DELIVERY_MODE, OUTBOX_ENCRYPTION_KEY, AUDIT_IP_HMAC_KEY
//                              required, valid by production's rules, and the
//                              same as the deployed app's; checked before
//                              anything is written (src/lib/demo/reset-now.ts)

async function main() {
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  if (target === "invalid") throw new Error("DATABASE_URL is missing or malformed.");
  if (target === "remote" && process.env.DEMO_RESET_ALLOW_REMOTE !== "1") {
    throw new Error("Refusing to reset a remote database. Set DEMO_RESET_ALLOW_REMOTE=1 to do it deliberately.");
  }
  console.log(`Resetting the demo in the ${target} database…`);
  const result = await resetDemoNow();
  console.log(
    result.outcome === "reset"
      ? `Demo epoch ${result.epochId} is now current.`
      : `No reset (${result.outcome}).`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRenderer();
    await prisma.$disconnect();
  });
