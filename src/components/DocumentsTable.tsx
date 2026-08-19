"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DocumentStatus } from "@/generated/prisma/enums";
import { StatusBadge } from "@/components/StatusBadge";

export type DocumentRow = {
  id: string;
  title: string;
  templateLabel: string;
  senderName: string;
  signedCount: number;
  totalSigners: number;
  status: DocumentStatus;
  createdAtLabel: string;
  createdAtMs: number;
};

const STATUS_ORDER: Record<DocumentStatus, number> = {
  DRAFT: 0,
  SENT: 1,
  PARTIALLY_SIGNED: 2,
  FULLY_EXECUTED: 3,
};

type SortKey = "title" | "templateLabel" | "senderName" | "signed" | "status";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Document" },
  { key: "templateLabel", label: "Type" },
  { key: "senderName", label: "Sender" },
  { key: "signed", label: "Signed" },
  { key: "status", label: "Status" },
];

export function DocumentsTable({ rows }: { rows: DocumentRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [dir, setDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "templateLabel":
          cmp = a.templateLabel.localeCompare(b.templateLabel);
          break;
        case "senderName":
          cmp = a.senderName.localeCompare(b.senderName);
          break;
        case "signed":
          cmp = a.signedCount / a.totalSigners - b.signedCount / b.totalSigners;
          break;
        case "status":
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
      }
      return cmp * dir;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(1);
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-panel-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-panel-border bg-panel">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="cursor-pointer select-none px-4 py-2.5 text-left label-strip text-slate hover:text-paper"
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-signal">{dir === 1 ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className="border-b border-panel-border last:border-0 hover:bg-panel"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/documents/${row.id}`}
                  className="text-paper hover:text-signal"
                >
                  {row.title}
                </Link>
              </td>
              <td className="px-4 py-3 label-strip text-slate">
                {row.templateLabel}
              </td>
              <td className="px-4 py-3 text-slate">{row.senderName}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate">
                {row.signedCount}/{row.totalSigners}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate">
                No documents yet &mdash; create the first one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
