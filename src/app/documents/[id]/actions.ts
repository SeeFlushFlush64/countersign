"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { DocumentFlowError, sendDocument } from "@/lib/documents";

export type SendState = { error: string | null };

// Verified here, not only by the proxy: a Server Action is its own entry
// point and can be invoked directly.
// Used with useActionState; the previous state is not needed.
export async function sendDocumentAction(documentId: string): Promise<SendState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to send this agreement." };

  try {
    await sendDocument(documentId, { userId: session.user.id });
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/documents/${documentId}`);
  return { error: null };
}
