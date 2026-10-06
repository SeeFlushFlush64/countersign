import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// The ordering rule and state consistency are enforced by Postgres itself,
// not only by application code: these writes go around the app entirely
// (raw SQL, as a buggy code path or a manual fix-up would) and are refused.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

async function rawWriteError(sql: string, ...params: unknown[]) {
  return prisma.$executeRawUnsafe(sql, ...params).then(
    () => null,
    (e: unknown) => String(e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : e),
  );
}

describe("database constraints", () => {
  it("refuse a countersignature without a counterparty signature", async () => {
    const a = await makeAgreement(company, "sent");
    const error = await rawWriteError(
      `UPDATE "Document" SET "status" = 'FULLY_EXECUTED', "countersignedAt" = now(), "completedAt" = now() WHERE "id" = $1`,
      a.id,
    );
    expect(error).toMatch(/Document_countersign_after_counterparty|Document_status_matches_timestamps/);
  });

  it("refuse a countersignature dated before the counterparty's signature", async () => {
    const a = await makeAgreement(company, "executed");
    const error = await rawWriteError(
      `UPDATE "Document" SET "countersignedAt" = "counterpartySignedAt" - interval '1 second' WHERE "id" = $1`,
      a.id,
    );
    expect(error).toMatch(/Document_countersign_after_counterparty/);
  });

  it("refuse a status that disagrees with the signing timestamps", async () => {
    const a = await makeAgreement(company, "sent");
    expect(
      await rawWriteError(`UPDATE "Document" SET "status" = 'PARTIALLY_SIGNED' WHERE "id" = $1`, a.id),
    ).toMatch(/Document_status_matches_timestamps/);
    expect(
      await rawWriteError(`UPDATE "Document" SET "counterpartySignedAt" = now() WHERE "id" = $1`, a.id),
    ).toMatch(/Document_status_matches_timestamps/);
  });

  it("refuse a second signer with the same party role", async () => {
    const a = await makeAgreement(company, "draft");
    const error = await rawWriteError(
      `INSERT INTO "Signer" ("id", "documentId", "partyRole", "name", "email") VALUES ('dup', $1, 'COMPANY', 'x', 'x@test.example')`,
      a.id,
    );
    expect(error).toMatch(/Signer_documentId_partyRole_key|unique/i);
  });

  it("refuse a READY artifact without bytes and hash", async () => {
    const a = await makeAgreement(company, "draft");
    const error = await rawWriteError(
      `INSERT INTO "DocumentArtifact" ("id", "documentId", "kind", "status", "updatedAt") VALUES ('bad', $1, 'FROZEN', 'READY', now())`,
      a.id,
    );
    expect(error).toMatch(/DocumentArtifact_ready_has_bytes/);
  });

  it("hold for every agreement the application produced", async () => {
    for (const stage of ["draft", "sent", "counterpartySigned", "executed"] as const) {
      await makeAgreement(company, stage);
    }
    // Re-validating the constraints scans every row.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_countersign_after_counterparty"`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_status_matches_timestamps"`,
    );
  });
});
