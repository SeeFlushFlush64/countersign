import Image from "next/image";
import { BrowserFrame, PhoneFrame } from "./Frames";
import { H2, WRAP } from "./layout";

// Real screenshots of the application: the dashboard, the counterparty's page
// on a phone, the executed PDF's execution page, and the audit log.
export function Tour() {
  return (
    <section id="tour" aria-labelledby="tour-heading" className="scroll-mt-6">
      <div className={`${WRAP} py-16 lg:py-24`}>
        <h2 id="tour-heading" className={H2}>
          One agreement, from draft to executed
        </h2>
        <p className="mt-4 max-w-2xl text-base text-muted">
          The same agreement from three sides: the company that sends it, the counterparty who signs first, and the
          record it leaves. Every image here is a capture of the application running.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <BrowserFrame
            src="/product/dashboard.png"
            width={1440}
            height={900}
            sizes="(min-width: 1152px) 720px, 100vw"
            alt="The Countersign dashboard listing agreements at every stage, each with a status chip and a three-step progress track."
          />
          <div>
            <h3 className="text-lg font-medium text-fg">The company side</h3>
            <p className="mt-2 text-sm text-muted sm:text-base">
              What needs your countersignature comes first. Every agreement shows where it is in the order, who is
              next, and the one action it offers.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-14 md:grid-cols-2 md:items-start md:gap-12 lg:mt-24 lg:gap-20">
          <div>
            <PhoneFrame
              src="/product/phone-signing.png"
              width={780}
              height={1688}
              sizes="280px"
              alt="The counterparty's signing page on a phone: a three-step list (you review and sign, the signatory countersigns, you download the executed copy), the frozen document, and a Sign agreement button."
            />
            <h3 className="mt-8 text-lg font-medium text-fg">The counterparty&rsquo;s page</h3>
            <p className="mt-2 text-sm text-muted sm:text-base">
              No account. One private link opens the frozen document and a pad to sign, and it works on a phone. The
              page says what happens next and who countersigns.
            </p>
          </div>
          <div>
            <figure className="mx-auto max-w-[28rem] overflow-hidden rounded-lg border border-rule-strong bg-surface shadow-[0_24px_50px_-28px_rgba(16,28,43,0.45)]">
              <Image
                src="/product/executed-pdf.png"
                width={888}
                height={1140}
                sizes="(min-width: 768px) 448px, 100vw"
                alt="The execution page of an executed PDF: the agreement reference, the SHA-256 of the agreement as sent, the counterparty's signature with its time, and the company countersignature with its time."
                className="block h-auto w-full"
              />
            </figure>
            <h3 className="mt-8 text-lg font-medium text-fg">The executed PDF</h3>
            <p className="mt-2 text-sm text-muted sm:text-base">
              The frozen pages stay unchanged. An execution page adds both signatures, the time of each, and the
              SHA-256 of the document as it was sent.
            </p>
          </div>
        </div>

        <div className="mt-16 lg:mt-24">
          <figure className="overflow-hidden rounded-xl border border-rule-strong bg-canvas shadow-[0_24px_50px_-28px_rgba(16,28,43,0.45)]">
            <Image
              src="/product/audit-log.png"
              width={1140}
              height={548}
              sizes="(min-width: 1152px) 1088px, 100vw"
              alt="The audit log for the same agreement, newest first: executed, countersigned by the company user, counterparty signed through their link, counterparty opened the link, sent for signature, agreement created."
              className="block h-auto w-full"
            />
          </figure>
          <h3 className="mt-8 text-lg font-medium text-fg">The audit log</h3>
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
            Every step, in order, with who acted. The same agreement as the PDF above: opened, signed by the
            counterparty first, countersigned, then executed. Entries can only be added.
          </p>
        </div>
      </div>
    </section>
  );
}
