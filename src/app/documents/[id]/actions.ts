"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  DocumentFlowError,
  reissueSigningLink,
  sendDocument,
  voidDocument,
} from "@/lib/documents";
import { signingPath } from "@/lib/signing-links";

// Send and reissue return the counterparty's signing link exactly once: only
// a hash of it is stored, so it cannot be shown again later (reissue to get a
// new one). Every action verifies the session itself — a Server Action is its
// own entry point and can be invoked directly.

export type LinkState = { error: string | null; signingPath: string | null };
export type VoidState = { error: string | null; voided: boolean };

async function sessionUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function sendDocumentAction(documentId: string): Promise<LinkState> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Sign in to send this agreement.", signingPath: null };

  try {
    const { signingToken } = await sendDocument(documentId, { userId });
    revalidatePath(`/documents/${documentId}`);
    return { error: null, signingPath: signingPath(signingToken) };
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message, signingPath: null };
    throw err;
  }
}

// expectedLinkId is the link the page showed when it rendered: only one
// request can replace it, so repeated clicks yield one new link.
export async function reissueLinkAction(
  documentId: string,
  expectedLinkId: string | null,
): Promise<LinkState> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Sign in to reissue the signing link.", signingPath: null };

  try {
    const { signingToken } = await reissueSigningLink(documentId, { userId }, { expectedLinkId });
    revalidatePath(`/documents/${documentId}`);
    return { error: null, signingPath: signingPath(signingToken) };
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message, signingPath: null };
    throw err;
  }
}

export async function voidDocumentAction(
  documentId: string,
  _state: VoidState,
  formData: FormData,
): Promise<VoidState> {
  const userId = await sessionUserId();
  if (!userId) return { error: "Sign in to void this agreement.", voided: false };

  try {
    await voidDocument(documentId, { userId }, formData.get("reason"));
    revalidatePath(`/documents/${documentId}`);
    return { error: null, voided: true };
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message, voided: false };
    throw err;
  }
}
