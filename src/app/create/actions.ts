"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createDocument } from "@/lib/documents";
import { TemplateType } from "@/generated/prisma/enums";
import type { TemplateType as TemplateTypeT } from "@/generated/prisma/enums";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { auth } from "@/auth";

const templateTypeValues = Object.values(TemplateType) as [
  TemplateTypeT,
  ...TemplateTypeT[],
];

const schema = z.object({
  templateType: z.enum(templateTypeValues),
  title: z.string().optional(),
  counterpartyName: z.string().min(1, "Counterparty name is required."),
  counterpartyEmail: z.string().email("Enter a valid email address."),
});

export type CreateDocumentState = { error: string | null };

export async function createDocumentAction(
  _prevState: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  // senderId comes from the authenticated session, never from client input —
  // a submitted form field would let anyone send documents as any sender.
  const session = await auth();
  if (!session?.user.senderId) {
    return { error: "You must be signed in to create a document." };
  }

  const parsed = schema.safeParse({
    templateType: formData.get("templateType"),
    title: formData.get("title") || undefined,
    counterpartyName: formData.get("counterpartyName"),
    counterpartyEmail: formData.get("counterpartyEmail"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const data = parsed.data;
  const title =
    data.title?.trim() ||
    `${TEMPLATE_TYPE_LABELS[data.templateType]} — ${data.counterpartyName}`;

  const document = await createDocument({
    senderId: session.user.senderId,
    templateType: data.templateType,
    title,
    counterpartyName: data.counterpartyName,
    counterpartyEmail: data.counterpartyEmail,
  });

  redirect(`/documents/${document.id}`);
}
