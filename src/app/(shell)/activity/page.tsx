import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { STATUS_EVENT_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { StatusEventType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const DOT_CLASS: Record<StatusEventType, string> = {
  CREATED: "bg-slate",
  SENT: "bg-alert",
  VIEWED: "bg-slate-dim",
  SIGNED: "bg-signal",
  FULLY_EXECUTED: "bg-live",
  LINK_REISSUED: "bg-alert",
  VOIDED: "bg-danger",
};

export default async function ActivityPage() {
  await requireUser();
  const events = await prisma.statusEvent.findMany({
    orderBy: { timestamp: "desc" },
    include: { document: { select: { id: true, title: true } } },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-paper">
          Activity
        </h1>
        <span className="label-strip text-slate-dim">
          {events.length} EVENTS &middot; ALL DOCUMENTS
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-panel-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-panel-border bg-panel">
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Timestamp
              </th>
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Event
              </th>
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Actor
              </th>
              <th className="px-4 py-2.5 text-left label-strip text-slate">
                Document
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="border-b border-panel-border last:border-0 hover:bg-panel"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-dim">
                  {formatDateTime(event.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-paper">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[event.eventType]}`}
                    />
                    {STATUS_EVENT_LABELS[event.eventType]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate">
                  {event.actor}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/documents/${event.document.id}`}
                    className="text-slate hover:text-signal"
                  >
                    {event.document.title}
                  </Link>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
