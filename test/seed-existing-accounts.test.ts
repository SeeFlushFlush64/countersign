import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";
import { DEMO_USERS, RETIRED_SAMPLE_PASSWORD, SEED_DOCUMENTS, SEED_SENDERS, seed } from "../prisma/seed-lib";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

beforeAll(expectPrivateEmptyDatabase);

const ANCHOR = new Date("2026-03-02T12:00:00.000Z");
const quiet = () => {};

// A deployment seeded by an earlier version of the seed holds the sample
// accounts on senders with the earlier sample-company address. Seeding it again
// (the public workspace's reset does) must move the accounts to the current
// senders: the agreements it creates belong to those senders, and createDocument
// refuses an account that is not on the agreement's sender.
describe("seeding over accounts from an earlier seed", () => {
  it("moves the sample accounts to the current senders and retires the old password", async () => {
    const oldHash = await bcrypt.hash(RETIRED_SAMPLE_PASSWORD, 4);
    for (const demo of DEMO_USERS) {
      const current = SEED_SENDERS.find((s) => s.email === demo.senderEmail)!;
      const earlier = await prisma.sender.create({
        data: {
          name: current.name,
          role: current.role as Role,
          email: current.email.replace("@northlight.example", "@northlightmedia.example"),
        },
      });
      await prisma.user.create({
        data: { email: demo.email, passwordHash: oldHash, senderId: earlier.id, isSignatory: demo.isSignatory },
      });
    }

    const report = await seed({ anchor: ANCHOR, log: quiet });

    expect(report.created).toHaveLength(SEED_DOCUMENTS.length);
    for (const demo of DEMO_USERS) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: demo.email }, include: { sender: true } });
      expect(user.sender.email).toBe(demo.senderEmail);
      expect(await bcrypt.compare(RETIRED_SAMPLE_PASSWORD, user.passwordHash)).toBe(false);
    }
  });
});
