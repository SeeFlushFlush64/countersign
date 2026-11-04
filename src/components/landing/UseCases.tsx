import { H2, WRAP } from "./layout";

// The four templates in the application, with the clause headings each one
// actually contains.
const CASES = [
  {
    name: "Mutual NDA",
    when: "Before a pitch or a project kickoff, when both sides are about to share something private.",
    clauses: "Confidential information, obligations, exclusions, term, no license, governing law",
  },
  {
    name: "Vendor Agreement",
    when: "When a supplier, freelancer or production partner starts work for you.",
    clauses: "Services, fees and payment, independent contractor, ownership of deliverables, confidentiality, termination",
  },
  {
    name: "Media Release",
    when: "When a person appears in your work and you need their grant of rights before you publish.",
    clauses: "Grant of rights, no compensation, no obligation to use, release of claims, revocation",
  },
  {
    name: "Licensing Order",
    when: "When you license content in from an outside party.",
    clauses: "Licensed content, license fee, term and territory, restrictions, attribution",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" aria-labelledby="cases-heading" className="scroll-mt-6 border-y border-rule bg-surface">
      <div className={`${WRAP} grid gap-10 py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
        <div>
          <h2 id="cases-heading" className={H2}>
            For what you send to outside parties
          </h2>
          <p className="mt-4 max-w-sm text-base text-muted">
            Four templates cover the agreements agencies, studios and small companies send most. Each one is signed in
            the same order.
          </p>
        </div>
        <dl className="divide-y divide-rule border-y border-rule">
          {CASES.map((c) => (
            <div key={c.name} className="py-6">
              <dt className="font-[family-name:var(--font-display)] text-xl font-semibold text-fg">{c.name}</dt>
              <dd className="mt-1.5 text-sm text-fg sm:text-base">{c.when}</dd>
              <dd className="mt-2 text-[13px] text-muted">
                <span className="sr-only">Clauses: </span>
                {c.clauses}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
