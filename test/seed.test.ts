import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { DocumentStatus, PartyRole } from "@/generated/prisma/enums";
import {
  DEMO_LOGIN_EMAIL,
  DEMO_LOGIN_PASSWORD,
  SCHEDULE,
  SEED_DOCUMENTS,
  SEED_SENDERS,
  documentCreatedAt,
  seed,
  seedAnchorFor,
} from "../prisma/seed-lib";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

beforeAll(expectPrivateEmptyDatabase);

const ANCHOR = new Date("2026-03-02T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const quiet = () => {};

const EXPECTED_STATUS = {
  draft: DocumentStatus.DRAFT,
  sent: DocumentStatus.SENT,
  counterpartySigned: DocumentStatus.PARTIALLY_SIGNED,
  executed: DocumentStatus.FULLY_EXECUTED,
} as const;

async function snapshot() {
  const [documents, signers, events, senders, users] = await Promise.all([
    prisma.document.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        sentAt: true,
        completedAt: true,
      },
    }),
    prisma.signer.findMany({
      orderBy: { id: "asc" },
      select: { id: true, signedAt: true },
    }),
    prisma.statusEvent.findMany({
      orderBy: { id: "asc" },
      select: { id: true, eventType: true, timestamp: true },
    }),
    prisma.sender.findMany({ orderBy: { email: "asc" } }),
    prisma.user.findMany({ orderBy: { email: "asc" } }),
  ]);
  return { documents, signers, events, senders, users };
}

describe("seed", () => {
  it("is deterministic for a given anchor and idempotent across runs", async () => {
    const first = await seed({ anchor: ANCHOR, log: quiet });
    expect(first.created).toHaveLength(SEED_DOCUMENTS.length);
    expect(first.skipped).toHaveLength(0);
    expect(first.mismatched).toHaveLength(0);
    expect(first.duplicated).toHaveLength(0);

    const afterFirst = await snapshot();
    expect(afterFirst.senders).toHaveLength(SEED_SENDERS.length);
    expect(afterFirst.users).toHaveLength(1);

    // Every row sits exactly where the schedule puts it.
    for (const spec of SEED_DOCUMENTS) {
      const row = await prisma.document.findFirstOrThrow({
        where: { title: spec.title },
        include: { signers: true, statusEvents: true },
      });
      const createdAt = documentCreatedAt(spec, ANCHOR);
      const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);

      expect(row.status).toBe(EXPECTED_STATUS[spec.stage]);
      expect(row.createdAt).toEqual(createdAt);
      expect(row.pdfData?.length ?? 0).toBeGreaterThan(0);
      expect(row.sentAt).toEqual(spec.stage === "draft" ? null : at(SCHEDULE.sent));
      expect(row.completedAt).toEqual(
        spec.stage === "executed" ? at(SCHEDULE.companySigned) : null,
      );

      const counterparty = row.signers.find((s) => s.partyRole === PartyRole.COUNTERPARTY)!;
      const company = row.signers.find((s) => s.partyRole === PartyRole.COMPANY)!;
      const counterpartySigned = spec.stage === "counterpartySigned" || spec.stage === "executed";
      expect(counterparty.signedAt).toEqual(
        counterpartySigned ? at(SCHEDULE.counterpartySigned) : null,
      );
      expect(company.signedAt).toEqual(
        spec.stage === "executed" ? at(SCHEDULE.companySigned) : null,
      );

      // No event is dated after the anchor.
      for (const event of row.statusEvents) {
        expect(event.timestamp.getTime()).toBeLessThanOrEqual(ANCHOR.getTime());
      }
    }

    const second = await seed({ anchor: ANCHOR, log: quiet });
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(SEED_DOCUMENTS.length);
    expect(second.mismatched).toHaveLength(0);

    // The second run changed nothing at all.
    expect(await snapshot()).toEqual(afterFirst);

    const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_LOGIN_EMAIL } });
    expect(await bcrypt.compare(DEMO_LOGIN_PASSWORD, demoUser.passwordHash)).toBe(true);
  });

  it("reports a drifted document instead of skipping or rewriting it", async () => {
    // Runs after the first test in the same file database.
    const spec = SEED_DOCUMENTS.find((d) => d.stage === "sent")!;
    const row = await prisma.document.findFirstOrThrow({ where: { title: spec.title } });
    await prisma.document.update({
      where: { id: row.id },
      data: { status: DocumentStatus.DRAFT },
    });
    const before = await snapshot();

    const report = await seed({ anchor: ANCHOR, log: quiet });
    expect(report.created).toHaveLength(0);
    expect(report.mismatched).toEqual([
      { title: spec.title, expected: "sent", actual: "draft" },
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it("anchors the CLI default to the start of the current UTC hour", () => {
    expect(seedAnchorFor(new Date("2026-03-02T12:34:56.789Z"))).toEqual(
      new Date("2026-03-02T12:00:00.000Z"),
    );
  });
});
