"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signAsCounterparty, recordView, DocumentFlowError } from "@/lib/documents";

export type SignState = { error: string | null };

export async function recordViewAction(signerId: string) {
  await recordView(signerId);
  revalidatePath("/activity");
}

// Public by design (the counterparty has no account), so every rule is
// enforced in signAsCounterparty: counterparty role only, agreement awaiting
// the counterparty, signature validated, and bound to the frozen SHA-256 the
// signer was shown.
export async function signAction(
  signerId: string,
  expectedSha256: string,
  signature: string,
): Promise<SignState> {
  try {
    await signAsCounterparty(signerId, { signature, expectedSha256 });
  } catch (err) {
    if (err instanceof DocumentFlowError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect(`/sign/${signerId}`);
}
