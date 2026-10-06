import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { describe, expect, inject, it } from "vitest";
import { createDatabase, databaseUrl } from "./harness/postgres";

// The Phase B migration must upgrade a database that already holds
// agreements created by the earlier code (this is what production holds) —
// additively, preserving every row — and must be all-or-nothing.

const MIGRATIONS = path.resolve("prisma/migrations");
const INIT = readFileSync(path.join(MIGRATIONS, "20260819105442_init/migration.sql"), "utf8");
const SIGNING_CORE = readFileSync(
  path.join(MIGRATIONS, "20261006120000_signing_core/migration.sql"),
  "utf8",
);

async function legacyDatabase() {
  const { adminUrl, runPrefix } = inject("testDatabase");
  const name = `${runPrefix}_legacy_${randomBytes(3).toString("hex")}`;
  await createDatabase(adminUrl, name);
  const client = new Client({ connectionString: databaseUrl(adminUrl, name) });
  await client.connect();
  await client.query(INIT);
  return client;
}

const PDF = Buffer.from("%PDF-1.4 legacy bytes");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function insertLegacyData(client: Client) {
  await client.query(`
    INSERT INTO "Sender" ("id","name","email","role") VALUES
      ('s1','Dana Whitfield','dana@test.example','GENERAL_COUNSEL'),
      ('s2','Marcus Ilori','marcus@test.example','CONTRACTS_MANAGER');
    INSERT INTO "User" ("id","email","passwordHash","senderId") VALUES ('u1','demo@test.example','x','s1');
  `);
  const docs: [string, string, string, string | null, string | null, string | null][] = [
    // id, sender, status, sentAt, counterpartySignedAt(signer), companySignedAt(signer)
    ["d-draft", "s1", "DRAFT", null, null, null],
    ["d-sent", "s1", "SENT", "2026-01-01 10:00:00", null, null],
    ["d-partial", "s2", "PARTIALLY_SIGNED", "2026-01-01 10:00:00", "2026-01-02 10:00:00", null],
    ["d-exec", "s1", "FULLY_EXECUTED", "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2026-01-03 10:00:00"],
  ];
  for (const [id, sender, status, sentAt, cpAt, coAt] of docs) {
    await client.query(
      `INSERT INTO "Document" ("id","title","templateType","senderId","counterpartyName","counterpartyEmail","status","sentAt","completedAt","pdfData")
       VALUES ($1,$1,'NDA',$2,'Counterparty','cp@test.example',$3,$4,$5,$6)`,
      [id, sender, status, sentAt, coAt, PDF],
    );
    await client.query(
      `INSERT INTO "Signer" ("id","documentId","partyRole","name","email","signedAt") VALUES
         ($1 || '-co', $1, 'COMPANY', 'Company', 'co@test.example', $2),
         ($1 || '-cp', $1, 'COUNTERPARTY', 'Counterparty', 'cp@test.example', $3)`,
      [id, coAt, cpAt],
    );
  }
}

describe("signing_core migration", () => {
  it("upgrades existing agreements, preserving every row", async () => {
    const client = await legacyDatabase();
    try {
      await insertLegacyData(client);
      await client.query(SIGNING_CORE);

      const docs = await client.query(
        `SELECT "id","status","counterpartySignedAt"::text AS "counterpartySignedAt",
                "countersignedAt"::text AS "countersignedAt","countersignerId","frozenSha256"
           FROM "Document" ORDER BY "id"`,
      );
      expect(docs.rows.map((r) => r.id)).toEqual(["d-draft", "d-exec", "d-partial", "d-sent"]);
      const byId = Object.fromEntries(docs.rows.map((r) => [r.id, r]));

      // Signing timestamps moved onto the agreement row.
      expect(byId["d-partial"].counterpartySignedAt).toBe("2026-01-02 10:00:00");
      expect(byId["d-exec"].countersignedAt).toBe("2026-01-03 10:00:00");
      // Countersigner defaults to the sender's own login, where one exists.
      expect(byId["d-sent"].countersignerId).toBe("u1");
      expect(byId["d-partial"].countersignerId).toBeNull();
      // Awaiting-signature agreements are frozen against their stored PDF.
      expect(byId["d-sent"].frozenSha256).toBe(sha(PDF));
      expect(byId["d-partial"].frozenSha256).toBe(sha(PDF));
      expect(byId["d-draft"].frozenSha256).toBeNull();

      const artifacts = await client.query(
        `SELECT "documentId","kind","status","sha256" FROM "DocumentArtifact" ORDER BY "documentId","kind"`,
      );
      expect(artifacts.rows).toEqual([
        { documentId: "d-exec", kind: "EXECUTED", status: "READY", sha256: sha(PDF) },
        { documentId: "d-partial", kind: "FROZEN", status: "READY", sha256: sha(PDF) },
        { documentId: "d-sent", kind: "FROZEN", status: "READY", sha256: sha(PDF) },
      ]);

      expect((await client.query(`SELECT count(*)::int AS n FROM "Signer"`)).rows[0].n).toBe(8);
      expect(
        (await client.query(`SELECT "isSignatory" FROM "User"`)).rows.map((r) => r.isSignatory),
      ).toEqual([false]);
    } finally {
      await client.end();
    }
  });

  it("is all-or-nothing: data violating the new constraints leaves the schema untouched", async () => {
    const client = await legacyDatabase();
    try {
      await insertLegacyData(client);
      // An inconsistent legacy row: executed without a completion time.
      await client.query(`UPDATE "Document" SET "completedAt" = NULL WHERE "id" = 'd-exec'`);

      await expect(client.query(SIGNING_CORE)).rejects.toThrowError(
        /Document_status_matches_timestamps/,
      );
      // simple-query multi-statement + explicit BEGIN: the failed transaction
      // must be closed before the connection can be reused.
      await client.query("ROLLBACK").catch(() => {});

      const leftovers = await client.query(`
        SELECT
          (SELECT count(*)::int FROM information_schema.columns
             WHERE table_name = 'User' AND column_name = 'isSignatory') AS user_columns,
          (SELECT count(*)::int FROM information_schema.tables
             WHERE table_name = 'DocumentArtifact') AS artifact_tables,
          (SELECT count(*)::int FROM pg_type WHERE typname = 'ArtifactKind') AS enums`);
      expect(leftovers.rows[0]).toEqual({ user_columns: 0, artifact_tables: 0, enums: 0 });
    } finally {
      await client.end();
    }
  });
});
