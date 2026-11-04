import { Check } from "lucide-react";
import { H2, WRAP } from "./layout";
import { OrderTimeline } from "./OrderTimeline";

// The guarantees, grouped by what a reader wants to trust. Each line is
// backed by the automated tests; the limits at the end are as true as the
// guarantees.
const GROUPS = [
  {
    title: "The order",
    items: [
      "A countersignature is refused until the counterparty has signed, by the server and again by a database constraint.",
      "Only the signatory named on the agreement can countersign it. Other signed-in users cannot.",
      "When several people act at the same moment, exactly one attempt wins.",
    ],
  },
  {
    title: "The document",
    items: [
      "Sending freezes the PDF and records its SHA-256 fingerprint. Both signatures apply to that exact document.",
      "The executed PDF is the frozen pages, unchanged, plus an execution page with both signatures.",
      "A stored PDF cannot be edited or deleted once it is ready.",
    ],
  },
  {
    title: "The record",
    items: [
      "History is append-only. Every step names who acted, and the database rejects edits and deletions.",
      "Signing links are random, stored only as a hash, expire after 14 days, and stop working when replaced or when the agreement is voided.",
      "A counterparty's network address is stored only as a keyed hash.",
    ],
  },
];

const LIMITS = [
  "Whoever holds a signing link can act as the counterparty. There is no second factor, so each link opens one agreement only.",
  "A signature is a drawn or typed image applied to the frozen document. It is not a certificate-based signature, and Countersign makes no legal or compliance claims.",
];

export function Trust() {
  return (
    <section id="trust" aria-labelledby="trust-heading" className="scroll-mt-6 bg-canvas-sunken">
      <div className={`${WRAP} py-16 lg:py-24`}>
        <h2 id="trust-heading" className={H2}>
          Why you can trust the result
        </h2>
        <p className="mt-4 max-w-2xl text-base text-muted">
          The order is not a screen you are asked to follow. It is checked where the data lives, so a mistake in one
          layer cannot quietly break it.
        </p>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <h3 className="mb-6 text-sm font-medium text-muted">The order, played once</h3>
            <OrderTimeline />
            <p className="mt-6 max-w-sm text-sm text-muted">
              Try to countersign before the counterparty has signed, and the server says no. So does the database.
            </p>
          </div>

          <div className="flex flex-col gap-9">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-fg">{g.title}</h3>
                <ul className="mt-3 divide-y divide-rule border-y border-rule">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-3 py-3 text-sm text-fg">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-state-done" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-fg">What it does not do</h3>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm text-muted">
                {LIMITS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
