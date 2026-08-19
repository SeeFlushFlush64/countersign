"use server";

import { revalidatePath } from "next/cache";
import { sendDocument } from "@/lib/documents";

export async function sendDocumentAction(documentId: string) {
  await sendDocument(documentId);
  revalidatePath(`/documents/${documentId}`);
}
