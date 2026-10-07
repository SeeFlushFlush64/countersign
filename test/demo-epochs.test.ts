import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  createDocument,
  DocumentFlowError,
  loadAgreementPdf,
  loadLinkPdf,
  reissueSigningLink,
  sendDocument,
  signWithLink,
  voidDocument,
} from "@/lib/documents";
import {
  countNeedingCountersign,
  getAgreementDetail,
  getCountersignView,
  getSigningRoom,
  listAgreements,
  listAuditEvents,
  listOutbox,
} from "@/lib/queries";
import { currentEpoch, ensureFreshDemo, isResetDue, resetRecentlyFailed } from "@/lib/demo/epochs";
import { DEMO_EPOCH_CLOSED_MESSAGE } from "@/lib/demo/errors";
import { EXAMPLE_DOMAIN_MESSAGE, isReservedExampleEmail } from "@/lib/demo/example-domains";
import type { DemoSettings } from "@/lib/demo/settings";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import {
  COMPANY_SIGNATURE,
  COUNTERPARTY_SIGNATURE,
  type Company,
  makeAgreement,
  makeCompany,
  race,
} from "./helpers/agreements";

// Phase F: the public demo starts fresh by creating a new epoch, never by
// deleting. The database enforces the epoch boundary and each demo epoch's
// limits; the lazy reset replaces only a demo that was used and then left
// idle, once, however many visitors arrive at the same moment.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const MINUTE = 60_000;
const settings = (overrides: Partial<DemoSettings> = {}): DemoSettings => ({
  enabled: true,
  idleMs: 30 * MINUTE,
  agreementLimit: 30,
  linkLimit: 60,
  leaseMs: 60_000,
  failureCooldownMs: 5 * MINUTE,
  ...overrides,
});
const noSeed = async () => {};

// Starts a new, empty demo epoch with the given limits and makes it current.
async function freshDemoEpoch(overrides: Partial<DemoSettings> = {}) {
  const result = await ensureFreshDemo({ force: true, settings: settings(overrides), seedEpoch: noSeed });
  if (result.outcome !== "reset") throw new Error(`expected a reset, got ${result.outcome}`);
  return result.epochId;
}

function draft(counterpartyEmail = "legal@acme.example", extra: { epochId?: number } = {}) {
  return createDocument(
    {
      senderId: company.paralegal.senderId,
      createdByUserId: company.paralegal.userId,
      countersignerId: company.signatory.userId,
      templateType: "NDA",
      title: "Demo agreement",
      counterpartyName: "Acme",
      counterpartyEmail,
      ...extra,
    },
    {},
    { deferPreview: true },
  );
}

const epochRow = (id: number) => prisma.demoEpoch.findUniqueOrThrow({ where: { id } });
const flowError = (error: unknown) => (error instanceof DocumentFlowError ? error.message : `unexpected: ${error}`);

describe("the database enforces each demo epoch's limits", () => {
  it("new agreements join the current epoch, up to its limit, even when created concurrently", async () => {
    const epochId = await freshDemoEpoch({ agreementLimit: 3 });

    const outcome = await race(Array.from({ length: 6 }, () => () => draft()));
    expect(outcome.unexpected).toEqual([]);
    expect(outcome.succeeded).toBe(3);
    expect(outcome.rejected.map((e) => e.message)).toEqual(
      Array(3).fill(expect.stringMatching(/^The demo has reached its limit of new agreements/)),
    );
    expect(await prisma.document.count({ where: { epochId } })).toBe(3);
    expect((await epochRow(epochId)).agreementCount).toBe(3);
  });

  it("caps signing links per epoch, including the one issued at send", async () => {
    const epochId = await freshDemoEpoch({ linkLimit: 1 });
    const first = await draft();
    const second = await draft();
    await sendDocument(first.id, { userId: company.paralegal.userId });

    const refused = await sendDocument(second.id, { userId: company.paralegal.userId }).catch(flowError);
    expect(refused).toMatch(/^The demo has reached its limit of signing links/);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("DRAFT");
    expect((await epochRow(epochId)).linkCount).toBe(1);
  });

  it("accepts only reserved example domains for counterparties in a demo epoch", async () => {
    await freshDemoEpoch();
    await expect(draft("someone@gmail.com").catch(flowError)).resolves.toBe(EXAMPLE_DOMAIN_MESSAGE);
    await expect(draft("ceo@example.com.evil.io").catch(flowError)).resolves.toBe(EXAMPLE_DOMAIN_MESSAGE);
    await expect(draft("legal@acme.example")).resolves.toMatchObject({ counterpartyEmail: "legal@acme.example" });
  });

  it("agrees with the application on what counts as an example domain", async () => {
    const cases = [
      "a@example.com",
      "a@EXAMPLE.org",
      "a@mail.example.net",
      "a@acme.example",
      "a@corp.test",
      "a@x.invalid",
      "a@dev.localhost",
      "a@example.com.evil.io",
      "a@notexample.com",
      "a@example.co",
      "a@test",
      "a@gmail.com",
      "a@acme-example.com",
    ];
    for (const email of cases) {
      const [{ ok }] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT countersign_is_example_email(${email}) AS ok`;
      expect([email, ok]).toEqual([email, isReservedExampleEmail(email)]);
    }
    expect(cases.filter(isReservedExampleEmail)).toEqual(cases.slice(0, 7));
  });

  it("an agreement never moves to another epoch", async () => {
    await freshDemoEpoch();
    const a = await draft();
    const other = await prisma.demoEpoch.findFirstOrThrow({ where: { status: "RETIRED" } });
    await expect(
      prisma.document.update({ where: { id: a.id }, data: { epochId: other.id } }),
    ).rejects.toThrow(/countersign:demo_epoch_immutable/);
  });
});

describe("a retired epoch is closed, not deleted", () => {
  it("its agreements disappear from every page and link, can no longer change, and keep their audit history", async () => {
    await freshDemoEpoch();
    const waiting = await makeAgreement(company, "counterpartySigned");
    const sent = await makeAgreement(company, "sent");
    const executed = await makeAgreement(company, "executed");
    const ids = [waiting.id, sent.id, executed.id];
    const eventsBefore = await prisma.statusEvent.count({ where: { documentId: { in: ids } } });
    expect(await countNeedingCountersign(company.signatory.userId)).toBe(1);

    await freshDemoEpoch();

    // Gone from every company page…
    expect((await listAgreements()).filter((a) => ids.includes(a.id))).toEqual([]);
    expect(await countNeedingCountersign(company.signatory.userId)).toBe(0);
    for (const id of ids) {
      expect(await getAgreementDetail(id)).toBeNull();
      expect(await getCountersignView(id)).toBeNull();
      expect(await loadAgreementPdf(id)).toBeNull();
    }
    expect((await listOutbox()).filter((m) => ids.includes(m.documentId))).toEqual([]);
    expect((await listAuditEvents()).filter((e) => ids.includes(e.document.id))).toEqual([]);
    expect(await listAuditEvents({ agreementId: waiting.id })).toEqual([]);

    // …and from the counterparty's links.
    expect((await getSigningRoom(sent.token)).link).toEqual({ state: "reset" });
    expect(await loadLinkPdf(executed.token)).toBeNull();
    await expect(
      signWithLink(sent.token, { signature: COUNTERPARTY_SIGNATURE, expectedSha256: sent.frozenSha256 }).catch(
        flowError,
      ),
    ).resolves.toBe(DEMO_EPOCH_CLOSED_MESSAGE);

    // Nothing in it can change, whoever asks.
    const signatory = { userId: company.signatory.userId };
    await expect(
      countersign(waiting.id, signatory, { signature: COMPANY_SIGNATURE, expectedSha256: waiting.frozenSha256 }).catch(
        flowError,
      ),
    ).resolves.toBe(DEMO_EPOCH_CLOSED_MESSAGE);
    await expect(voidDocument(sent.id, signatory, "Closing it").catch(flowError)).resolves.toBe(
      DEMO_EPOCH_CLOSED_MESSAGE,
    );
    await expect(
      reissueSigningLink(sent.id, signatory, { expectedLinkId: sent.linkId }).catch(flowError),
    ).resolves.toBe(DEMO_EPOCH_CLOSED_MESSAGE);
    await expect(
      prisma.document.update({ where: { id: sent.id }, data: { title: "Edited" } }),
    ).rejects.toThrow(/countersign:demo_epoch_closed/);

    // The audit history is all still there, and still append-only.
    expect(await prisma.statusEvent.count({ where: { documentId: { in: ids } } })).toBe(eventsBefore);
    await expect(
      prisma.statusEvent.deleteMany({ where: { documentId: waiting.id } }),
    ).rejects.toThrow(/append-only/);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("PARTIALLY_SIGNED");
  });
});

describe("the lazy reset", () => {
  const at = (date: Date, minutes: number) => new Date(date.getTime() + minutes * MINUTE);

  it("is due only in demo mode, for a non-demo epoch or a used one left idle", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const on = settings();
    expect(isResetDue({ id: 1, isDemo: false, lastActivityAt: null }, now, settings({ enabled: false }))).toBe(false);
    expect(isResetDue({ id: 1, isDemo: false, lastActivityAt: null }, now, on)).toBe(true);
    expect(isResetDue(null, now, on)).toBe(true);
    expect(isResetDue({ id: 2, isDemo: true, lastActivityAt: null }, now, on)).toBe(false);
    expect(isResetDue({ id: 2, isDemo: true, lastActivityAt: at(now, -29) }, now, on)).toBe(false);
    expect(isResetDue({ id: 2, isDemo: true, lastActivityAt: at(now, -30) }, now, on)).toBe(true);
  });

  it("records activity in UTC, whatever time zone the database session uses", async () => {
    // Prisma reads these TIMESTAMP columns as UTC. A trigger stamping the
    // server's local time would put activity hours in the future (never
    // idle) or the past (reset while in use) on any non-UTC database.
    const epochId = await freshDemoEpoch();
    const a = await draft();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("SET TIME ZONE 'Pacific/Kiritimati'"); // UTC+14
      await client.query(`UPDATE "Document" SET "title" = $1 WHERE "id" = $2`, ["Renamed", a.id]);
    } finally {
      await client.end();
    }
    const { lastActivityAt } = await epochRow(epochId);
    expect(Math.abs(lastActivityAt!.getTime() - Date.now())).toBeLessThan(2 * MINUTE);
  });

  it("does nothing outside demo mode", async () => {
    const before = await currentEpoch();
    await expect(ensureFreshDemo({ settings: settings({ enabled: false }), seedEpoch: noSeed })).resolves.toEqual({
      outcome: "disabled",
    });
    expect(await currentEpoch()).toEqual(before);
  });

  it("replaces a used, idle demo with a freshly seeded epoch, and is idempotent", async () => {
    const used = await freshDemoEpoch();
    await draft();
    const { lastActivityAt } = await epochRow(used);
    expect(lastActivityAt).toBeInstanceOf(Date);

    const seeded: number[] = [];
    const seedOne = async (epochId: number) => {
      seeded.push(epochId);
      await draft("legal@seeded.example", { epochId });
    };

    // In use (not idle yet): left alone.
    const soon = () => at(lastActivityAt!, 29);
    await expect(ensureFreshDemo({ settings: settings(), clock: soon, seedEpoch: seedOne })).resolves.toEqual({
      outcome: "not-due",
    });

    // Idle: a new epoch, seeded, becomes current; the used one is retired.
    const later = () => at(lastActivityAt!, 31);
    const result = await ensureFreshDemo({ settings: settings(), clock: later, seedEpoch: seedOne });
    expect(result).toEqual({ outcome: "reset", epochId: seeded[0] });
    expect((await currentEpoch())?.id).toBe(seeded[0]);
    expect(await epochRow(used)).toMatchObject({ status: "RETIRED", currentMarker: null });
    // Seeding did not count as use: the fresh demo is untouched…
    expect(await epochRow(seeded[0])).toMatchObject({ status: "CURRENT", lastActivityAt: null, agreementCount: 1 });
    expect((await listAgreements()).map((a) => a.counterpartyName)).toEqual(["Acme"]);

    // …so another visitor, even much later, does not reset it again.
    const muchLater = () => at(lastActivityAt!, 600);
    await expect(ensureFreshDemo({ settings: settings(), clock: muchLater, seedEpoch: seedOne })).resolves.toEqual({
      outcome: "not-due",
    });
    expect(seeded).toHaveLength(1);
  });

  it("runs once when visitors arrive together: the others wait for it", async () => {
    const used = await freshDemoEpoch();
    await prisma.demoEpoch.update({ where: { id: used }, data: { lastActivityAt: new Date(Date.now() - 2 * 60 * MINUTE) } });

    let seeds = 0;
    const slowSeed = async (epochId: number) => {
      seeds += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await draft("legal@seeded.example", { epochId });
    };
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => ensureFreshDemo({ settings: settings(), seedEpoch: slowSeed, pollMs: 50 })),
    );

    expect(seeds).toBe(1);
    expect(outcomes.filter((o) => o.outcome === "reset")).toHaveLength(1);
    expect(outcomes.every((o) => ["reset", "waited", "not-due"].includes(o.outcome))).toBe(true);
    expect(await prisma.demoEpoch.count({ where: { status: "CURRENT" } })).toBe(1);
    expect(await prisma.demoEpoch.count({ where: { status: "PREPARING" } })).toBe(0);
  });

  it("keeps the current demo if someone uses it while the reset is preparing", async () => {
    const used = await freshDemoEpoch();
    await prisma.demoEpoch.update({ where: { id: used }, data: { lastActivityAt: new Date(Date.now() - 2 * 60 * MINUTE) } });

    let prepared = 0;
    const result = await ensureFreshDemo({
      settings: settings(),
      seedEpoch: async (epochId) => {
        prepared = epochId;
        await draft(); // a visitor creates an agreement in the current demo meanwhile
      },
    });

    expect(result).toEqual({ outcome: "superseded" });
    expect((await currentEpoch())?.id).toBe(used);
    expect(await epochRow(prepared)).toMatchObject({ status: "ABANDONED", preparingMarker: null });
  });

  it("takes over a reset whose claim expired, and waits for one that is still running", async () => {
    const used = await freshDemoEpoch();
    await prisma.demoEpoch.update({ where: { id: used }, data: { lastActivityAt: new Date(Date.now() - 2 * 60 * MINUTE) } });

    // A reset that is still within its lease: this one waits, then leaves it be.
    const running = await prisma.demoEpoch.create({
      data: { status: "PREPARING", preparingMarker: true, leaseExpiresAt: new Date(Date.now() + 60 * MINUTE), isDemo: true },
    });
    await expect(
      ensureFreshDemo({ settings: settings({ leaseMs: 300 }), seedEpoch: noSeed, pollMs: 50 }),
    ).resolves.toEqual({ outcome: "waited" });
    expect(await epochRow(running.id)).toMatchObject({ status: "PREPARING" });

    // Once its lease has run out (it crashed), the next reset abandons it.
    await prisma.demoEpoch.update({ where: { id: running.id }, data: { leaseExpiresAt: new Date(Date.now() - MINUTE) } });
    const result = await ensureFreshDemo({ settings: settings(), seedEpoch: noSeed });
    expect(result.outcome).toBe("reset");
    expect(await epochRow(running.id)).toMatchObject({ status: "ABANDONED", preparingMarker: null });
  });

  it("leaves the current demo in place if seeding fails", async () => {
    const used = await freshDemoEpoch();
    await prisma.demoEpoch.update({ where: { id: used }, data: { lastActivityAt: new Date(Date.now() - 2 * 60 * MINUTE) } });

    let prepared = 0;
    await expect(
      ensureFreshDemo({
        settings: settings(),
        seedEpoch: async (epochId) => {
          prepared = epochId;
          throw new Error("renderer unavailable");
        },
      }),
    ).rejects.toThrow("renderer unavailable");
    expect((await currentEpoch())?.id).toBe(used);
    expect(await epochRow(prepared)).toMatchObject({ status: "ABANDONED" });
    expect(await prisma.demoEpoch.count({ where: { status: "PREPARING" } })).toBe(0);
  });

  it("does not retry a failed reset on every visit: the current demo stays usable for a while", async () => {
    const used = await freshDemoEpoch();
    await prisma.demoEpoch.update({ where: { id: used }, data: { lastActivityAt: new Date(Date.now() - 2 * 60 * MINUTE) } });
    const failing = async () => {
      throw new Error("renderer unavailable");
    };
    await expect(ensureFreshDemo({ settings: settings(), seedEpoch: failing })).rejects.toThrow("renderer unavailable");

    // Still due, but within the cooldown: the shell layout does not send
    // visitors back to the reset, and no reset is attempted.
    const epoch = await currentEpoch();
    expect(isResetDue(epoch, new Date(), settings())).toBe(true);
    expect(await resetRecentlyFailed(epoch, new Date(), settings())).toBe(true);
    let seeds = 0;
    const counting = async () => {
      seeds += 1;
    };
    await expect(ensureFreshDemo({ settings: settings(), seedEpoch: counting })).resolves.toEqual({
      outcome: "cooling-down",
    });
    expect(seeds).toBe(0);
    expect((await currentEpoch())?.id).toBe(used);

    // Once the cooldown has passed, the next visitor tries again.
    const later = () => new Date(Date.now() + 6 * MINUTE);
    expect(await resetRecentlyFailed(epoch, later(), settings())).toBe(false);
    await expect(ensureFreshDemo({ settings: settings(), clock: later, seedEpoch: counting })).resolves.toMatchObject({
      outcome: "reset",
    });
    expect(seeds).toBe(1);
  });

  it("seeds the real demo agreements into the new epoch, with example-domain counterparties", async () => {
    const result = await ensureFreshDemo({ force: true, settings: settings() });
    expect(result.outcome).toBe("reset");
    const epochId = (result as { epochId: number }).epochId;

    const documents = await prisma.document.findMany({
      where: { epochId },
      select: { status: true, counterpartyEmail: true, artifacts: { select: { kind: true, status: true } } },
    });
    expect(documents.map((d) => d.status).sort()).toEqual(
      ["DRAFT", "FULLY_EXECUTED", "FULLY_EXECUTED", "PARTIALLY_SIGNED", "SENT", "VOIDED"],
    );
    expect(documents.every((d) => isReservedExampleEmail(d.counterpartyEmail))).toBe(true);
    // Frozen copies are rendered; draft previews wait until first opened.
    const artifacts = documents.flatMap((d) => d.artifacts);
    expect(artifacts.filter((a) => a.kind === "FROZEN").every((a) => a.status === "READY")).toBe(true);
    expect(artifacts.filter((a) => a.kind === "PREVIEW").every((a) => a.status === "PENDING")).toBe(true);
    // A fresh demo is untouched, within its limits, and shown on its own.
    expect(await epochRow(epochId)).toMatchObject({ lastActivityAt: null, agreementCount: 6, agreementLimit: 30 });
    expect(await listAgreements()).toHaveLength(6);
  });
});
