import "dotenv/config";
import { defineConfig } from "prisma/config";

// This config is read only by the Prisma CLI (migrate, studio, db, …), never
// by the running app — the app connects through the pg driver adapter in
// src/lib/prisma.ts using the pooled DATABASE_URL.
//
// Prisma 7's datasource config has no `directUrl` field, so the CLI gets the
// direct/session connection (DIRECT_URL, port 5432) as its `url`: the schema
// engine hangs on Supabase's transaction pooler (port 6543) at its
// advisory-lock step. Falls back to DATABASE_URL when DIRECT_URL is unset
// (e.g. a plain local Postgres with no pooler).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!,
  },
});
