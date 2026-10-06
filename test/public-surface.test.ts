import { describe, expect, it, vi } from "vitest";

// What an anonymous visitor can reach. Two independent layers:
//   1. the proxy matcher, which redirects signed-out requests to /login;
//   2. every internal page, which checks the session itself before reading
//      any data — so loosening the matcher (e.g. to make a marketing page
//      public) cannot expose agreement data or activity.

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
);
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null), signOut: vi.fn() }));
// The proxy module builds an edge NextAuth instance at import; only its
// exported matcher config is under test here.
vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn() }) }));
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
// Reaching the database would mean a page read data before checking the
// session; make that fail loudly.
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("DATA ACCESSED BEFORE SESSION CHECK");
      },
    },
  ),
}));

const { config } = await import("@/proxy");

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each([
    "/",
    "/activity",
    "/outbox",
    "/senders",
    "/create",
    "/documents/abc",
    "/documents/abc/countersign",
    "/api/documents/abc/pdf",
    "/sign/legacy-signer-id",
  ])("protects %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each(["/s/sometoken", "/s/sometoken/document", "/login", "/api/auth/session"])(
    "leaves %s public",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});

describe("internal pages without a session", () => {
  it.each([
    ["dashboard", "@/app/(shell)/page"],
    ["activity", "@/app/(shell)/activity/page"],
    ["outbox", "@/app/(shell)/outbox/page"],
    ["senders", "@/app/(shell)/senders/page"],
    ["create", "@/app/create/page"],
    ["agreement detail", "@/app/documents/[id]/page"],
    ["countersign", "@/app/documents/[id]/countersign/page"],
  ])("%s redirects to /login before touching any data", async (_label, modulePath) => {
    const { default: Page } = await import(/* @vite-ignore */ modulePath);
    const props = { params: Promise.resolve({ id: "any" }) };
    await expect(Page(props)).rejects.toThrowError("REDIRECT:/login");
  });
});
