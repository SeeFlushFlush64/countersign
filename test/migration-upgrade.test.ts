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
const ENUM_VALUES = readFileSync(
  path.join(MIGRATIONS, "20261007090000_enum_values/migration.sql"),
  "utf8",
);
const SIGNING_LINKS = readFileSync(
  path.join(MIGRATIONS, "20261007090100_signing_links/migration.sql"),
  "utf8",
);
const SIGNING_CORE = readFileSync(
  path.join(MIGRATIONS, "20261006120000_signing_core/migration.sql"),
  "utf8",
);
const ARTIFACT_PREVIEW = readFileSync(
  path.join(MIGRATIONS, "20261008090000_artifact_preview/migration.sql"),
  "utf8",
);
const DELIVERY_STORAGE = readFileSync(
  path.join(MIGRATIONS, "20261008090100_delivery_storage/migration.sql"),
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

describe("signing_links migrations (Phase C)", () => {
  it("upgrade a Phase B database in place, keeping legacy audit rows and making them immutable", async () => {
    const client = await legacyDatabase();
    try {
      await insertLegacyData(client);
      await client.query(SIGNING_CORE);
      await client.query(
        `INSERT INTO "StatusEvent" ("id","documentId","eventType","actor") VALUES ('legacy-ev','d-sent','SENT','Dana Whitfield')`,
      );

      await client.query(ENUM_VALUES);
      await client.query(SIGNING_LINKS);

      // Nothing existing was changed or removed.
      expect((await client.query(`SELECT count(*)::int AS n FROM "Document"`)).rows[0].n).toBe(4);
      const legacy = await client.query(
        `SELECT "actor","actorType","actorUserId","signingLinkId" FROM "StatusEvent" WHERE "id" = 'legacy-ev'`,
      );
      expect(legacy.rows[0]).toEqual({
        actor: "Dana Whitfield",
        actorType: null,
        actorUserId: null,
        signingLinkId: null,
      });
      const voided = await client.query(`SELECT count(*)::int AS n FROM "Document" WHERE "status" = 'VOIDED' OR "voidedAt" IS NOT NULL`);
      expect(voided.rows[0].n).toBe(0);
      // No link can be backfilled (raw tokens never existed): agreements
      // already awaiting the counterparty need their link reissued.
      expect((await client.query(`SELECT count(*)::int AS n FROM "SigningLink"`)).rows[0].n).toBe(0);

      // VOIDED is a real status now; the re-created status constraint still
      // rejects exactly what Phase B rejected…
      const statuses = await client.query(`SELECT unnest(enum_range(NULL::"DocumentStatus"))::text AS v`);
      expect(statuses.rows.map((r) => r.v)).toEqual([
        "DRAFT",
        "SENT",
        "PARTIALLY_SIGNED",
        "FULLY_EXECUTED",
        "VOIDED",
      ]);
      await expect(
        client.query(`UPDATE "Document" SET "sentAt" = NULL WHERE "id" = 'd-sent'`),
      ).rejects.toThrowError(/Document_status_matches_timestamps/);
      // …a legacy agreement can be voided under the new rules…
      await client.query(
        `UPDATE "Document" SET "status" = 'VOIDED', "voidedAt" = now(), "voidReason" = 'legacy cleanup', "voidedById" = 'u1' WHERE "id" = 'd-partial'`,
      );
      // …and terminal states (legacy executed included) can never change.
      await expect(
        client.query(`UPDATE "Document" SET "status" = 'PARTIALLY_SIGNED', "voidedAt" = NULL, "voidReason" = NULL, "voidedById" = NULL WHERE "id" = 'd-partial'`),
      ).rejects.toThrowError(/terminal/);
      await expect(
        client.query(`UPDATE "Document" SET "status" = 'SENT' WHERE "id" = 'd-exec'`),
      ).rejects.toThrowError(/terminal/);

      // Legacy audit rows are now append-only too…
      await expect(
        client.query(`UPDATE "StatusEvent" SET "actor" = 'x' WHERE "id" = 'legacy-ev'`),
      ).rejects.toThrowError(/append-only/);
      // …and new rows must carry a verifiable actor.
      await expect(
        client.query(
          `INSERT INTO "StatusEvent" ("id","documentId","eventType","actor") VALUES ('new-ev','d-sent','VOIDED','x')`,
        ),
      ).rejects.toThrowError(/StatusEvent_actor_context/);
    } finally {
      await client.end();
    }
  });

  it("re-running the enum step is harmless (safe retry)", async () => {
    const client = await legacyDatabase();
    try {
      await client.query(SIGNING_CORE);
      await client.query(ENUM_VALUES);
      await client.query(ENUM_VALUES);
      const values = await client.query(
        `SELECT unnest(enum_range(NULL::"StatusEventType"))::text AS v`,
      );
      expect(values.rows.map((r) => r.v)).toEqual([
        "CREATED",
        "SENT",
        "VIEWED",
        "SIGNED",
        "FULLY_EXECUTED",
        "LINK_REISSUED",
        "VOIDED",
      ]);
    } finally {
      await client.end();
    }
  });
});

describe("delivery_storage migrations (Phase D)", () => {
  // A Phase C database: the legacy agreements, plus a draft whose preview
  // was never stored.
  async function phaseCDatabase() {
    const client = await legacyDatabase();
    await insertLegacyData(client);
    await client.query(SIGNING_CORE);
    await client.query(ENUM_VALUES);
    await client.query(SIGNING_LINKS);
    await client.query(`
      INSERT INTO "Document" ("id","title","templateType","senderId","counterpartyName","counterpartyEmail","status")
        VALUES ('d-draft-nopdf','d-draft-nopdf','NDA','s1','Counterparty','cp@test.example','DRAFT')`);
    return client;
  }

  it("move draft previews into artifacts, keeping every existing row and byte", async () => {
    const client = await phaseCDatabase();
    try {
      const before = await client.query(
        `SELECT "id", encode(sha256("pdfData"), 'hex') AS sha FROM "Document" ORDER BY "id"`,
      );
      await client.query(ARTIFACT_PREVIEW);
      await client.query(DELIVERY_STORAGE);

      // Agreements and their legacy bytes are untouched.
      const after = await client.query(
        `SELECT "id", encode(sha256("pdfData"), 'hex') AS sha FROM "Document" ORDER BY "id"`,
      );
      expect(after.rows).toEqual(before.rows);

      // Unsent agreements get a PREVIEW: READY from the stored bytes (same
      // hash), or PENDING when there were none. Sent ones keep FROZEN/EXECUTED.
      const artifacts = await client.query(
        `SELECT "documentId","kind","status","sha256" FROM "DocumentArtifact" ORDER BY "documentId","kind"`,
      );
      expect(artifacts.rows).toEqual([
        { documentId: "d-draft", kind: "PREVIEW", status: "READY", sha256: sha(PDF) },
        { documentId: "d-draft-nopdf", kind: "PREVIEW", status: "PENDING", sha256: null },
        { documentId: "d-exec", kind: "EXECUTED", status: "READY", sha256: sha(PDF) },
        { documentId: "d-partial", kind: "FROZEN", status: "READY", sha256: sha(PDF) },
        { documentId: "d-sent", kind: "FROZEN", status: "READY", sha256: sha(PDF) },
      ]);

      // Legacy READY artifacts are now immutable too…
      await expect(
        client.query(`UPDATE "DocumentArtifact" SET "lastError" = 'x' WHERE "documentId" = 'd-sent'`),
      ).rejects.toThrowError(/READY and immutable/);
      await expect(
        client.query(`DELETE FROM "DocumentArtifact" WHERE "documentId" = 'd-exec'`),
      ).rejects.toThrowError(/READY and immutable/);
      // …and the outbox starts empty.
      expect((await client.query(`SELECT count(*)::int AS n FROM "OutboundMessage"`)).rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
  });

  it("is all-or-nothing: an artifact whose hash does not match its bytes aborts it cleanly", async () => {
    const client = await phaseCDatabase();
    try {
      await client.query(
        `UPDATE "DocumentArtifact" SET "sha256" = repeat('0', 64) WHERE "documentId" = 'd-sent'`,
      );
      await client.query(ARTIFACT_PREVIEW);
      await expect(client.query(DELIVERY_STORAGE)).rejects.toThrowError(
        /DocumentArtifact_sha256_matches_bytes/,
      );
      await client.query("ROLLBACK").catch(() => {});

      const leftovers = await client.query(`
        SELECT
          (SELECT count(*)::int FROM information_schema.tables WHERE table_name = 'OutboundMessage') AS tables,
          (SELECT count(*)::int FROM "DocumentArtifact" WHERE "kind" = 'PREVIEW') AS previews,
          (SELECT count(*)::int FROM pg_type WHERE typname = 'DeliveryStatus') AS enums`);
      expect(leftovers.rows[0]).toEqual({ tables: 0, previews: 0, enums: 0 });
    } finally {
      await client.end();
    }
  });

  it("re-running the enum step is harmless (safe retry)", async () => {
    const client = await phaseCDatabase();
    try {
      await client.query(ARTIFACT_PREVIEW);
      await client.query(ARTIFACT_PREVIEW);
      const values = await client.query(`SELECT unnest(enum_range(NULL::"ArtifactKind"))::text AS v`);
      expect(values.rows.map((r) => r.v)).toEqual(["FROZEN", "EXECUTED", "PREVIEW"]);
    } finally {
      await client.end();
    }
  });
});
