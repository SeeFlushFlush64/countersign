import { describe, expect, it } from "vitest";
import { DEMO_LOGIN_EMAIL } from "../prisma/seed-lib";
import { SAMPLE_COUNTERSIGNER_EMAIL, sampleSignInEnabled } from "@/lib/sample-workspace";

describe("sample workspace sign-in", () => {
  it("enters as the account the seed creates as the designated countersigner", () => {
    expect(SAMPLE_COUNTERSIGNER_EMAIL).toBe(DEMO_LOGIN_EMAIL);
  });

  it("is available in the sample workspace and outside production, and nowhere else", () => {
    expect(sampleSignInEnabled({ DEMO_MODE: "1", NODE_ENV: "production" })).toBe(true);
    expect(sampleSignInEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(sampleSignInEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(sampleSignInEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(sampleSignInEnabled({ DEMO_MODE: "0", NODE_ENV: "production" })).toBe(false);
  });
});
