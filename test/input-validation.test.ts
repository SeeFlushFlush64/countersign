import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createDocument, DocumentFlowError } from "@/lib/documents";
import { agreementInputSchema, LIMITS, normalizeText } from "@/lib/validation";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeCompany } from "./helpers/agreements";

// Input rules (audit: whitespace-only names produced a blank party in a legal
// PDF; 2,000-character names and 3,000-character titles were accepted).

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, string> } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { createDocumentAction } = await import("@/app/(shell)/agreements/new/actions");

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const valid = { title: "NDA", counterpartyName: "Acme Ltd", counterpartyEmail: "a@acme.example" };

describe("normalizeText", () => {
  it("trims, collapses whitespace and strips control characters", () => {
    expect(normalizeText("  Acme \n\t  Ltd  ")).toBe("Acme Ltd");
    expect(normalizeText("Acme\u0000\u0007 Ltd\u007f")).toBe("Acme Ltd");
    expect(normalizeText(" \n\t ")).toBe("");
  });
});

describe("agreement input", () => {
  it.each([
    ["a whitespace-only counterparty name", { counterpartyName: "   \n " }, /Counterparty name is required/],
    ["a whitespace-only title", { title: "\t " }, /Title is required/],
    ["an over-long counterparty name", { counterpartyName: "x".repeat(LIMITS.counterpartyName + 1) }, /at most 120/],
    ["an over-long title", { title: "x".repeat(LIMITS.title + 1) }, /at most 200/],
    ["a malformed email", { counterpartyEmail: "not-an-email" }, /valid email/],
    ["an over-long email", { counterpartyEmail: `${"a".repeat(250)}@x.example` }, /at most 254/],
  ])("rejects %s", (_label, override, message) => {
    const result = agreementInputSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(message);
  });

  it("normalizes accepted values", () => {
    expect(
      agreementInputSchema.parse({
        title: "  Mutual   NDA  ",
        counterpartyName: " Acme\n Ltd ",
        counterpartyEmail: "  Legal@Acme.Example ",
      }),
    ).toEqual({ title: "Mutual NDA", counterpartyName: "Acme Ltd", counterpartyEmail: "legal@acme.example" });
  });

  it("is enforced by createDocument itself, not only by the form", async () => {
    const error = await createDocument({
      senderId: company.paralegal.senderId,
      countersignerId: company.signatory.userId,
      templateType: "NDA",
      title: "Whitespace name",
      counterpartyName: "    ",
      counterpartyEmail: "cp@test.example",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentFlowError);
    expect((error as DocumentFlowError).code).toBe("INVALID");
    expect(await prisma.document.count({ where: { title: "Whitespace name" } })).toBe(0);
  });
});

describe("createDocumentAction", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries({
      templateType: "NDA",
      countersignerId: company.signatory.userId,
      counterpartyEmail: "cp@test.example",
      ...fields,
    })) {
      data.set(k, v);
    }
    return data;
  };
  const signIn = () => {
    session.current = {
      user: { id: company.paralegal.userId, senderId: company.paralegal.senderId },
    };
  };

  it("returns a form error for a whitespace-only name and creates nothing", async () => {
    signIn();
    const before = await prisma.document.count();
    const result = await createDocumentAction({ error: null }, form({ counterpartyName: "  \t " }));
    expect(result.error).toMatch(/Counterparty name is required/);
    expect(await prisma.document.count()).toBe(before);
  });

  it("stores trimmed values, defaults the title, and records the signed-in creator", async () => {
    signIn();
    await createDocumentAction({ error: null }, form({ counterpartyName: "  Trim   Me Ltd ", title: "   " }));
    const row = await prisma.document.findFirstOrThrow({
      where: { counterpartyName: "Trim Me Ltd" },
      include: { statusEvents: true },
    });
    expect(row.title).toBe("Mutual NDA — Trim Me Ltd");
    expect(row.statusEvents[0]).toMatchObject({
      eventType: "CREATED",
      actorType: "USER",
      actorUserId: company.paralegal.userId,
    });
  });
});
