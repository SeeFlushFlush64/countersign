import { ChevronDown } from "lucide-react";
import { H2, WRAP } from "./layout";

const FAQ = [
  {
    q: "Does the counterparty need an account?",
    a: "No. They open one private link, review the frozen document and sign in the browser. The link works for 14 days and opens only that agreement.",
  },
  {
    q: "What if the signing link is forwarded?",
    a: "Whoever holds the link can act as the counterparty, and there is no second factor. That is why each link opens a single agreement, expires, and is replaced the moment you reissue it. Voiding the agreement stops the link at once.",
  },
  {
    q: "Can an agreement change after it is sent?",
    a: "No. Sending freezes the PDF and records its SHA-256 fingerprint, and a stored PDF cannot be edited. If something is wrong, void the agreement with a reason and send a corrected one.",
  },
  {
    q: "Does Countersign send email?",
    a: "Not today. Every notification is recorded in an in-app outbox, where the sender opens the signing link and passes it to the counterparty. Real email delivery is not built.",
  },
  {
    q: "What does Countersign prove?",
    a: "Who signed, when, which exact document (by its SHA-256 fingerprint) and in what order. Whether an e-signature is enforceable depends on the agreement and the jurisdiction. This is not legal advice.",
  },
  {
    q: "Who can see an agreement?",
    a: "Company users sign in. The counterparty sees only their own agreement, through their link. Each counterparty visit and each signature is written to the audit log.",
  },
  {
    q: "Which agreements can I send?",
    a: "Four templates: Mutual NDA, Vendor Agreement, Media Release and Licensing Order. Each is a PDF built from the details you enter, then frozen when you send it.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-6 border-y border-rule bg-surface">
      <div className={`${WRAP} grid gap-10 py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
        <h2 id="faq-heading" className={H2}>
          Questions
        </h2>
        <div className="divide-y divide-rule border-y border-rule">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-2 text-base font-medium text-fg [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-4 text-sm text-muted sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
