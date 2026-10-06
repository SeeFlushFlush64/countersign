"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { DocumentFlowError } from "@/lib/errors";
import { dispatchDueMessages, retryDelivery } from "@/lib/delivery/outbox";
import { DELIVERY_STATUS_LABELS } from "@/lib/labels";

// Every action verifies the session itself — a Server Action is its own
// entry point and can be invoked directly.

export type RetryState = { error: string | null; result: string | null };

async function sessionUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function retryDeliveryAction(messageId: string): Promise<RetryState> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Sign in to retry this delivery.", result: null };

  try {
    const outcome = await retryDelivery(messageId, { userId });
    revalidatePath("/outbox");
    revalidatePath("/documents/[id]", "page");
    return { error: null, result: DELIVERY_STATUS_LABELS[outcome.status] };
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message, result: null };
    throw err;
  }
}

// Delivers everything due: queued messages, abandoned attempts, and failures
// below the automatic retry limit.
export async function dispatchDueAction(): Promise<RetryState> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Sign in to deliver queued messages.", result: null };

  const outcomes = await dispatchDueMessages();
  revalidatePath("/outbox");
  const delivered = outcomes.filter((o) => o.status === "DELIVERED").length;
  return {
    error: null,
    result: outcomes.length === 0 ? "Nothing was due." : `${delivered} of ${outcomes.length} delivered.`,
  };
}
