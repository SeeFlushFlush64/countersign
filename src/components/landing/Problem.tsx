import { H2, WRAP } from "./layout";

const SCENARIOS = [
  {
    title: "Your signatory signs too early",
    body: "Your company signs before the other side has agreed. Now you are committed to terms the other party can still change or walk away from.",
    tag: "Signed before the counterparty",
  },
  {
    title: "Nobody can say which version was signed",
    body: "Two files with nearly the same name are in the thread. Which one did they sign, and is it the one you approved?",
    tag: "NDA_final_FINAL.pdf",
  },
  {
    title: "There is no record to point to",
    body: "Months later someone asks who signed what, and when. The answer is scattered across inboxes, attachments and forwarded messages.",
    tag: "Search the inbox",
  },
];

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-heading" className="border-y border-rule bg-surface">
      <div className={`${WRAP} grid gap-10 py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
        <div>
          <h2 id="problem-heading" className={H2}>
            Where agreements go wrong
          </h2>
          <p className="mt-4 max-w-sm text-base text-muted">
            None of these needs a bad actor. They happen when a signing order lives in people&rsquo;s heads and an
            agreement lives in an email thread.
          </p>
        </div>
        <ul className="divide-y divide-rule border-y border-rule">
          {SCENARIOS.map((s) => (
            <li key={s.title} className="grid gap-3 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
              <div>
                <h3 className="text-lg font-medium text-fg">{s.title}</h3>
                <p className="mt-1.5 max-w-xl text-sm text-muted sm:text-base">{s.body}</p>
              </div>
              <p className="self-start rounded-md border border-rule bg-canvas px-2.5 py-1 font-mono text-xs text-muted sm:mt-1">
                {s.tag}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
