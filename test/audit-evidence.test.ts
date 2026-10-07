import { describe, expect, it } from "vitest";
import { actorCapacity, describeUserAgent, eventLabel, evidenceFor } from "@/lib/audit-evidence";

// Phase E: how the audit log describes who acted and what was recorded.

describe("audit evidence", () => {
  it("names the capacity each actor acted in", () => {
    expect(actorCapacity("USER")).toBe("company user");
    expect(actorCapacity("COUNTERPARTY_LINK")).toBe("counterparty, through their signing link");
    expect(actorCapacity("SYSTEM")).toBe("system");
    expect(actorCapacity(null)).toBe("recorded before actor types existed");
  });

  it("says which signature an entry is: the counterparty's first, then the countersignature", () => {
    expect(eventLabel("SIGNED", "COUNTERPARTY_LINK")).toBe("Counterparty signed");
    expect(eventLabel("SIGNED", "USER")).toBe("Countersigned");
    expect(eventLabel("SIGNED", null)).toBe("Signed");
    expect(eventLabel("FULLY_EXECUTED", "SYSTEM")).toBe("Executed");
  });

  it("summarises the browser without exposing the raw user agent", () => {
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"),
    ).toBe("Chrome on Windows");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(
      "Safari on iOS",
    );
    expect(describeUserAgent("curl/8.5.0")).toBeNull();
    expect(describeUserAgent(null)).toBeNull();
  });

  it("lists what was recorded with an entry, never the IP hash itself", () => {
    expect(evidenceFor("VOIDED", { reason: "Wrong entity", statusBeforeVoid: "SENT" })).toEqual(["Reason: “Wrong entity”"]);
    expect(evidenceFor("SENT", { linkExpiresAt: "2026-10-21T16:15:00.000Z" })).toEqual([
      "Signing link valid until Oct 21, 2026",
    ]);
    expect(evidenceFor("LINK_REISSUED", { replacedLinkId: "l1", linkExpiresAt: "2026-10-21T16:15:00.000Z" })).toEqual([
      "Replaced the previous signing link",
      "Signing link valid until Oct 21, 2026",
    ]);
    const signed = evidenceFor("SIGNED", { ipHash: "a1b2c3d4e5f6", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/131.0" });
    expect(signed).toEqual(["IP address recorded as a keyed hash", "Firefox on macOS"]);
    expect(signed.join(" ")).not.toContain("a1b2c3");
    expect(evidenceFor("CREATED", null)).toEqual([]);
  });
});
