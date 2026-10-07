import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { reissueSigningLink, voidDocument } from "@/lib/documents";
import { getSigningRoom } from "@/lib/queries";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// Phase E: the counterparty's signing room shows the agreement's display
// facts only for a working link, and never anything for a link that cannot
// be used — whatever state the agreement is in.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const manager = () => ({ userId: company.paralegal.userId });

describe("signing room data", () => {
  it("for a working link: the people, dates and fingerprints the PDF itself shows", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const room = await getSigningRoom(a.token);
    expect(room.link.state).toBe("valid");
    expect(room.details).toMatchObject({
      counterpartyName: "Counterparty Co",
      countersigner: { sender: { name: "Sam Signatory", role: "GENERAL_COUNSEL" } },
    });
    expect(room.details!.counterpartySignedAt).toBeInstanceOf(Date);
    expect(room.details!.countersignedAt).toBeNull();
    expect(room.details!.artifacts).toEqual([
      expect.objectContaining({ kind: "FROZEN", status: "READY", sha256: a.frozenSha256 }),
    ]);
    // No PDF bytes, and never the draft preview.
    expect(JSON.stringify(room)).not.toMatch(/pdfData|PREVIEW/);
  });

  it("for an executed agreement: both signing times and the executed copy's fingerprint", async () => {
    const a = await makeAgreement(company, "executed");
    const room = await getSigningRoom(a.token);
    expect(room.link.state).toBe("valid");
    expect(room.details!.countersignedAt).toBeInstanceOf(Date);
    expect(room.details!.artifacts.map((x) => x.kind).sort()).toEqual(["EXECUTED", "FROZEN"]);
  });

  it("for a link that cannot be used: nothing about the agreement", async () => {
    const replaced = await makeAgreement(company, "sent");
    await reissueSigningLink(replaced.id, manager(), { expectedLinkId: replaced.linkId });

    const voided = await makeAgreement(company, "sent");
    await voidDocument(voided.id, manager(), "No longer needed");

    const expired = await makeAgreement(company, "sent");
    await prisma.$executeRaw`
      UPDATE "SigningLink"
         SET "createdAt" = (now() at time zone 'utc') - interval '20 days',
             "expiresAt" = (now() at time zone 'utc') - interval '6 days'
       WHERE "id" = ${expired.linkId}`;

    for (const [token, state] of [
      [replaced.token, "superseded"],
      [voided.token, "voided"],
      [expired.token, "expired"],
      ["A".repeat(43), "not_found"],
      ["not-a-token", "not_found"],
    ] as const) {
      const room = await getSigningRoom(token);
      expect(room).toEqual({ link: { state, ...(state === "expired" ? { expiredAt: expect.any(Date) } : {}) }, details: null });
    }
  });
});
