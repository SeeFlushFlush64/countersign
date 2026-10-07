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
    "/agreements",
    "/agreements/new",
    "/audit",
    "/activity",
    "/outbox",
    "/create",
    "/agreements/abc",
    "/agreements/abc/countersign",
    "/documents/abc",
    "/documents/abc/countersign",
    "/api/documents/abc/pdf",
    "/sign/legacy-signer-id",
    "/demo/preparing",
  ])("protects %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each(["/", "/s/sometoken", "/s/sometoken/document", "/login", "/api/auth/session", "/icon.svg", "/robots.txt"])(
    "leaves %s public",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});

describe("internal pages without a session", () => {
  it.each([
    ["agreements queue", "@/app/(shell)/agreements/page"],
    ["outbox", "@/app/(shell)/outbox/page"],
    ["new agreement", "@/app/(shell)/agreements/new/page"],
    ["audit log", "@/app/(shell)/audit/page"],
    ["agreement detail", "@/app/(shell)/agreements/[id]/page"],
    ["countersign", "@/app/(shell)/agreements/[id]/countersign/page"],
    ["demo reset", "@/app/demo/preparing/page"],
  ])("%s redirects to /login before touching any data", async (_label, modulePath) => {
    const { default: Page } = await import(/* @vite-ignore */ modulePath);
    const props = {
      params: Promise.resolve({ id: "any" }),
      searchParams: Promise.resolve({ view: "all" }),
    };
    await expect(Page(props)).rejects.toThrowError("REDIRECT:/login");
  });

  it("the public landing page renders without touching any data", async () => {
    const { default: Landing } = await import("@/app/page");
    await expect(Landing()).resolves.toBeTruthy();
  });

  it("the signed-in app frame redirects to /login before touching any data", async () => {
    const { default: ShellLayout } = await import("@/app/(shell)/layout");
    await expect(ShellLayout({ children: null })).rejects.toThrowError("REDIRECT:/login");
  });
});

describe("the demo reset without a session", () => {
  it("refuses to run before touching any data", async () => {
    const { prepareDemoAction } = await import("@/app/demo/preparing/actions");
    await expect(prepareDemoAction()).resolves.toEqual({ ok: false, error: "Your session ended. Sign in again." });
  });
});

describe("search engines", () => {
  it("every response says noindex, and robots.txt disallows everything", async () => {
    const { default: nextConfig } = await import("../next.config");
    const rules = await nextConfig.headers!();
    const everywhere = rules.find((rule) => rule.source === "/:path*");
    expect(everywhere?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });

    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
