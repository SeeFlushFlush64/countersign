import type { ActorType, StatusEventType } from "@/generated/prisma/enums";
import { STATUS_EVENT_LABELS } from "@/lib/labels";

// How an audit entry is described: who acted, in what capacity, and the
// evidence recorded with it. Pure, so it is tested directly.

// Both signatures are SIGNED events; the actor says which one it was, so the
// counterparty-first, countersignature-second order reads in the log itself.
export function eventLabel(eventType: StatusEventType, actorType: ActorType | string | null): string {
  if (eventType === "SIGNED" && actorType === "COUNTERPARTY_LINK") return "Counterparty signed";
  if (eventType === "SIGNED" && actorType === "USER") return "Countersigned";
  return STATUS_EVENT_LABELS[eventType];
}

export function actorCapacity(actorType: ActorType | null): string {
  switch (actorType) {
    case "USER":
      return "company user";
    case "COUNTERPARTY_LINK":
      return "counterparty, through their signing link";
    case "SYSTEM":
      return "system";
    default:
      return "recorded before actor types existed";
  }
}

// "Chrome on Windows" from a user agent string; null if unrecognised.
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Evidence lines for one entry, from what was recorded with it. Never the
// raw IP (none is stored) and never the full IP hash.
export function evidenceFor(eventType: StatusEventType, metadata: unknown): string[] {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const lines: string[] = [];
  if (eventType === "VOIDED" && typeof m.reason === "string") lines.push(`Reason: “${m.reason}”`);
  if (eventType === "LINK_REISSUED" && m.replacedLinkId) lines.push("Replaced the previous signing link");
  if ((eventType === "SENT" || eventType === "LINK_REISSUED") && typeof m.linkExpiresAt === "string") {
    lines.push(`Signing link valid until ${DAY.format(new Date(m.linkExpiresAt))}`);
  }
  if (typeof m.ipHash === "string" && m.ipHash) lines.push("IP address recorded as a keyed hash");
  const browser = describeUserAgent(typeof m.userAgent === "string" ? m.userAgent : null);
  if (browser) lines.push(browser);
  return lines;
}
