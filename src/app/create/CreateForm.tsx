"use client";

import { useActionState } from "react";
import { createDocumentAction, type CreateDocumentState } from "./actions";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { TemplateType } from "@/generated/prisma/enums";
import { initials } from "@/lib/format";

const initialState: CreateDocumentState = { error: null };

export function CreateForm({
  senderName,
  senderRole,
}: {
  senderName: string;
  senderRole: string;
}) {
  const [state, formAction, pending] = useActionState(
    createDocumentAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="label-strip mb-1 text-slate">Sending as</legend>
        <div className="flex items-center gap-3 rounded-md border border-panel-border bg-ink px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-panel-border-hover font-mono text-xs text-slate">
            {initials(senderName)}
          </div>
          <div>
            <p className="text-sm text-paper">{senderName}</p>
            <p className="label-strip text-slate-dim">{senderRole}</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="label-strip mb-1 text-slate">01 &middot; Template</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(TemplateType).map((type, i) => (
            <label
              key={type}
              className="group flex cursor-pointer flex-col gap-0.5 rounded-md border border-panel-border bg-ink px-3.5 py-3 has-[:checked]:border-signal has-[:checked]:bg-panel-hover"
            >
              <input
                type="radio"
                name="templateType"
                value={type}
                defaultChecked={i === 0}
                className="sr-only"
              />
              <span className="text-sm text-paper">
                {TEMPLATE_TYPE_LABELS[type]}
              </span>
              <span className="label-strip text-slate-dim">{type}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="label-strip mb-1 text-slate">
          02 &middot; Counterparty
        </legend>
        <div className="flex flex-col gap-3">
          <Field
            label="Counterparty name"
            name="counterpartyName"
            placeholder="Ashgrove Creative LLC"
            required
          />
          <Field
            label="Counterparty email"
            name="counterpartyEmail"
            type="email"
            placeholder="contact@ashgrovecreative.com"
            required
          />
          <Field
            label="Document title (optional)"
            name="title"
            placeholder="Auto-generated from template + counterparty"
          />
        </div>
      </fieldset>

      {state.error && (
        <p className="label-strip text-danger">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="label-strip self-start rounded-md border border-signal bg-signal/10 px-5 py-2.5 text-paper transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Generating PDF…" : "Generate document"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-strip text-slate">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="rounded-md border border-panel-border bg-ink px-3 py-2 text-sm text-paper placeholder:text-slate-dim focus:border-signal focus:outline-none"
      />
    </label>
  );
}
