"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { FilePlus2, Files, History, Inbox, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import { CountersignMark } from "@/components/CountersignMark";
import { buttonClasses } from "@/components/ui/button";

// The signed-in application's navigation: a fixed rail on desktop, a top bar
// with a slide-over menu below 1024px. Both render the same items.

export type ShellUser = { name: string; roleLabel: string; isSignatory: boolean };

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
  count?: number;
  countLabel?: string;
};

function navGroups(needsCountersign: number): { label: string | null; items: NavItem[] }[] {
  return [
    {
      label: null,
      items: [
        {
          label: "Agreements",
          href: "/agreements",
          icon: Files,
          isActive: (p) => p.startsWith("/agreements") && p !== "/agreements/new",
          count: needsCountersign,
          countLabel: `${needsCountersign} need${needsCountersign === 1 ? "s" : ""} your countersignature`,
        },
        {
          label: "New agreement",
          href: "/agreements/new",
          icon: FilePlus2,
          isActive: (p) => p === "/agreements/new",
        },
      ],
    },
    {
      label: "Records",
      items: [
        { label: "Outbox", href: "/outbox", icon: Inbox, isActive: (p) => p.startsWith("/outbox") },
        { label: "Audit log", href: "/audit", icon: History, isActive: (p) => p.startsWith("/audit") },
      ],
    },
  ];
}

function Brand() {
  return (
    <Link href="/agreements" className="flex h-11 items-center gap-2.5 rounded-md lg:h-auto">
      {/* The wordmark names the link; the mark's own title would repeat it. */}
      <span aria-hidden>
        <CountersignMark className="size-6 text-signal" />
      </span>
      <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-paper">
        Countersign
      </span>
    </Link>
  );
}

function NavList({ needsCountersign, onNavigate }: { needsCountersign: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {navGroups(needsCountersign).map((group) => (
        <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
          {group.label && <p className="mb-1 px-3 text-xs font-medium text-slate">{group.label}</p>}
          {group.items.map((item) => {
            const active = item.isActive(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors lg:h-9 ${
                  active ? "bg-panel text-paper" : "text-slate hover:bg-panel/60 hover:text-paper"
                }`}
              >
                {active && (
                  <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-signal" />
                )}
                <Icon aria-hidden className={`size-4 shrink-0 ${active ? "text-signal" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="text-xs font-semibold tabular-nums text-signal" title={item.countLabel}>
                    {item.count}
                    <span className="sr-only"> — {item.countLabel}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Account({ user }: { user: ShellUser }) {
  return (
    <div className="flex flex-col gap-2 border-t border-panel-border pt-4">
      <div className="px-3">
        <p className="truncate text-sm font-medium text-paper">{user.name}</p>
        <p className="truncate text-xs text-slate">
          {user.roleLabel} · {user.isSignatory ? "Can countersign" : "Cannot countersign"}
        </p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className={buttonClasses("ghost", "md", "w-full justify-start px-3")}>
          <LogOut aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppNav({ user, needsCountersign }: { user: ShellUser; needsCountersign: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const close = () => dialog.current?.close();

  // Navigating away closes the menu.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-panel-border bg-ink-warm px-3 py-5 lg:flex">
        <div className="px-3">
          <Brand />
        </div>
        <div className="flex-1">
          <NavList needsCountersign={needsCountersign} />
        </div>
        <Account user={user} />
      </aside>

      {/* Mobile and tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-panel-border bg-ink/95 px-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className={buttonClasses("ghost", "md", "w-11 px-0")}
          aria-label="Open menu"
          aria-haspopup="dialog"
        >
          <Menu aria-hidden className="!size-5" />
        </button>
        <div className="flex-1">
          <Brand />
        </div>
        {needsCountersign > 0 && (
          <Link
            href="/agreements?view=needs-countersign"
            className="flex h-11 items-center px-3 text-xs font-semibold text-signal"
          >
            {needsCountersign} to countersign
          </Link>
        )}
      </header>

      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={(event) => {
          // A click on the backdrop (outside the panel) closes the menu.
          if (event.target === dialog.current) close();
        }}
        className="m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none bg-ink-warm p-0 text-paper backdrop:bg-black/60 lg:hidden"
      >
        <div className="flex h-full flex-col gap-6 px-3 pt-2 pb-5">
          <div className="flex h-12 items-center justify-between pl-3">
            <Brand />
            <button
              type="button"
              onClick={close}
              // Focus lands here when the menu opens, not on the logo link.
              autoFocus
              className={buttonClasses("ghost", "md", "w-11 px-0")}
              aria-label="Close menu"
            >
              <X aria-hidden className="!size-5" />
            </button>
          </div>
          <div className="flex-1">
            <NavList needsCountersign={needsCountersign} onNavigate={close} />
          </div>
          <Account user={user} />
        </div>
      </dialog>
    </>
  );
}
