import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  createDocument,
  sendDocument,
  signWithLink,
} from "@/lib/documents";
import { DocumentFlowError } from "@/lib/documents";
import { PartyRole, Role } from "@/generated/prisma/enums";
import { signatureDataUrl } from "../../prisma/png-signature";

export const COUNTERPARTY_SIGNATURE = signatureDataUrl("Counterparty Co");
export const COMPANY_SIGNATURE = signatureDataUrl("Sam Signatory");

export type CompanyUser = { userId: string; senderId: string; name: string };

async function makeUser(name: string, role: Role, isSignatory: boolean): Promise<CompanyUser> {
  const tag = randomBytes(3).toString("hex");
  const sender = await prisma.sender.create({
    data: { name, email: `${tag}.${role.toLowerCase()}@test.example`, role },
  });
  const user = await prisma.user.create({
    data: {
      email: `${tag}.login@test.example`,
      passwordHash: "not-a-real-hash",
      senderId: sender.id,
      isSignatory,
    },
  });
  return { userId: user.id, senderId: sender.id, name };
}

// A small company: the designated signatory, a paralegal who sends but may
// not countersign, and a second signatory who is not designated on the
// agreements created here.
export async function makeCompany() {
  return {
    signatory: await makeUser("Sam Signatory", Role.GENERAL_COUNSEL, true),
    paralegal: await makeUser("Pat Paralegal", Role.PARALEGAL, false),
    otherSignatory: await makeUser("Olive Other", Role.CONTRACTS_MANAGER, true),
  };
}

export type Company = Awaited<ReturnType<typeof makeCompany>>;
export type Stage = "draft" | "sent" | "counterpartySigned" | "executed";

export async function makeAgreement(
  company: Company,
  stage: Stage,
  overrides: Partial<{ title: string; counterpartyName: string }> = {},
) {
  const document = await createDocument({
    senderId: company.paralegal.senderId,
    countersignerId: company.signatory.userId,
    templateType: "NDA",
    title: overrides.title ?? "Test agreement",
    counterpartyName: overrides.counterpartyName ?? "Counterparty Co",
    counterpartyEmail: "cp@test.example",
  });
  const signers = await prisma.signer.findMany({ where: { documentId: document.id } });
  const ids = {
    id: document.id,
    counterpartySignerId: signers.find((s) => s.partyRole === PartyRole.COUNTERPARTY)!.id,
    companySignerId: signers.find((s) => s.partyRole === PartyRole.COMPANY)!.id,
    frozenSha256: "",
    // The counterparty's signing-link token (shown once, at send).
    token: "",
    linkId: "",
  };
  if (stage === "draft") return ids;

  const sent = await sendDocument(document.id, { userId: company.paralegal.userId });
  ids.frozenSha256 = sent.frozenSha256;
  ids.token = sent.signingToken;
  ids.linkId = sent.signingLinkId;
  if (stage === "sent") return ids;

  await signWithLink(ids.token, {
    signature: COUNTERPARTY_SIGNATURE,
    expectedSha256: ids.frozenSha256,
  });
  if (stage === "counterpartySigned") return ids;

  await countersign(document.id, { userId: company.signatory.userId }, {
    signature: COMPANY_SIGNATURE,
    expectedSha256: ids.frozenSha256,
  });
  return ids;
}

export async function stateOf(id: string) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    include: { signers: true, statusEvents: true, artifacts: true },
  });
  const events = (type: string) =>
    document.statusEvents.filter((e) => e.eventType === type).length;
  return {
    status: document.status,
    counterpartySignedAt: document.counterpartySignedAt,
    countersignedAt: document.countersignedAt,
    completedAt: document.completedAt,
    signerSignedAt: Object.fromEntries(
      document.signers.map((s) => [s.partyRole, s.signedAt]),
    ) as Record<PartyRole, Date | null>,
    events: { SENT: events("SENT"), SIGNED: events("SIGNED"), FULLY_EXECUTED: events("FULLY_EXECUTED") },
    artifacts: document.artifacts.map((a) => ({ kind: a.kind, status: a.status })),
  };
}

// Settles concurrent attempts and classifies each outcome. Anything other than
// success or a DocumentFlowError (e.g. a raw database error) is surfaced so a
// test fails loudly on it.
export async function race<T>(attempts: (() => Promise<T>)[]) {
  const results = await Promise.allSettled(attempts.map((attempt) => attempt()));
  const unexpected = results.filter(
    (r) => r.status === "rejected" && !(r.reason instanceof DocumentFlowError),
  );
  return {
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    rejected: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason as Error),
    unexpected: unexpected.map((r) => String((r as PromiseRejectedResult).reason)),
  };
}
