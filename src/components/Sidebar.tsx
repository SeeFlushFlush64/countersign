"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth-actions";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";
import { initials } from "@/lib/format";
import { CountersignMark } from "@/components/CountersignMark";

const NAV_ITEMS = [
  { label: "Documents", href: "/documents" },
  { label: "Create", href: "/create" },
  { label: "Activity", href: "/activity" },
  { label: "Senders", href: "/senders" },
];

export function Sidebar({
  senderName,
  senderRole,
}: {
  senderName: string;
  senderRole: string;
}) {
  const pathname = usePathname();
  const roleLabel = ROLE_LABELS[senderRole as Role] ?? senderRole;

  return (
    <aside className="flex h-screen w-[180px] shrink-0 flex-col border-r border-panel-border bg-ink-warm">
      <div className="flex items-center gap-2 px-5 py-5">
        <CountersignMark className="h-6 w-6 text-signal" />
        <span className="font-mono text-sm lowercase tracking-tight text-paper">
          countersign
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`label-strip rounded-md px-3 py-2 transition-colors ${
                active
                  ? "bg-panel text-paper"
                  : "text-slate hover:bg-panel/60 hover:text-paper"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-panel-border px-5 py-4">
        {senderName && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-panel-border-hover font-mono text-[10px] text-slate">
              {initials(senderName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-paper">{senderName}</p>
              <p className="label-strip truncate text-slate-dim">{roleLabel}</p>
            </div>
          </div>
        )}

        <form action={logoutAction}>
          <button
            type="submit"
            className="label-strip text-slate-dim transition-colors hover:text-paper"
          >
            Log out
          </button>
        </form>

        <div className="flex items-center gap-1.5 label-strip text-slate-dim">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
          </span>
          LIVE &middot; 0 ERRORS
        </div>
      </div>
    </aside>
  );
}
