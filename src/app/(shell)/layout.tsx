import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { countNeedingCountersign } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/labels";
import { AppNav } from "@/components/shell/AppNav";

// The signed-in application frame. Every page inside still checks the
// session itself (a layout does not guard its pages' data on its own).
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [profile, needsCountersign] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { isSignatory: true, sender: { select: { name: true, role: true } } },
    }),
    countNeedingCountersign(user.id),
  ]);

  return (
    <div className="min-h-dvh w-full lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AppNav
        user={{
          name: profile.sender.name,
          roleLabel: ROLE_LABELS[profile.sender.role],
          isSignatory: profile.isSignatory,
        }}
        needsCountersign={needsCountersign}
      />
      <main id="main" className="min-w-0">
        {children}
      </main>
    </div>
  );
}
