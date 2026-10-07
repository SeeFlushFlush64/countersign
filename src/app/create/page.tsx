import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateForm } from "./CreateForm";
import { StatusStrip } from "@/components/StatusStrip";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <StatusStrip
        segments={[
          <Link key="home" href="/documents" className="hover:text-signal">
            COUNTERSIGN
          </Link>,
          "NEW DOCUMENT",
          "STEP 1 OF 1",
        ]}
      />

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
        Create a document
      </h1>
      <p className="mt-2 max-w-lg text-sm text-slate">
        Select a template, then enter the counterparty&rsquo;s details. A
        real PDF is generated immediately from the selected template &mdash;
        nothing here is a placeholder.
      </p>

      <div className="mt-10 border border-panel-border bg-panel rounded-lg p-6">
        <CreateForm
          senderName={session.user.senderName}
          senderRole={ROLE_LABELS[session.user.senderRole as Role]}
        />
      </div>
    </main>
  );
}
