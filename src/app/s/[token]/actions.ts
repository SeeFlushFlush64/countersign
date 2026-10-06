"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DocumentFlowError, signWithLink } from "@/lib/documents";
import { requestContext } from "@/lib/request-context";
import { signingPath } from "@/lib/signing-links";

export type SignState = { error: string | null };

// Public by design: the counterparty has no account, and the signing link is
// their credential. signWithLink enforces everything — the link must be the
// agreement's current, unexpired, unrevoked link, the agreement must be
// awaiting the counterparty, the signature must be a valid PNG, and it must be
// bound to the frozen SHA-256 the signer was shown.
export async function signLinkAction(
  token: string,
  expectedSha256: string,
  signature: string,
): Promise<SignState> {
  // Not a security boundary (anyone holding the link can use another
  // browser), but it stops a company user from signing as the counterparty
  // by accident.
  const session = await auth();
  if (session?.user?.id) {
    return {
      error:
        "You're signed in to Countersign as a company user. The counterparty must sign from their own browser.",
    };
  }

  try {
    await signWithLink(token, { signature, expectedSha256 }, await requestContext());
  } catch (err) {
    if (err instanceof DocumentFlowError) return { error: err.message };
    throw err;
  }

  redirect(signingPath(token));
}
