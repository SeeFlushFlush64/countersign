"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { countersign, DocumentFlowError } from "@/lib/documents";

export type CountersignState = { error: string | null };

// The only path to a company countersignature. The caller's identity comes
// from the session, never from the request body; countersign() then checks
// that this user is the agreement's designated, still-authorized signatory.
// A page-level or proxy check does not protect a Server Action, so the
// session is verified here, inside the action.
export async function countersignAction(
  documentId: string,
  expectedSha256: string,
  signature: string,
): Promise<CountersignState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Sign in to countersign." };
  }

  try {
    await countersign(documentId, { userId: session.user.id }, { signature, expectedSha256 });
  } catch (err) {
    if (err instanceof DocumentFlowError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}
