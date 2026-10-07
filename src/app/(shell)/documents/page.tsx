import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatStrip } from "@/components/StatStrip";
import { DocumentsTable, type DocumentRow } from "@/components/DocumentsTable";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { DocumentStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { sender: true, signers: true },
  });

  const rows: DocumentRow[] = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    templateLabel: TEMPLATE_TYPE_LABELS[doc.templateType],
    senderName: doc.sender.name,
    signedCount: doc.signers.filter((s) => s.signedAt).length,
    totalSigners: doc.signers.length,
    status: doc.status,
    createdAtLabel: doc.createdAt.toISOString(),
    createdAtMs: doc.createdAt.getTime(),
  }));

  const stats = [
    { label: "Total", value: documents.length },
    {
      label: "Sent",
      value: documents.filter((d) => d.status === DocumentStatus.SENT).length,
      accent: "text-alert",
    },
    {
      label: "Partially Signed",
      value: documents.filter(
        (d) => d.status === DocumentStatus.PARTIALLY_SIGNED,
      ).length,
      accent: "text-alert",
    },
    {
      label: "Fully Executed",
      value: documents.filter(
        (d) => d.status === DocumentStatus.FULLY_EXECUTED,
      ).length,
      accent: "text-live",
    },
  ];

  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-paper">
          Documents
        </h1>
        <Link
          href="/create"
          className="label-strip rounded-md border border-panel-border px-3 py-1.5 text-slate transition-colors hover:border-signal hover:text-paper"
        >
          + New document
        </Link>
      </div>

      <StatStrip stats={stats} />

      <DocumentsTable rows={rows} />
    </div>
  );
}
