import { spawn } from "node:child_process";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "@/lib/database-target";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

// Runs the real `npm run seed` entry point (prisma/seed.ts) as a separate
// process. Regression: once the renderer started reusing one Chromium per
// process, the CLI finished its work but never exited.

const EXIT_DEADLINE_MS = 150_000;

function runSeedCli(): Promise<{ code: number | null; output: string }> {
  const url = assertLocalDatabaseUrl(process.env.DATABASE_URL, "seed CLI test");
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve("node_modules/tsx/dist/cli.mjs"), "prisma/seed.ts"],
      {
        env: { ...process.env, DATABASE_URL: url, SEED_ANCHOR: "2026-03-02T12:00:00.000Z" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`seed CLI did not exit within ${EXIT_DEADLINE_MS}ms:\n${output}`));
    }, EXIT_DEADLINE_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

beforeAll(expectPrivateEmptyDatabase);

describe("seed CLI", () => {
  it("seeds, exits on its own, and is idempotent on a second run", { timeout: 2 * EXIT_DEADLINE_MS }, async () => {
    const first = await runSeedCli();
    expect(first.code).toBe(0);
    expect(first.output).toMatch(/Seed complete: 5 created, 0 already present, 0 mismatched/);

    const second = await runSeedCli();
    expect(second.code).toBe(0);
    expect(second.output).toMatch(/Seed complete: 0 created, 5 already present, 0 mismatched/);
  });
});
