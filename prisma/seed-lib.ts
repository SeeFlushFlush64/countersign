import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { DocumentStatus, PartyRole, Role } from "../src/generated/prisma/enums";
import type { TemplateType } from "../src/generated/prisma/enums";
import {
  createDocument,
  sendDocument,
  recordView,
  signAsSigner,
} from "../src/lib/documents";

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
export const DEMO_LOGIN_PASSWORD = "countersign-demo";

const HOUR = 60 * 60 * 1000;

// Offsets from a document's creation, in hours.
export const SCHEDULE = {
  sent: 0.25,
  counterpartyViewed: 2,
  counterpartySigned: 3,
  companySigned: 26,
} as const;

export type SeedStage = "draft" | "sent" | "counterpartySigned" | "executed";

export type SeedDocument = {
  senderEmail: string;
  templateType: TemplateType;
  title: string;
  counterpartyName: string;
  counterpartyEmail: string;
  stage: SeedStage;
  createdHoursAgo: number;
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
];

const STAGE_FOR_STATUS: Record<DocumentStatus, SeedStage> = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIALLY_SIGNED: "counterpartySigned",
  FULLY_EXECUTED: "executed",
};

// The last lifecycle step each stage reaches, as an offset from creation.
const LAST_STEP_HOURS: Record<SeedStage, number> = {
  draft: 0,
  sent: SCHEDULE.sent,
  counterpartySigned: SCHEDULE.counterpartySigned,
  executed: SCHEDULE.companySigned,
};

export type SeedReport = {
  created: string[];
  skipped: string[];
  mismatched: { title: string; expected: SeedStage; actual: SeedStage }[];
  duplicated: string[];
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

function scriptSignature(name: string): string {
  const fontSize = 44;
  const width = Math.max(260, name.length * fontSize * 0.62);
  const height = 110;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="8" y="${height - 40}" font-family="Segoe Script, Brush Script MT, cursive" font-size="${fontSize}" fill="#0c1116">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function signerFor(documentId: string, partyRole: PartyRole) {
  return prisma.signer.findFirstOrThrow({ where: { documentId, partyRole } });
}

async function seedDocument(
  spec: SeedDocument,
  senderId: string,
  anchor: Date,
  report: SeedReport,
  log: (line: string) => void,
) {
  const existing = await prisma.document.findMany({
    where: { title: spec.title, senderId },
    select: { status: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing.length > 0) {
    if (existing.length > 1) {
      report.duplicated.push(spec.title);
      log(`  ! ${spec.title}: ${existing.length} copies exist (left untouched)`);
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
      templateType: spec.templateType,
      title: spec.title,
      counterpartyName: spec.counterpartyName,
      counterpartyEmail: spec.counterpartyEmail,
    },
    { now: createdAt },
  );

  if (spec.stage !== "draft") {
    await sendDocument(document.id, { now: at(SCHEDULE.sent) });
  }

  if (spec.stage === "counterpartySigned" || spec.stage === "executed") {
    // Sequential signing: the counterparty views and signs first…
    const counterparty = await signerFor(document.id, PartyRole.COUNTERPARTY);
    await recordView(counterparty.id, { now: at(SCHEDULE.counterpartyViewed) });
    await signAsSigner(counterparty.id, scriptSignature(counterparty.name), {
      now: at(SCHEDULE.counterpartySigned),
    });
  }

  if (spec.stage === "executed") {
    // …and only then can the company countersign.
    const company = await signerFor(document.id, PartyRole.COMPANY);
    await signAsSigner(company.id, scriptSignature(company.name), {
      now: at(SCHEDULE.companySigned),
    });
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

  const report: SeedReport = { created: [], skipped: [], mismatched: [], duplicated: [] };

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

  log("Seeding demo login…");
  const demoSenderId = senderIds.get(SEED_SENDERS[0].email)!;
  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_LOGIN_EMAIL },
  });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: DEMO_LOGIN_EMAIL,
        passwordHash: await bcrypt.hash(DEMO_LOGIN_PASSWORD, 10),
        senderId: demoSenderId,
      },
    });
  } else if (
    !(await bcrypt.compare(DEMO_LOGIN_PASSWORD, existingUser.passwordHash))
  ) {
    // Keep the published demo credentials working.
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash: await bcrypt.hash(DEMO_LOGIN_PASSWORD, 10) },
    });
  }

  log("Seeding documents…");
  for (const spec of SEED_DOCUMENTS) {
    await seedDocument(spec, senderIds.get(spec.senderEmail)!, anchor, report, log);
  }

  return report;
}
