"use client";

import { useEffect, useState } from "react";
import { STATUS_EVENT_LABELS } from "@/lib/labels";
import { STATUS_EVENT_DOT } from "@/lib/status-styles";
import { formatDateTime } from "@/lib/format";
import { LiveDot } from "@/components/LiveDot";
import type { StatusEventType } from "@/generated/prisma/enums";

export type ActivityRow = {
  id: string;
  eventType: StatusEventType;
  actor: string;
  documentTitle: string;
  timestamp: Date;
};

const STAGGER_MS = 60;

export function ActivityFeed({ activity }: { activity: ActivityRow[] }) {
  // Lazy-initialized so a reduced-motion preference skips the stagger
  // animation from the very first render instead of flashing in via an
  // effect.
  const [mounted, setMounted] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (mounted) return;
    // Defer to the next frame so the browser paints the rows in their
    // pre-animation state before the transition kicks in.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  const rowClassName =
    "transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0";

  return (
    <div className="overflow-hidden rounded-lg border border-panel-border bg-panel">
      <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
        <span className="label-strip text-slate">Recent activity</span>
        <LiveDot />
      </div>

      {/* Mobile: stacked 2-line rows (no horizontal scroll) */}
      <ul className="sm:hidden">
        {activity.map((row, i) => (
          <li
            key={row.id}
            className={`border-b border-panel-border px-4 py-3 last:border-0 ${rowClassName} ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"
            }`}
            style={{ transitionDelay: `${i * STAGGER_MS}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-paper">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_EVENT_DOT[row.eventType]}`}
                />
                {STATUS_EVENT_LABELS[row.eventType]}
              </span>
              <span className="font-mono text-xs text-slate">
                {row.actor}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="truncate text-xs text-slate-dim">
                {row.documentTitle}
              </span>
              <span className="shrink-0 font-mono text-xs whitespace-nowrap text-slate-dim">
                {formatDateTime(row.timestamp)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop/tablet: 4-column table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-panel-border">
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Event
              </th>
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Actor
              </th>
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Document
              </th>
              <th className="px-4 py-2.5 text-right label-strip text-slate">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {activity.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-panel-border last:border-0 ${rowClassName} ${
                  mounted
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-1.5"
                }`}
                style={{ transitionDelay: `${i * STAGGER_MS}ms` }}
              >
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-paper">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_EVENT_DOT[row.eventType]}`}
                    />
                    {STATUS_EVENT_LABELS[row.eventType]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate">
                  {row.actor}
                </td>
                <td className="px-4 py-3 text-slate">{row.documentTitle}</td>
                <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-slate-dim">
                  {formatDateTime(row.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
