import "dotenv/config";
import { spawnSync } from "node:child_process";

// Migration commands need a direct (non-pooled) connection. A pooler in
// transaction mode (Neon's -pooler host, Supabase's port 6543) does not keep
// the session state the Prisma schema engine expects and can hang it, so
// DIRECT_URL is used when it is set. The running app keeps using the pooled
// DATABASE_URL through the driver adapter. With no DIRECT_URL (a plain local
// Postgres) the command falls back to DATABASE_URL, as prisma.config.ts does.
const target = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!target) {
  console.error("Set DIRECT_URL (or DATABASE_URL for a plain local Postgres) before running migrations.");
  process.exit(1);
}
process.env.DATABASE_URL = target;

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
