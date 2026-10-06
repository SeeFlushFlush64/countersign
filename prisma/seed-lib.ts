import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { DocumentStatus, PartyRole, Role } from "../src/generated/prisma/enums";
import type { TemplateType } from "../src/generated/prisma/enums";
import {
  countersign,
  createDocument,
  voidDocument,
  recordLinkView,
  sendDocument,
  signWithLink,
} from "../src/lib/documents";
import { signatureDataUrl } from "./png-signature";

// Deterministic, re-runnable demo data.
//
// Deterministic: every timestamp is derived from one explicit anchor, and each
// document is driven through the real lifecycle functions at those times via
// their injected clock, so the counterparty-before-company rule is exercised
// (never bypassed) and the dates printed in each PDF are the dates stored in
// the rows. The same anchor always yields the same rows and timestamps.
//
// Re-runnable: senders and the demo login are upserted, and a document that
// already exists (same title + sender) is never modified. If an existing
// document is not in the stage this seed would have left it in, it is
// reported as a mismatch rather than silently skipped or "repaired".

export const DEMO_LOGIN_EMAIL = "demo@countersign.dev";
export const DEMO_PARALEGAL_EMAIL = "paralegal@countersign.dev";
export const DEMO_LOGIN_PASSWORD = "countersign-demo";

// Two published demo accounts: a signatory who countersigns every seeded
// agreement, and a non-signatory who is refused at countersignature.
export const DEMO_USERS = [
  { email: DEMO_LOGIN_EMAIL, senderEmail: "dana.whitfield@northlightmedia.com", isSignatory: true },
  { email: DEMO_PARALEGAL_EMAIL, senderEmail: "tomas.reyes@northlightmedia.com", isSignatory: false },
] as const;

const HOUR = 60 * 60 * 1000;

// Offsets from a document's creation, in hours.
export const SCHEDULE = {
  sent: 0.25,
  counterpartyViewed: 2,
  counterpartySigned: 3,
  companySigned: 26,
  voided: 30,
} as const;

export type SeedStage = "draft" | "sent" | "counterpartySigned" | "executed" | "voided";

export type SeedDocument = {
  senderEmail: string;
  templateType: TemplateType;
  title: string;
  counterpartyName: string;
  counterpartyEmail: string;
  stage: SeedStage;
  createdHoursAgo: number;
  // Required for stage "voided".
  voidReason?: string;
};

export const SEED_SENDERS = [
  { name: "Dana Whitfield", email: "dana.whitfield@northlightmedia.com", role: Role.GENERAL_COUNSEL },
  { name: "Marcus Ilori", email: "marcus.ilori@northlightmedia.com", role: Role.CONTRACTS_MANAGER },
  { name: "Priya Anand", email: "priya.anand@northlightmedia.com", role: Role.BUSINESS_AFFAIRS },
  { name: "Tomás Reyes", email: "tomas.reyes@northlightmedia.com", role: Role.PARALEGAL },
];

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    senderEmail: "dana.whitfield@northlightmedia.com",
    templateType: "NDA",
    title: "Mutual NDA — Ashgrove Creative LLC",
    counterpartyName: "Ashgrove Creative LLC",
    counterpartyEmail: "hello@ashgrovecreative.com",
    stage: "executed",
    createdHoursAgo: 11 * 24,
  },
  {
    senderEmail: "marcus.ilori@northlightmedia.com",
    templateType: "VENDOR_AGREEMENT",
    title: "Vendor Services Agreement — Petrel Logistics Co.",
    counterpartyName: "Petrel Logistics Co.",
    counterpartyEmail: "contracts@petrellogistics.com",
    stage: "counterpartySigned",
    createdHoursAgo: 4 * 24,
  },
  {
    senderEmail: "priya.anand@northlightmedia.com",
    templateType: "MEDIA_RELEASE",
    title: "Media Release — Jordan Vance",
    counterpartyName: "Jordan Vance",
    counterpartyEmail: "jordan.vance@example.com",
    stage: "sent",
    createdHoursAgo: 2 * 24,
  },
  {
    senderEmail: "tomas.reyes@northlightmedia.com",
    templateType: "LICENSING_ORDER",
    title: "Content Licensing Order — Fenwick Sound Library",
    counterpartyName: "Fenwick Sound Library",
    counterpartyEmail: "licensing@fenwicksound.com",
    stage: "draft",
    createdHoursAgo: 3,
  },
  {
    senderEmail: "marcus.ilori@northlightmedia.com",
    templateType: "NDA",
    title: "Mutual NDA — Blackwood Studio Rentals",
    counterpartyName: "Blackwood Studio Rentals",
    counterpartyEmail: "studio@blackwoodrentals.com",
    stage: "executed",
    createdHoursAgo: 8 * 24,
  },
  {
    senderEmail: "priya.anand@northlightmedia.com",
    templateType: "VENDOR_AGREEMENT",
    title: "Vendor Services Agreement — Halcyon Catering Co.",
    counterpartyName: "Halcyon Catering Co.",
    counterpartyEmail: "events@halcyon-catering.example",
    stage: "voided",
    createdHoursAgo: 6 * 24,
    voidReason: "Counterparty's legal entity name was wrong; a corrected agreement will be sent.",
  },
];

const STAGE_FOR_STATUS: Record<DocumentStatus, SeedStage> = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIALLY_SIGNED: "counterpartySigned",
  FULLY_EXECUTED: "executed",
  VOIDED: "voided",
};

// The last lifecycle step each stage reaches, as an offset from creation.
const LAST_STEP_HOURS: Record<SeedStage, number> = {
  draft: 0,
  sent: SCHEDULE.sent,
  counterpartySigned: SCHEDULE.counterpartySigned,
  executed: SCHEDULE.companySigned,
  voided: SCHEDULE.voided,
};

export type SeedReport = {
  created: string[];
  skipped: string[];
  mismatched: { title: string; expected: SeedStage; actual: SeedStage }[];
  duplicated: string[];
  // Existing seeded agreements given a countersigner (the column was added
  // after they were created).
  backfilled: string[];
};

// The CLI's default anchor: the start of the current UTC hour, so a re-run
// within the same hour reproduces identical timestamps.
export function seedAnchorFor(date: Date): Date {
  const anchor = new Date(date);
  anchor.setUTCMinutes(0, 0, 0);
  return anchor;
}

export function documentCreatedAt(spec: SeedDocument, anchor: Date): Date {
  return new Date(anchor.getTime() - spec.createdHoursAgo * HOUR);
}

async function signerFor(documentId: string, partyRole: PartyRole) {
  return prisma.signer.findFirstOrThrow({ where: { documentId, partyRole } });
}

async function seedDocument(
  spec: SeedDocument,
  senderId: string,
  signatoryUserId: string,
  creatorUserId: string | undefined,
  anchor: Date,
  report: SeedReport,
  log: (line: string) => void,
) {
  const existing = await prisma.document.findMany({
    where: { title: spec.title, senderId },
    select: { id: true, status: true, countersignerId: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing.length > 0) {
    if (existing.length > 1) {
      report.duplicated.push(spec.title);
      log(`  ! ${spec.title}: ${existing.length} copies exist (left untouched)`);
    }
    if (!existing[0].countersignerId) {
      await prisma.document.update({
        where: { id: existing[0].id },
        data: { countersignerId: signatoryUserId },
      });
      report.backfilled.push(spec.title);
      log(`  ~ ${spec.title}: countersigner assigned`);
    }
    const actual = STAGE_FOR_STATUS[existing[0].status];
    if (actual !== spec.stage) {
      report.mismatched.push({ title: spec.title, expected: spec.stage, actual });
      log(`  ! ${spec.title}: exists as ${actual}, seed expects ${spec.stage} (left untouched)`);
    } else {
      report.skipped.push(spec.title);
      log(`  = ${spec.title} (already present, skipped)`);
    }
    return;
  }

  const createdAt = documentCreatedAt(spec, anchor);
  const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);

  const document = await createDocument(
    {
      senderId,
      countersignerId: signatoryUserId,
      // Recorded as the sender's own login where one exists, otherwise as a
      // SYSTEM (seed) event.
      createdByUserId: creatorUserId,
      templateType: spec.templateType,
      title: spec.title,
      counterpartyName: spec.counterpartyName,
      counterpartyEmail: spec.counterpartyEmail,
    },
    { now: createdAt },
  );

  const signatory = { userId: signatoryUserId };
  let frozenSha256 = "";
  let signingToken = "";
  let signingLinkId = "";
  if (spec.stage !== "draft") {
    ({ frozenSha256, signingToken, signingLinkId } = await sendDocument(document.id, signatory, {
      now: at(SCHEDULE.sent),
    }));
  }

  if (spec.stage === "counterpartySigned" || spec.stage === "executed") {
    // Sequential signing: the counterparty opens their link and signs
    // first… (the token is used here and never printed or stored)
    const counterparty = await signerFor(document.id, PartyRole.COUNTERPARTY);
    await recordLinkView(signingLinkId, {}, { now: at(SCHEDULE.counterpartyViewed) });
    await signWithLink(
      signingToken,
      { signature: signatureDataUrl(counterparty.name), expectedSha256: frozenSha256 },
      {},
      { now: at(SCHEDULE.counterpartySigned) },
    );
  }

  if (spec.stage === "executed") {
    // …and only then can the designated company signatory countersign.
    const company = await signerFor(document.id, PartyRole.COMPANY);
    const artifact = await countersign(
      document.id,
      signatory,
      { signature: signatureDataUrl(company.name), expectedSha256: frozenSha256 },
      { now: at(SCHEDULE.companySigned) },
    );
    if (artifact.status !== "READY") {
      throw new Error(`Executed PDF for "${spec.title}" is ${artifact.status}.`);
    }
  }

  if (spec.stage === "voided") {
    // Sent, then voided by the designated signatory with a reason.
    await voidDocument(document.id, signatory, spec.voidReason, { now: at(SCHEDULE.voided) });
  }

  report.created.push(spec.title);
  log(`  + ${spec.title} (${spec.stage})`);
}

export async function seed({
  anchor,
  log = console.log,
}: {
  anchor: Date;
  log?: (line: string) => void;
}): Promise<SeedReport> {
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("Seed anchor is not a valid date.");
  }
  // A schedule that ends after the anchor would put events in the future.
  for (const spec of SEED_DOCUMENTS) {
    if (spec.createdHoursAgo < LAST_STEP_HOURS[spec.stage]) {
      throw new Error(`Seed schedule for "${spec.title}" ends after the anchor.`);
    }
  }

  const report: SeedReport = {
    created: [],
    skipped: [],
    mismatched: [],
    duplicated: [],
    backfilled: [],
  };

  log("Seeding senders…");
  const senderIds = new Map<string, string>();
  for (const sender of SEED_SENDERS) {
    const row = await prisma.sender.upsert({
      where: { email: sender.email },
      update: { name: sender.name, role: sender.role },
      create: sender,
    });
    senderIds.set(sender.email, row.id);
  }

  log("Seeding demo logins…");
  const userIds = new Map<string, string>();
  for (const demo of DEMO_USERS) {
    const senderId = senderIds.get(demo.senderEmail)!;
    const existingUser = await prisma.user.findUnique({ where: { email: demo.email } });
    if (!existingUser) {
      const created = await prisma.user.create({
        data: {
          email: demo.email,
          passwordHash: await bcrypt.hash(DEMO_LOGIN_PASSWORD, 10),
          senderId,
          isSignatory: demo.isSignatory,
        },
      });
      userIds.set(demo.email, created.id);
      continue;
    }
    // Keep the published demo credentials and roles as documented.
    const passwordOk = await bcrypt.compare(DEMO_LOGIN_PASSWORD, existingUser.passwordHash);
    if (!passwordOk || existingUser.isSignatory !== demo.isSignatory) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          isSignatory: demo.isSignatory,
          ...(passwordOk ? {} : { passwordHash: await bcrypt.hash(DEMO_LOGIN_PASSWORD, 10) }),
        },
      });
    }
    userIds.set(demo.email, existingUser.id);
  }
  const signatoryUserId = userIds.get(DEMO_LOGIN_EMAIL)!;
  const userIdBySender = new Map(
    DEMO_USERS.map((demo) => [demo.senderEmail as string, userIds.get(demo.email)!]),
  );

  log("Seeding documents…");
  for (const spec of SEED_DOCUMENTS) {
    await seedDocument(
      spec,
      senderIds.get(spec.senderEmail)!,
      signatoryUserId,
      userIdBySender.get(spec.senderEmail),
      anchor,
      report,
      log,
    );
  }

  return report;
}
