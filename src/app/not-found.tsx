import Link from "next/link";
import { StatusStrip } from "@/components/StatusStrip";

// Rendered for unmatched URLs and for notFound() from the document and
// signing pages (e.g. a signing link whose signer doesn't exist).
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <StatusStrip segments={["COUNTERSIGN", "404"]} />
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
        Not found
      </h1>
      <p className="mt-2 text-sm text-slate">
        This page or document doesn&rsquo;t exist. If you followed a signing
        link, check that it was copied in full.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="label-strip rounded-md border border-panel-border px-4 py-2.5 text-slate transition-colors hover:border-panel-border-hover hover:text-paper"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
