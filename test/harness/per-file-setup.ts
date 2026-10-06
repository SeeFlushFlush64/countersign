import { randomBytes } from "node:crypto";
import { afterAll, inject } from "vitest";
import { assertLocalDatabaseUrl } from "../../src/lib/database-target";
import { createDatabase, databaseUrl } from "./postgres";

// Runs in each test file's worker before the file is imported. It clones a
// fresh database from the migrated template and points DATABASE_URL at it,
// so src/lib/prisma.ts (which reads DATABASE_URL when first imported)
// connects to this file's private database.

const { adminUrl, templateDatabase, runPrefix } = inject("testDatabase");
const database = `${runPrefix}_${randomBytes(4).toString("hex")}`;
await createDatabase(adminUrl, database, templateDatabase);

process.env.DATABASE_URL = assertLocalDatabaseUrl(
  databaseUrl(adminUrl, database),
  "per-file test database",
);
delete process.env.DIRECT_URL;

// Integrations must never fire from tests, and delivery runs in its default
// (demo outbox, development key) mode, whatever the developer's shell
// happens to export.
for (const name of [
  "DELIVERY_MODE",
  "OUTBOX_ENCRYPTION_KEY",
  "GOOGLE_DRIVE_FOLDER_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
  "RESEND_API_KEY",
]) {
  delete process.env[name];
}

// The renderer keeps one Chromium per process; close it so the worker exits.
afterAll(async () => {
  const { closeRenderer } = await import("@/lib/pdf/render");
  await closeRenderer();
});
