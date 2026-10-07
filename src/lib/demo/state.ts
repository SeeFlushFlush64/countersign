import { prisma } from "@/lib/prisma";
import { DemoEpochStatus } from "@/generated/prisma/enums";
import type { DemoSettings } from "@/lib/demo/settings";

// The current demo epoch, and whether the lazy reset (src/lib/demo/epochs.ts)
// is due: demo mode is on, and the current epoch is not a demo epoch (a fresh
// deployment) or it has been used and then left idle. An untouched epoch is
// never due, so a reset is idempotent.

export type EpochState = {
  id: number;
  isDemo: boolean;
  lastActivityAt: Date | null;
};

// findFirst, not findUnique: Prisma batches concurrent findUnique calls into
// one `IN` query, which a Boolean column does not support — so two requests
// at once would fail. The marker is still unique, so this finds at most one.
export function currentEpoch(): Promise<EpochState | null> {
  return prisma.demoEpoch.findFirst({
    where: { currentMarker: true },
    select: { id: true, isDemo: true, lastActivityAt: true },
  });
}

export function isResetDue(epoch: EpochState | null, now: Date, settings: DemoSettings): boolean {
  if (!settings.enabled) return false;
  if (!epoch || !epoch.isDemo) return true;
  if (!epoch.lastActivityAt) return false;
  return now.getTime() - epoch.lastActivityAt.getTime() >= settings.idleMs;
}

// Whether a reset of the current epoch ended without switching (its seed
// failed, say) within the cooldown. Until it passes, the current demo is used
// as it is: a failing reset is not retried on every page load. Abandoned
// epochs newer than the current one are attempts to replace it (ids are
// serial); one abandoned for any other reason means the reset was not due.
export async function resetRecentlyFailed(epoch: EpochState | null, now: Date, settings: DemoSettings) {
  const failed = await prisma.demoEpoch.count({
    where: {
      status: DemoEpochStatus.ABANDONED,
      id: { gt: epoch?.id ?? 0 },
      endedAt: { gt: new Date(now.getTime() - settings.failureCooldownMs) },
    },
  });
  return failed > 0;
}
