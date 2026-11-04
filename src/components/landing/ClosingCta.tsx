import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SampleWorkspaceButton } from "@/components/SampleWorkspaceButton";
import { buttonClasses } from "@/components/ui/button";
import { WRAP } from "./layout";

export function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="closing-heading" className="bg-ink-band text-canvas">
      <div className={`${WRAP} py-16 lg:py-24`}>
        <h2 id="closing-heading" className="max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          See one agreement go through in the right order.
        </h2>
        <p className="mt-4 max-w-xl text-base text-on-ink-muted">
          Open the sample workspace and take an agreement from draft to executed. There is nothing to install and no
          account to make.
        </p>
        <div className="mt-8">
          {signedIn ? (
            <Link href="/agreements" className={buttonClasses("secondary")}>
              Open your agreements
              <ArrowRight aria-hidden />
            </Link>
          ) : (
            <SampleWorkspaceButton variant="secondary" />
          )}
        </div>
        <p className="mt-12 text-sm text-on-ink-muted">
          <a
            href="https://michaelrhey.com"
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-canvas"
          >
            Built by Michael Palaganas
          </a>
        </p>
      </div>
    </section>
  );
}
