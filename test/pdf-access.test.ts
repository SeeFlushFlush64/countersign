import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { reissueSigningLink, sendDocument, voidDocument } from "@/lib/documents";
import { sha256Hex } from "@/lib/hash";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// Audit finding (High): /api/documents/[id]/pdf served any agreement's PDF to
// anyone. Company access now requires a session; counterparties get a
// link-scoped route that serves only their agreement, only while the link is
// valid, and never a draft.

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, string> } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));

const companyRoute = await import("@/app/api/documents/[id]/pdf/route");
const linkRoute = await import("@/app/s/[token]/document/route");

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});
beforeEach(() => {
  session.current = null;
});

const getCompanyPdf = (id: string) =>
  companyRoute.GET(new Request(`http://localhost/api/documents/${id}/pdf`), {
    params: Promise.resolve({ id }),
  });
const getLinkPdf = (token: string) =>
  linkRoute.GET(new Request(`http://localhost/s/${token}/document`), {
    params: Promise.resolve({ token }),
  });
const bodyHash = async (res: Response) => sha256Hex(new Uint8Array(await res.arrayBuffer()));

describe("company PDF route", () => {
  it("refuses requests without a session (the audit's public download)", async () => {
    const a = await makeAgreement(company, "executed");
    const res = await getCompanyPdf(a.id);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).not.toContain("pdf");
  });

  it("refuses a session whose user no longer exists", async () => {
    const a = await makeAgreement(company, "sent");
    session.current = { user: { id: "deleted-user" } };
    expect((await getCompanyPdf(a.id)).status).toBe(401);
  });

  it("serves a signed-in company user", async () => {
    const a = await makeAgreement(company, "sent");
    session.current = { user: { id: company.paralegal.userId } };
    const res = await getCompanyPdf(a.id);
    expect(res.status).toBe(200);
    expect(await bodyHash(res)).toBe(a.frozenSha256);
  });
});

describe("link-scoped PDF route", () => {
  it("serves the frozen agreement to a valid link, then the executed copy", async () => {
    const sent = await makeAgreement(company, "sent");
    const res = await getLinkPdf(sent.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await bodyHash(res)).toBe(sent.frozenSha256);

    const executed = await makeAgreement(company, "executed");
    const artifact = await prisma.documentArtifact.findFirstOrThrow({
      where: { documentId: executed.id, kind: "EXECUTED" },
    });
    expect(await bodyHash(await getLinkPdf(executed.token))).toBe(artifact.sha256);
  });

  it("serves nothing to superseded, voided, expired or unknown links", async () => {
    const superseded = await makeAgreement(company, "sent");
    await reissueSigningLink(
      superseded.id,
      { userId: company.paralegal.userId },
      { expectedLinkId: superseded.linkId },
    );
    expect((await getLinkPdf(superseded.token)).status).toBe(404);

    const voided = await makeAgreement(company, "sent");
    await voidDocument(voided.id, { userId: company.paralegal.userId }, "No longer needed");
    expect((await getLinkPdf(voided.token)).status).toBe(404);

    const old = await makeAgreement(company, "draft");
    const { signingToken } = await sendDocument(
      old.id,
      { userId: company.paralegal.userId },
      { now: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    );
    expect((await getLinkPdf(signingToken)).status).toBe(404);

    expect((await getLinkPdf("A".repeat(43))).status).toBe(404);
    expect((await getLinkPdf(superseded.id)).status).toBe(404); // an agreement id is not a link
  });
});
