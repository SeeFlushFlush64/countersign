import { ExternalLink, FileText, TriangleAlert } from "lucide-react";
import type { ArtifactKind, ArtifactStatus } from "@/generated/prisma/enums";
import { buttonClasses } from "@/components/ui/button";

// The agreement document itself. Which copy is shown is stated plainly: the
// draft preview, the frozen copy both parties sign, or the executed copy.
// Desktop shows it inline; phones get a link to the full PDF (embedded PDF
// viewers are unreliable on mobile browsers).

const COPY: Record<ArtifactKind, (counterparty: string) => { name: string; note: string }> = {
  PREVIEW: () => ({
    name: "Draft preview",
    note: "Not final. The binding copy is frozen, with its fingerprint, when the agreement is sent.",
  }),
  FROZEN: (counterparty) => ({
    name: "Frozen copy, as sent",
    note: `The exact document ${counterparty} signs and the company countersigns.`,
  }),
  EXECUTED: () => ({
    name: "Executed copy",
    note: "The frozen pages, unchanged, followed by the execution page with both signatures.",
  }),
};

export function DocumentPanel({
  id,
  title,
  kind,
  artifact,
  counterpartyName,
  href = `/api/documents/${id}/pdf`,
  note,
  inlineFrom = "md",
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  artifact: { status: ArtifactStatus; attempts: number; lastError: string | null } | null;
  counterpartyName: string;
  // Where the PDF is served from (the counterparty's link-scoped route in
  // the signing room), and the reader-specific description of the copy.
  href?: string;
  note?: string;
  // The width from which the PDF is embedded inline; below it, a link card.
  inlineFrom?: "md" | "lg";
}) {
  const large = inlineFrom === "lg";
  const base = COPY[kind](counterpartyName);
  const copy = { name: base.name, note: note ?? base.note };
  const ready = artifact?.status === "READY";

  return (
    <section aria-labelledby="document-heading" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="document-heading" className="text-sm font-medium text-paper">
            Document · <span className="text-slate">{copy.name}</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-slate">{copy.note}</p>
        </div>
        {ready && (
          // Larger screens only; phones get the document link below.
          <div className={large ? "hidden lg:block" : "hidden md:block"}>
            <a href={href} target="_blank" rel="noreferrer" className={buttonClasses("ghost", "sm", "-mr-2")}>
              <ExternalLink aria-hidden />
              Open in new tab
            </a>
          </div>
        )}
      </div>

      {ready ? (
        <>
          {/* Phones: a link to the full PDF */}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`mt-3 flex items-center gap-3 rounded-md border border-panel-border px-4 py-3 transition-colors hover:border-panel-border-hover ${large ? "lg:hidden" : "md:hidden"}`}
          >
            <FileText aria-hidden className="size-5 shrink-0 text-slate" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-paper">{title}</span>
              <span className="block text-xs text-slate">PDF · {copy.name}</span>
            </span>
            <ExternalLink aria-hidden className="size-4 shrink-0 text-slate" />
          </a>
          {/* Larger screens: inline */}
          <iframe
            src={href}
            title={`${title} — ${copy.name}`}
            className={`mt-3 hidden h-[min(78vh,56rem)] w-full rounded-md border border-panel-border bg-panel ${large ? "lg:block" : "md:block"}`}
          />
        </>
      ) : (
        <div className="mt-3 flex items-start gap-3 rounded-md border border-panel-border px-4 py-4 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-alert" />
          <div>
            {!artifact ? (
              <p className="text-paper">No PDF is stored for this agreement.</p>
            ) : (
              <>
                <p className="text-paper">
                  {artifact.status === "FAILED"
                    ? `The PDF could not be generated${artifact.attempts > 0 ? ` (${artifact.attempts} attempt${artifact.attempts === 1 ? "" : "s"})` : ""}.`
                    : "The PDF is being generated."}
                </p>
                <p className="mt-0.5 text-slate">
                  Nothing about the agreement is affected. Opening it tries again.
                </p>
                {artifact.lastError && <p className="mt-1 text-xs text-slate">{artifact.lastError}</p>}
                <a href={href} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm", "mt-3")}>
                  Try opening the PDF
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
