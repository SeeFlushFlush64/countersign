import "dotenv/config";
import { spawnSync } from "node:child_process";

// Supabase's transaction pooler (DATABASE_URL, port 6543) hangs the Prisma
// schema-engine on its advisory-lock step — pgbouncer transaction mode
// doesn't preserve the session state the engine expects. Migration commands
// need the direct/session connection (DIRECT_URL, port 5432) instead; app
// runtime keeps using the pooled DATABASE_URL via the driver adapter, which
// isn't affected since it never takes an advisory lock.
process.env.DATABASE_URL = process.env.DIRECT_URL;

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
