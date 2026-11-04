import { H2, WRAP } from "./layout";

// Compared with the usual way: a PDF attached to an email thread. No product
// is named. The last row is a limit, stated as plainly as the rest.
const ROWS = [
  {
    aspect: "Signing order",
    email: "Depends on people remembering who goes first.",
    countersign: "The server and the database refuse a countersignature until the counterparty has signed.",
  },
  {
    aspect: "Which version",
    email: "Copies multiply, and the signed one may not match the approved one.",
    countersign: "One frozen document with a SHA-256 fingerprint. Both signatures apply only to it.",
  },
  {
    aspect: "Who may sign",
    email: "Anyone who gets the file can sign it or pass it on.",
    countersign: "The counterparty through one private link. Only the designated signatory countersigns.",
  },
  {
    aspect: "How long access lasts",
    email: "Attachments stay in inboxes indefinitely.",
    countersign: "Links expire after 14 days, and stop when replaced or when the agreement is voided.",
  },
  {
    aspect: "The record",
    email: "Reconstructed from threads and file dates.",
    countersign: "An append-only history of who did what, in order.",
  },
  {
    aspect: "Delivery",
    email: "Arrives in an inbox.",
    countersign: "Signing links appear in an in-app outbox today. Countersign sends no email.",
  },
];

export function Comparison() {
  return (
    <section id="compare" aria-labelledby="compare-heading" className="scroll-mt-6">
      <div className={`${WRAP} py-16 lg:py-24`}>
        <h2 id="compare-heading" className={H2}>
          Compared with email and PDF attachments
        </h2>
        <p className="mt-4 max-w-2xl text-base text-muted">
          Email works for conversation. It was never built to hold a signing order.
        </p>

        {/* Phones: one block per aspect, no sideways scrolling. */}
        <ul className="mt-10 flex flex-col gap-4 md:hidden">
          {ROWS.map((row) => (
            <li key={row.aspect} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <h3 className="border-b border-rule px-4 py-3 text-sm font-medium text-fg">{row.aspect}</h3>
              <dl className="text-sm">
                <div className="px-4 py-3">
                  <dt className="text-xs font-medium text-muted">Email and PDF attachments</dt>
                  <dd className="mt-1 text-muted">{row.email}</dd>
                </div>
                <div className="bg-accent-soft/60 px-4 py-3">
                  <dt className="text-xs font-semibold text-accent">Countersign</dt>
                  <dd className="mt-1 text-fg">{row.countersign}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="mt-10 hidden overflow-hidden rounded-lg border border-rule bg-surface md:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Email and PDF attachments compared with Countersign, by aspect</caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="w-1/5 px-5 py-3.5 text-xs font-medium text-muted">
                  Aspect
                </th>
                <th scope="col" className="w-2/5 px-5 py-3.5 text-xs font-medium text-muted">
                  Email and PDF attachments
                </th>
                <th scope="col" className="w-2/5 bg-accent-soft px-5 py-3.5 text-xs font-semibold text-accent">
                  Countersign
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.aspect} className="border-b border-rule last:border-b-0">
                  <th scope="row" className="px-5 py-4 align-top font-medium text-fg">
                    {row.aspect}
                  </th>
                  <td className="px-5 py-4 align-top text-muted">{row.email}</td>
                  <td className="bg-accent-soft/60 px-5 py-4 align-top text-fg">{row.countersign}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
