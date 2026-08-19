"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signAsSigner, recordView, DocumentFlowError } from "@/lib/documents";

export type SignState = { error: string | null };

export async function recordViewAction(signerId: string) {
  await recordView(signerId);
  revalidatePath("/activity");
}

export async function signAction(
  signerId: string,
  signatureData: string,
): Promise<SignState> {
  try {
    await signAsSigner(signerId, signatureData);
  } catch (err) {
    if (err instanceof DocumentFlowError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect(`/sign/${signerId}`);
}
