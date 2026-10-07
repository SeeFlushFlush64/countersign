import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertLocalDatabaseUrl,
  describeDatabaseTarget,
} from "@/lib/database-target";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

describe("test harness", () => {
  it("points this file at a private, local, freshly migrated database", async () => {
    await expectPrivateEmptyDatabase();

    const migrations = await prisma.$queryRaw<
      { migration_name: string; finished: boolean; rolled_back: boolean }[]
    >`SELECT migration_name,
             finished_at IS NOT NULL AS finished,
             rolled_back_at IS NOT NULL AS rolled_back
        FROM "_prisma_migrations" ORDER BY started_at`;
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.every((m) => m.finished && !m.rolled_back)).toBe(true);
  });

  it("never exposes Drive or email credentials to tests", () => {
    expect(process.env.GOOGLE_OAUTH_REFRESH_TOKEN).toBeUndefined();
    expect(process.env.GOOGLE_DRIVE_FOLDER_ID).toBeUndefined();
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    expect(process.env.DIRECT_URL).toBeUndefined();
  });
});

describe("database target guard", () => {
  it.each([
    ["postgresql://u:p@localhost:5432/db", "local"],
    ["postgresql://u:p@127.0.0.1:5432/db", "local"],
    ["postgresql://u:p@[::1]:5432/db", "local"],
    ["postgresql://u:p@db.example.com:5432/db", "remote"],
    ["postgresql://u:p@localhost.example.com:5432/db", "remote"],
    ["not a url", "invalid"],
    [undefined, "invalid"],
  ] as const)("classifies %s as %s", (url, expected) => {
    expect(describeDatabaseTarget(url)).toBe(expected);
  });

  it("refuses remote URLs without echoing them", () => {
    const secretish = "postgresql://user:hunter2@db.example.com:5432/prod";
    expect(() => assertLocalDatabaseUrl(secretish, "test")).toThrowError(
      /refusing to use a remote database/,
    );
    try {
      assertLocalDatabaseUrl(secretish, "test");
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
      expect((error as Error).message).not.toContain("db.example.com");
    }
  });
});
