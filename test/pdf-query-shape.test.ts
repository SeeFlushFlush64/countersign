import pg from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadAgreementPdf, loadLinkPdf } from "@/lib/documents";
import { getAgreementDetail, listAgreements, listOutbox } from "@/lib/queries";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// PDF bytes are read only when a query explicitly asks for them. Every SQL
// statement the app sends is captured at the pg driver, so this checks what
// actually goes over the wire, not just what Prisma hands back.

let company: Company;
let ids: { draft: string; executed: string; executedToken: string };

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
  const draft = await makeAgreement(company, "draft");
  const executed = await makeAgreement(company, "executed");
  ids = { draft: draft.id, executed: executed.id, executedToken: executed.token };
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function sqlOf(run: () => Promise<unknown>) {
  const statements: string[] = [];
  const original = pg.Client.prototype.query;
  vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (
    this: pg.Client,
    ...args: Parameters<typeof original>
  ) {
    const [config] = args as unknown as [string | { text: string }];
    statements.push(typeof config === "string" ? config : config.text);
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof original);
  const result = await run();
  vi.restoreAllMocks();
  return { statements, result };
}

const readsPdfBytes = (statements: string[]) => statements.some((sql) => /"pdfData"/.test(sql));

function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).some(([k, v]) => k === key || hasKeyDeep(v, key));
  }
  return false;
}

describe("list and detail queries never load PDF bytes", () => {
  it.each([
    ["dashboard list", () => listAgreements()],
    ["agreement detail (draft)", () => getAgreementDetail(ids.draft)],
    ["agreement detail (executed)", () => getAgreementDetail(ids.executed)],
    ["outbox", () => listOutbox()],
  ])("%s", async (_label, query) => {
    const { statements, result } = await sqlOf(query);
    expect(statements.length).toBeGreaterThan(0);
    expect(readsPdfBytes(statements)).toBe(false);
    expect(hasKeyDeep(result, "pdfData")).toBe(false);
  });

  it("even an unqualified query omits the bytes by default", async () => {
    const { statements, result } = await sqlOf(async () => [
      await prisma.document.findMany({ include: { artifacts: true } }),
      await prisma.documentArtifact.findMany(),
      await prisma.document.findUnique({ where: { id: ids.executed } }),
    ]);
    expect(readsPdfBytes(statements)).toBe(false);
    expect(hasKeyDeep(result, "pdfData")).toBe(false);
  });
});

describe("PDF loaders read the bytes explicitly", () => {
  it("the company PDF route's loader", async () => {
    const { statements, result } = await sqlOf(() => loadAgreementPdf(ids.executed));
    expect(readsPdfBytes(statements)).toBe(true);
    expect(result).toMatchObject({ pdf: expect.any(Uint8Array) });
    // Only the artifact table is read for bytes; the legacy column never is.
    expect(statements.filter((sql) => /"pdfData"/.test(sql)).every((sql) => /"DocumentArtifact"/.test(sql))).toBe(
      true,
    );
  });

  it("the signing link's loader", async () => {
    const { statements, result } = await sqlOf(() => loadLinkPdf(ids.executedToken));
    expect(readsPdfBytes(statements)).toBe(true);
    expect(result).toMatchObject({ pdf: expect.any(Uint8Array) });
  });

  it("asking for the bytes explicitly works", async () => {
    const artifact = await prisma.documentArtifact.findFirstOrThrow({
      where: { documentId: ids.executed, kind: "EXECUTED" },
      select: { pdfData: true },
    });
    expect(artifact.pdfData?.length).toBeGreaterThan(0);
  });
});
