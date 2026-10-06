import type { StatusEventType } from "@/generated/prisma/enums";
import { STATUS_EVENT_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

const DOT_CLASS: Record<StatusEventType, string> = {
  CREATED: "bg-slate",
  SENT: "bg-alert",
  VIEWED: "bg-slate-dim",
  SIGNED: "bg-signal",
  FULLY_EXECUTED: "bg-live",
  LINK_REISSUED: "bg-alert",
  VOIDED: "bg-danger",
};

export type TimelineEvent = {
  id: string;
  eventType: StatusEventType;
  actor: string;
  timestamp: Date;
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="flex flex-col">
      {events.map((event, i) => (
        <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < events.length - 1 && (
            <span className="absolute top-2.5 left-[3px] h-full w-px bg-panel-border" />
          )}
          <span
            className={`relative z-10 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[event.eventType]}`}
          />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <div>
              <span className="text-sm text-paper">
                {STATUS_EVENT_LABELS[event.eventType]}
              </span>
              <span className="ml-2 font-mono text-xs text-slate">
                {event.actor}
              </span>
            </div>
            <span className="font-mono text-xs whitespace-nowrap text-slate-dim">
              {formatDateTime(event.timestamp)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
