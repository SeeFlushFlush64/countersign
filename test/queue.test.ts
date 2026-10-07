import { beforeAll, describe, expect, it } from "vitest";
import { listAgreements } from "@/lib/queries";
import { voidDocument } from "@/lib/documents";
import { buildQueue, parseView, rowFor, viewOf, type QueueAgreement } from "@/lib/queue";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// Phase E: the agreements queue. Which view an agreement is in, what its row
// says and offers, and the order — for a given viewer.

const NOW = new Date("2026-03-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function agreement(overrides: Partial<QueueAgreement>): QueueAgreement {
  return {
    id: overrides.id ?? "a",
    title: "Agreement",
    status: "DRAFT",
    createdAt: ago(10),
    sentAt: null,
    counterpartySignedAt: null,
    countersignedAt: null,
    voidedAt: null,
    voidReason: null,
    counterpartyName: "Ashgrove Creative LLC",
    countersignerId: "signatory",
    countersignerName: "Dana Whitfield",
    senderName: "Marcus Ilori",
    activeLink: null,
    ...overrides,
  };
}

const sent = (overrides: Partial<QueueAgreement> = {}) =>
  agreement({
    status: "SENT",
    sentAt: ago(5),
    activeLink: { expiresAt: new Date(NOW.getTime() + 9 * DAY), firstViewedAt: null },
    ...overrides,
  });
const counterpartySigned = (overrides: Partial<QueueAgreement> = {}) =>
  sent({ status: "PARTIALLY_SIGNED", counterpartySignedAt: ago(2), ...overrides });

describe("which view an agreement is in", () => {
  it("follows the signing sequence", () => {
    expect(viewOf(agreement({}), "signatory")).toBe("drafts");
    expect(viewOf(sent(), "signatory")).toBe("waiting-counterparty");
    expect(viewOf(agreement({ status: "FULLY_EXECUTED" }), "signatory")).toBe("executed");
    expect(viewOf(agreement({ status: "VOIDED" }), "signatory")).toBe("voided");
  });

  it("asks only the designated countersigner to countersign", () => {
    expect(viewOf(counterpartySigned(), "signatory")).toBe("needs-countersign");
    // The sender, another signatory, anyone else: waiting on someone else.
    for (const viewer of ["sender", "other-signatory", "paralegal"]) {
      expect(viewOf(counterpartySigned(), viewer)).toBe("waiting-countersign");
    }
  });
});

describe("what a row says and offers", () => {
  it("offers Countersign only on the designated countersigner's rows", () => {
    const mine = rowFor(counterpartySigned({ id: "x" }), "signatory", NOW);
    expect(mine.action).toEqual({ label: "Countersign", href: "/agreements/x/countersign" });
    expect(mine.tone).toBe("action");
    expect(mine.headline).toBe("Ready for your countersignature");

    const theirs = rowFor(counterpartySigned(), "paralegal", NOW);
    expect(theirs.action).toBeNull();
    expect(theirs.headline).toBe("Waiting on Dana Whitfield to countersign");

    for (const a of [agreement({}), sent(), agreement({ status: "FULLY_EXECUTED" }), agreement({ status: "VOIDED" })]) {
      expect(rowFor(a, "signatory", NOW).action).toBeNull();
    }
  });

  it("names who the agreement waits on, and flags a link that can no longer be used", () => {
    const fresh = rowFor(sent(), "signatory", NOW);
    expect(fresh.headline).toBe("Waiting on Ashgrove Creative LLC to sign");
    expect(fresh.detail).toMatchObject({ text: "Link not opened yet", atPrefix: "expires" });
    expect(fresh.tone).toBe("waiting");

    const opened = rowFor(sent({ activeLink: { expiresAt: new Date(NOW.getTime() + DAY), firstViewedAt: ago(1) } }), "signatory", NOW);
    expect(opened.detail).toMatchObject({ text: "Link opened" });

    const expired = rowFor(sent({ activeLink: { expiresAt: ago(1), firstViewedAt: null } }), "signatory", NOW);
    expect(expired).toMatchObject({ tone: "attention", detail: { text: "Signing link expired" } });

    const noLink = rowFor(sent({ activeLink: null }), "signatory", NOW);
    expect(noLink.tone).toBe("attention");
    expect(noLink.detail?.text).toMatch(/No active signing link/);
  });

  it("shows how far the sequence got, including before a void", () => {
    expect(rowFor(agreement({}), "signatory", NOW).steps).toBe(0);
    expect(rowFor(sent(), "signatory", NOW).steps).toBe(1);
    expect(rowFor(counterpartySigned(), "signatory", NOW).steps).toBe(2);
    expect(rowFor(agreement({ status: "FULLY_EXECUTED" }), "signatory", NOW).steps).toBe(3);
    expect(rowFor(agreement({ status: "VOIDED", sentAt: ago(3) }), "signatory", NOW).steps).toBe(1);
    expect(rowFor(agreement({ status: "VOIDED", voidReason: "x".repeat(200) }), "signatory", NOW).detail?.text).toHaveLength(90);
  });
});

describe("the queue as a whole", () => {
  const agreements = [
    agreement({ id: "draft", createdAt: ago(1) }),
    sent({ id: "sent" }),
    counterpartySigned({ id: "mine-newer", counterpartySignedAt: ago(1) }),
    counterpartySigned({ id: "mine-older", counterpartySignedAt: ago(3) }),
    counterpartySigned({ id: "theirs", countersignerId: "other-signatory", countersignerName: "Olive Other" }),
    agreement({ id: "executed", status: "FULLY_EXECUTED", countersignedAt: ago(4) }),
    agreement({ id: "voided", status: "VOIDED", voidedAt: ago(6) }),
  ];

  it("counts every view and opens on what needs the viewer", () => {
    const queue = buildQueue(agreements, "signatory", NOW);
    expect(queue.counts).toEqual({
      "needs-countersign": 2,
      "waiting-counterparty": 1,
      "waiting-countersign": 1,
      drafts: 1,
      executed: 1,
      voided: 1,
      all: 7,
    });
    expect(queue.defaultView).toBe("needs-countersign");
  });

  it("puts the longest-waiting countersignature first, and action before everything in All", () => {
    const queue = buildQueue(agreements, "signatory", NOW);
    expect(queue.rows["needs-countersign"].map((r) => r.agreement.id)).toEqual(["mine-older", "mine-newer"]);
    expect(queue.rows.all.map((r) => r.agreement.id)).toEqual([
      "mine-newer",
      "mine-older",
      "sent",
      "theirs",
      "draft",
      "executed",
      "voided",
    ]);
  });

  it("opens on All when nothing needs the viewer", () => {
    const queue = buildQueue(agreements, "paralegal", NOW);
    expect(queue.counts["needs-countersign"]).toBe(0);
    expect(queue.counts["waiting-countersign"]).toBe(3);
    expect(queue.defaultView).toBe("all");
    expect(buildQueue([], "anyone", NOW).defaultView).toBe("all");
  });

  it("accepts only known views from the URL", () => {
    expect(parseView("drafts")).toBe("drafts");
    expect(parseView("DROP TABLE")).toBeNull();
    expect(parseView(["drafts"])).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("the queue from the database", () => {
  let company: Company;

  beforeAll(async () => {
    await expectPrivateEmptyDatabase();
    company = await makeCompany();
  });

  it("asks the designated countersigner, and only them, to countersign", async () => {
    const draft = await makeAgreement(company, "draft");
    const waiting = await makeAgreement(company, "sent");
    const ready = await makeAgreement(company, "counterpartySigned");
    const executed = await makeAgreement(company, "executed");
    const voided = await makeAgreement(company, "sent");
    await voidDocument(voided.id, { userId: company.paralegal.userId }, "Wrong counterparty");

    const agreements = await listAgreements();
    const forSignatory = buildQueue(agreements, company.signatory.userId);
    const ids = (view: keyof typeof forSignatory.rows) => forSignatory.rows[view].map((r) => r.agreement.id);
    expect(ids("needs-countersign")).toEqual([ready.id]);
    expect(ids("waiting-counterparty")).toEqual([waiting.id]);
    expect(ids("drafts")).toEqual([draft.id]);
    expect(ids("executed")).toEqual([executed.id]);
    expect(ids("voided")).toEqual([voided.id]);
    expect(forSignatory.rows["needs-countersign"][0].agreement).toMatchObject({
      counterpartyName: "Counterparty Co",
      countersignerName: "Sam Signatory",
      senderName: "Pat Paralegal",
    });

    for (const viewer of [company.paralegal.userId, company.otherSignatory.userId]) {
      const queue = buildQueue(agreements, viewer);
      expect(queue.counts["needs-countersign"]).toBe(0);
      expect(queue.rows["waiting-countersign"].map((r) => r.agreement.id)).toEqual([ready.id]);
    }

    // Waiting rows carry their active link's state.
    const waitingRow = forSignatory.rows["waiting-counterparty"][0];
    expect(waitingRow.agreement.activeLink?.expiresAt).toBeInstanceOf(Date);
  });
});
