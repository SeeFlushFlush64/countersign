import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export default function AgreementNotFound() {
  return (
    <div className="w-full max-w-[76rem] px-4 pt-10 pb-16 sm:px-6 lg:px-10">
      <div className="flex max-w-lg flex-col items-start gap-3">
        <FileQuestion aria-hidden className="size-6 text-slate" />
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-paper">
          Agreement not found
        </h1>
        <p className="text-sm text-slate">Check the address, or find it in your agreements.</p>
        <Link href="/agreements" className={buttonClasses("secondary", "md", "mt-2")}>
          Back to agreements
        </Link>
      </div>
    </div>
  );
}
