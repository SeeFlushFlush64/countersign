import { requireUser } from "@/lib/session";
import { listOutbox } from "@/lib/queries";
import { linkDisplay } from "@/lib/delivery/outbox";
import { canManage } from "@/lib/permissions";
import { DeliveryList, type DeliveryItem } from "@/components/DeliveryList";
import { ActionButton } from "@/components/ActionButton";
import { dispatchDueAction } from "./actions";

export const dynamic = "force-dynamic";

// The demo outbox: every notification Countersign has sent, or would have
// sent. In demo mode nothing leaves the app — this page is where the
// messages go.
export default async function OutboxPage() {
  const { user } = await requireUser();
  const messages = await listOutbox();
  const now = new Date();

  const items: DeliveryItem[] = messages.map((message) => {
    const manager = canManage(user, message.document);
    return {
      ...message,
      link: linkDisplay(message, manager, now),
      canRetry: manager,
      document: { id: message.documentId, title: message.document.title },
    };
  });

  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-paper">
          Outbox
        </h1>
        <ActionButton action={dispatchDueAction} label="Deliver queued messages" pendingLabel="Delivering…" />
      </div>
      <p className="max-w-2xl text-sm text-slate">
        Demo mode: no email is sent. Each notification is recorded here instead, with its delivery
        state. A counterparty&rsquo;s signing link is stored encrypted and shown only to the
        agreement&rsquo;s sender or countersigner, and only while it still works.
      </p>
      <section className="rounded-lg border border-panel-border bg-panel p-5">
        <DeliveryList items={items} empty="No messages yet. Send an agreement to see one here." />
      </section>
    </div>
  );
}
