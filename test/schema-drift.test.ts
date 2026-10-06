import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "@/lib/database-target";

// The migration history and prisma/schema.prisma must describe the same
// database. This diffs the freshly migrated test database against the schema;
// any difference means a migration is missing or hand-edited out of sync.

describe("schema drift", () => {
  it("the migrated database matches schema.prisma exactly", () => {
    const url = assertLocalDatabaseUrl(process.env.DATABASE_URL, "schema drift check");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/prisma/build/index.js"),
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      { encoding: "utf8", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } },
    );
    // Exit codes: 0 = no difference, 2 = difference, 1 = error.
    expect(result.stdout + result.stderr).not.toMatch(/\[\+\]|\[-\]|\[\*\]/);
    expect(result.status).toBe(0);
  });
});
