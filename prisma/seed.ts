import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { describeDatabaseTarget } from "../src/lib/database-target";
import { seed, seedAnchorFor } from "./seed-lib";

// CLI entry for `npm run seed`. The seed logic lives in ./seed-lib so tests
// can run it against a throwaway database.
//
//   SEED_ANCHOR=<ISO date>  pins every seeded timestamp (default: start of
//                           the current UTC hour)
//   SEED_ALLOW_REMOTE=1     required to seed anything other than localhost,
//                           so a stray run can't write demo rows into a
//                           shared or production database

async function main() {
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  if (target === "invalid") {
    throw new Error("DATABASE_URL is missing or malformed.");
  }
  if (target === "remote" && process.env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      "Refusing to seed a remote database. Set SEED_ALLOW_REMOTE=1 to seed it deliberately.",
    );
  }

  const anchor = process.env.SEED_ANCHOR
    ? new Date(process.env.SEED_ANCHOR)
    : seedAnchorFor(new Date());
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("SEED_ANCHOR is not a valid ISO date.");
  }

  console.log(`Seeding the ${target} database (anchor ${anchor.toISOString()})`);
  const report = await seed({ anchor });

  console.log(
    `Seed complete: ${report.created.length} created, ${report.skipped.length} already present, ` +
      `${report.mismatched.length} mismatched, ${report.duplicated.length} duplicated.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
