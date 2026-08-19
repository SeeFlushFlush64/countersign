import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { DocumentStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUS_BREAKDOWN: { status: DocumentStatus; label: string; dot: string }[] = [
  { status: DocumentStatus.DRAFT, label: "Draft", dot: "bg-slate-dim" },
  { status: DocumentStatus.SENT, label: "Sent", dot: "bg-alert" },
  {
    status: DocumentStatus.PARTIALLY_SIGNED,
    label: "Partial",
    dot: "bg-alert",
  },
  {
    status: DocumentStatus.FULLY_EXECUTED,
    label: "Executed",
    dot: "bg-live",
  },
];

export default async function SendersPage() {
  const senders = await prisma.sender.findMany({
    orderBy: { name: "asc" },
    include: { documents: { select: { status: true } } },
  });

  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-paper">
          Senders
        </h1>
        <span className="label-strip text-slate-dim">
          {senders.length} TEAM MEMBERS
        </span>
      </div>

      <div className="flex flex-col divide-y divide-panel-border border border-panel-border rounded-lg">
        {senders.map((sender) => {
          const total = sender.documents.length;
          return (
            <div
              key={sender.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="text-sm text-paper">{sender.name}</p>
                <p className="label-strip mt-1 text-slate-dim">
                  {ROLE_LABELS[sender.role]} &middot; {sender.email}
                </p>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right">
                  <div className="font-mono text-lg text-paper">{total}</div>
                  <div className="label-strip text-slate-dim">Documents</div>
                </div>

                <div className="flex items-center gap-3 border-l border-panel-border pl-5">
                  {STATUS_BREAKDOWN.map(({ status, label, dot }) => {
                    const count = sender.documents.filter(
                      (d) => d.status === status,
                    ).length;
                    return (
                      <div
                        key={status}
                        className="flex items-center gap-1.5 label-strip text-slate"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {count} {label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        {senders.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate">
            No senders yet.
          </div>
        )}
      </div>
    </div>
  );
}
