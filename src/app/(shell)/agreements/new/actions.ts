"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createDocument, DocumentFlowError } from "@/lib/documents";
import { TemplateType } from "@/generated/prisma/enums";
import type { TemplateType as TemplateTypeT } from "@/generated/prisma/enums";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { agreementInputSchema, firstIssue, normalizeText } from "@/lib/validation";
import { auth } from "@/auth";

const templateTypeValues = Object.values(TemplateType) as [
  TemplateTypeT,
  ...TemplateTypeT[],
];

const formSchema = z.object({
  templateType: z.enum(templateTypeValues, { error: "Choose a template." }),
  countersignerId: z.string().min(1, "Choose who will countersign."),
});

export type CreateDocumentState = { error: string | null };

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function createDocumentAction(
  _prevState: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  // senderId and the creator come from the authenticated session, never from
  // client input — a submitted form field would let anyone create documents
  // as any sender.
  const session = await auth();
  if (!session?.user?.id || !session.user.senderId) {
    return { error: "You must be signed in to create a document." };
  }

  const form = formSchema.safeParse({
    templateType: formData.get("templateType"),
    countersignerId: formData.get("countersignerId"),
  });
  if (!form.success) return { error: firstIssue(form.error) };

  // An empty title is replaced with "<template> — <counterparty>"; every
  // field is then trimmed, whitespace-collapsed and length-checked by the
  // same rules createDocument enforces.
  const counterpartyName = normalizeText(field(formData, "counterpartyName"));
  const title =
    normalizeText(field(formData, "title")) ||
    `${TEMPLATE_TYPE_LABELS[form.data.templateType]} — ${counterpartyName}`;
  const input = agreementInputSchema.safeParse({
    title,
    counterpartyName,
    counterpartyEmail: field(formData, "counterpartyEmail"),
  });
  if (!input.success) return { error: firstIssue(input.error) };

  let document;
  try {
    document = await createDocument({
      senderId: session.user.senderId,
      createdByUserId: session.user.id,
      // Validated server-side: createDocument refuses non-signatories.
      countersignerId: form.data.countersignerId,
      templateType: form.data.templateType,
      ...input.data,
    });
  } catch (error) {
    if (error instanceof DocumentFlowError) return { error: error.message };
    throw error;
  }

  redirect(`/agreements/${document.id}`);
}
