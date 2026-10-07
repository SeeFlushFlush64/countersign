import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { CreateForm } from "./CreateForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New agreement · Countersign" };

export default async function NewAgreementPage() {
  const { session, user } = await requireUser();

  const [signatories, epoch] = await Promise.all([
    prisma.user.findMany({
      where: { isSignatory: true },
      select: { id: true, sender: { select: { name: true, role: true } } },
      orderBy: { email: "asc" },
    }),
    // In a demo epoch the database accepts only example-domain addresses.
    prisma.demoEpoch.findFirst({ where: { currentMarker: true }, select: { requireExampleDomains: true } }),
  ]);
  const countersigners = signatories.map((s) => ({
    id: s.id,
    name: s.sender.name,
    role: ROLE_LABELS[s.sender.role],
    you: s.id === user.id,
  }));

  return (
    <div className="w-full max-w-[76rem] px-4 pt-5 pb-16 sm:px-6 lg:px-10 lg:pt-8">
      <Link
        href="/agreements"
        className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-slate transition-colors hover:text-paper lg:h-8"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Agreements
      </Link>
      <header className="mt-2 max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
          New agreement
        </h1>
        <p className="mt-1.5 text-sm text-slate">
          It starts as a draft, with a preview PDF. Nothing is sent until you choose to send it.
        </p>
      </header>

      <div className="mt-8 max-w-2xl">
        <CreateForm
          preparedBy={session.user.senderName}
          exampleDomainsOnly={epoch?.requireExampleDomains ?? false}
          countersigners={countersigners}
          defaultCountersignerId={
            countersigners.some((c) => c.you) ? user.id : countersigners[0]?.id
          }
        />
      </div>
    </div>
  );
}
