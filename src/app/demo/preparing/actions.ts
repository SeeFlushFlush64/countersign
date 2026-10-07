"use server";

import { auth } from "@/auth";
import { ensureFreshDemo } from "@/lib/demo/epochs";

export type PrepareResult = { ok: true } | { ok: false; error: string };

// Runs the lazy demo reset if it is (still) due. Safe to call from any
// number of tabs at once: one reset runs, the others wait for it, and an
// untouched demo is left as it is.
export async function prepareDemoAction(): Promise<PrepareResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Your session ended. Sign in again." };
  try {
    await ensureFreshDemo();
    return { ok: true };
  } catch (error) {
    console.error(`Demo reset failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error: "A fresh demo could not be prepared. The previous one is still available." };
  }
}
