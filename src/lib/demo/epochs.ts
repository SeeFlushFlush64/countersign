import { prisma } from "@/lib/prisma";
import { DemoEpochStatus } from "@/generated/prisma/enums";
import { demoSettings, type DemoSettings } from "@/lib/demo/settings";
import { currentEpoch, isResetDue, resetRecentlyFailed } from "@/lib/demo/state";
import { seed } from "../../../prisma/seed-lib";

// The lazy demo reset. Nothing is ever deleted: a reset seeds a new epoch and
// then makes it the current one in a single transaction, retiring the old
// epoch with all of its agreements and audit history intact.
//
//   1. due?    demo mode is on, and the current epoch is not a demo epoch
//              (a fresh deployment), or it has been used and then left idle;
//   2. claim   insert a PREPARING epoch — the unique marker admits one at a
//              time, so concurrent visitors cannot start two resets; a claim
//              whose lease ran out (a crashed reset) is abandoned first;
//   3. seed    the demo agreements, through the real lifecycle, into it;
//   4. switch  retire the current epoch only if nothing changed in it since
//              step 1 (someone came back: their session is kept and this
//              reset is abandoned), and make the new epoch current.
//
// A reset that fails is abandoned, and the next is not tried until a cooldown
// has passed: meanwhile visitors use the current demo as it is.
//
// Idempotent: once switched, the new epoch is untouched, so it is not due
// (src/lib/demo/state.ts).

export { currentEpoch, isResetDue, resetRecentlyFailed };

export type ResetOutcome =
  | { outcome: "disabled" | "not-due" | "cooling-down" | "waited" | "superseded" }
  | { outcome: "reset"; epochId: number };

type Options = {
  settings?: DemoSettings;
  clock?: () => Date;
  // Seeds the demo agreements into the given (preparing) epoch.
  seedEpoch?: (epochId: number, anchor: Date) => Promise<void>;
  // The CLI: reset now, whether or not the current epoch is due.
  force?: boolean;
  pollMs?: number;
};

async function seedDemoAgreements(epochId: number, anchor: Date) {
  // Draft previews are left to render when first opened, so a reset renders
  // only what the seeded agreements must have: their frozen copies.
  await seed({ anchor, epochId, deferPreviews: true, log: () => {} });
}

function isUniqueViolation(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return /P2002|23505|unique constraint/i.test(text);
}

async function claimPreparingEpoch(now: Date, settings: DemoSettings) {
  const create = () =>
    prisma.demoEpoch.create({
      data: {
        status: DemoEpochStatus.PREPARING,
        preparingMarker: true,
        leaseExpiresAt: new Date(now.getTime() + settings.leaseMs),
        isDemo: true,
        agreementLimit: settings.agreementLimit,
        linkLimit: settings.linkLimit,
        requireExampleDomains: true,
      },
      select: { id: true },
    });
  try {
    return await create();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  // Another reset holds the claim. Take it over only if its lease ran out.
  const stale = await prisma.demoEpoch.updateMany({
    where: { preparingMarker: true, leaseExpiresAt: { lte: now } },
    data: { status: DemoEpochStatus.ABANDONED, preparingMarker: null, endedAt: now },
  });
  if (stale.count !== 1) return null;
  try {
    return await create();
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

async function abandon(epochId: number, now: Date) {
  await prisma.demoEpoch.updateMany({
    where: { id: epochId, status: DemoEpochStatus.PREPARING },
    data: { status: DemoEpochStatus.ABANDONED, preparingMarker: null, endedAt: now },
  });
}

// The reset runs in a server action limited to 120 seconds (maxDuration,
// src/app/demo/preparing/page.tsx): a visitor waits at most this long for
// another visitor's reset, then is sent on (and back here if it still runs).
const MAX_WAIT_MS = 90_000;

async function waitForOtherReset(settings: DemoSettings, pollMs: number) {
  const deadline = Date.now() + Math.min(settings.leaseMs, MAX_WAIT_MS);
  while (Date.now() < deadline) {
    const preparing = await prisma.demoEpoch.count({ where: { preparingMarker: true } });
    if (preparing === 0) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function ensureFreshDemo({
  settings = demoSettings(),
  clock = () => new Date(),
  seedEpoch = seedDemoAgreements,
  force = false,
  pollMs = 1000,
}: Options = {}): Promise<ResetOutcome> {
  if (!settings.enabled && !force) return { outcome: "disabled" };
  const observed = await currentEpoch();
  if (!force && !isResetDue(observed, clock(), settings)) return { outcome: "not-due" };
  if (!force && (await resetRecentlyFailed(observed, clock(), settings))) return { outcome: "cooling-down" };

  const claim = await claimPreparingEpoch(clock(), settings);
  if (!claim) {
    await waitForOtherReset(settings, pollMs);
    return { outcome: "waited" };
  }

  try {
    // A reset that finished between our check and our claim makes this one
    // unnecessary.
    const latest = await currentEpoch();
    if (!force && (latest?.id !== observed?.id || !isResetDue(latest, clock(), settings))) {
      await abandon(claim.id, clock());
      return { outcome: "not-due" };
    }

    await seedEpoch(claim.id, clock());

    const switched = await prisma.$transaction(async (tx) => {
      const now = clock();
      if (latest) {
        const retired = await tx.demoEpoch.updateMany({
          where: {
            id: latest.id,
            status: DemoEpochStatus.CURRENT,
            // Activity since the check means someone is using it: keep it.
            ...(force ? {} : { lastActivityAt: latest.lastActivityAt }),
          },
          data: { status: DemoEpochStatus.RETIRED, currentMarker: null, endedAt: now },
        });
        if (retired.count !== 1) return false;
      }
      const activated = await tx.demoEpoch.updateMany({
        where: { id: claim.id, status: DemoEpochStatus.PREPARING },
        data: {
          status: DemoEpochStatus.CURRENT,
          currentMarker: true,
          preparingMarker: null,
          leaseExpiresAt: null,
          activatedAt: now,
        },
      });
      // Our claim was taken over (the lease ran out mid-seed): undo the retire.
      if (activated.count !== 1) throw new Error("The demo reset lost its claim before switching epochs.");
      return true;
    });
    if (!switched) {
      await abandon(claim.id, clock());
      return { outcome: "superseded" };
    }
    return { outcome: "reset", epochId: claim.id };
  } catch (error) {
    await abandon(claim.id, clock()).catch(() => {});
    throw error;
  }
}
