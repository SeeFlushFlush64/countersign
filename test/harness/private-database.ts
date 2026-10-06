import { expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDatabaseTarget } from "@/lib/database-target";

// Asserts that the Prisma client this test file imported is connected to the
// file's own cloned database (and that the database starts empty). Call it in
// each file's beforeAll: it fails loudly if a client ever leaked between
// files or pointed anywhere other than localhost.
export async function expectPrivateEmptyDatabase() {
  const url = process.env.DATABASE_URL;
  expect(describeDatabaseTarget(url)).toBe("local");

  const [{ current_database }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  expect(current_database).toBe(new URL(url!).pathname.slice(1));

  expect(await prisma.document.count()).toBe(0);
  expect(await prisma.sender.count()).toBe(0);
  expect(await prisma.user.count()).toBe(0);
}
