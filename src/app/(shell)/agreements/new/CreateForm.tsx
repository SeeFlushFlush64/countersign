"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FilePlus2, LoaderCircle } from "lucide-react";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { TemplateType } from "@/generated/prisma/enums";
import { LIMITS } from "@/lib/validation";
import { buttonClasses } from "@/components/ui/button";
import { createDocumentAction, type CreateDocumentState } from "./actions";

// One line per template, from each template's actual terms
// (src/lib/pdf/content.ts).
const TEMPLATE_SUMMARIES: Record<TemplateType, string> = {
  NDA: "Mutual confidentiality for three years; no license granted.",
  VENDOR_AGREEMENT: "Services and fees; deliverables are work made for hire.",
  MEDIA_RELEASE: "Consent to use a person’s likeness, without payment.",
  LICENSING_ORDER: "Non-exclusive content license for twelve months.",
};

const INPUT =
  "h-11 w-full rounded-md border border-panel-border bg-ink px-3 text-base text-paper placeholder:text-slate focus:border-signal focus:outline-none lg:h-10 lg:text-sm";

const initialState: CreateDocumentState = { error: null };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-panel-border pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left w-full text-sm font-medium text-paper">{title}</legend>
      <div className="clear-left flex flex-col gap-3 pt-0.5">
        {hint && <p className="text-[13px] text-slate">{hint}</p>}
        {children}
      </div>
    </fieldset>
  );
}

export function CreateForm({
  preparedBy,
  countersigners,
  defaultCountersignerId,
  exampleDomainsOnly = false,
}: {
  preparedBy: string;
  countersigners: { id: string; name: string; role: string; you: boolean }[];
  defaultCountersignerId?: string;
  // The public demo accepts only reserved example addresses.
  exampleDomainsOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createDocumentAction, initialState);
  const [counterparty, setCounterparty] = useState("");
  const [countersignerId, setCountersignerId] = useState(defaultCountersignerId ?? "");
  const countersigner = countersigners.find((c) => c.id === countersignerId);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section title="Template">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(TemplateType).map((type, i) => (
            <label
              key={type}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-panel-border px-3.5 py-3 transition-colors hover:border-panel-border-hover has-[:checked]:border-signal has-[:checked]:bg-panel has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal"
            >
              <input
                type="radio"
                name="templateType"
                value={type}
                defaultChecked={i === 0}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)] focus-visible:outline-none"
              />
              <span>
                <span className="block text-sm font-medium text-paper">{TEMPLATE_TYPE_LABELS[type]}</span>
                <span className="block text-[13px] text-slate">{TEMPLATE_SUMMARIES[type]}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Counterparty" hint="Signs first, through a private link. They don’t need an account.">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-slate">Name</span>
          <input
            name="counterpartyName"
            required
            maxLength={LIMITS.counterpartyName}
            placeholder="Ashgrove Creative LLC"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-slate">Email</span>
          <input
            name="counterpartyEmail"
            type="email"
            required
            maxLength={LIMITS.email}
            placeholder="contracts@ashgrove.example"
            aria-describedby={exampleDomainsOnly ? "email-hint" : undefined}
            className={INPUT}
          />
          {exampleDomainsOnly && (
            <span id="email-hint" className="text-xs text-slate">
              This demo never sends email: use an address ending in .example or .test, or at example.com.
            </span>
          )}
        </label>
      </Section>

      <Section title="Countersigner" hint="Signs second. Only this person will be able to countersign the agreement.">
        {countersigners.length === 0 ? (
          <p className="text-sm text-danger">No company signatories exist yet, so nothing could be countersigned.</p>
        ) : (
          <select
            name="countersignerId"
            required
            value={countersignerId}
            onChange={(e) => setCountersignerId(e.target.value)}
            className={INPUT}
          >
            {countersigners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.you ? " (you)" : ""} — {c.role}
              </option>
            ))}
          </select>
        )}
      </Section>

      <Section title="Title" hint="Optional. Left empty, it becomes “Template — Counterparty”.">
        <input name="title" maxLength={LIMITS.title} placeholder="e.g. Mutual NDA — Ashgrove Creative LLC" className={INPUT} />
      </Section>

      <div className="flex flex-col gap-4 border-t border-panel-border pt-6">
        <p className="text-sm text-slate">
          Order once sent: <span className="text-paper">{counterparty.trim() || "the counterparty"}</span> signs first,
          then <span className="text-paper">{countersigner?.name ?? "the countersigner"}</span> countersigns. Prepared
          by {preparedBy}.
        </p>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link href="/agreements" className={buttonClasses("ghost")}>
            Cancel
          </Link>
          <button type="submit" disabled={pending || countersigners.length === 0} className={buttonClasses("primary")}>
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <FilePlus2 aria-hidden />}
            {pending ? "Creating draft…" : "Create draft"}
          </button>
        </div>
      </div>
    </form>
  );
}
