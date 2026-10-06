import { headers } from "next/headers";
import { hashIp } from "@/lib/hash";

// Audit context for counterparty actions, read on the server from the
// request — never from anything the client chooses to send.
//
// Privacy: a raw IP address is never stored. It is reduced to an HMAC keyed
// with AUDIT_IP_HMAC_KEY (an unkeyed hash of an IPv4 address is trivially
// reversible) and the user agent is truncated. The key is separate from
// AUTH_SECRET so rotating session secrets never changes audit hashes.
//
// Trust: the client IP comes from proxy headers. Countersign is deployed
// behind Vercel's edge, which sets x-vercel-forwarded-for / x-real-ip itself
// (see deployment notes in docs/deployment-checklist.md). Without such a
// trusted proxy in front, these headers are client-controlled, so the hash
// identifies "the address this request claimed", not a verified address. It
// is supporting audit evidence, never an authorization input.

export type RequestContext = { ipHash: string | null; userAgent: string | null };

export class MissingAuditKeyError extends Error {}

export function auditIpKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env.AUDIT_IP_HMAC_KEY;
  if (key && key.length >= 32) return key;
  if (env.NODE_ENV === "production") {
    // Fail closed: production must never silently record unhashed or
    // unattributable request context.
    throw new MissingAuditKeyError(
      "AUDIT_IP_HMAC_KEY (at least 32 characters) is required in production.",
    );
  }
  return undefined; // development and tests: no IP is recorded at all
}

export function clientIp(h: Headers): string {
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const userAgent = h.get("user-agent");
  return {
    ipHash: hashIp(clientIp(h), auditIpKey()),
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
  };
}
