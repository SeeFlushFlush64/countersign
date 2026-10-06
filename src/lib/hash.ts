import { createHash, createHmac } from "node:crypto";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;

// Keyed hash of an IP address for the audit log. An unkeyed hash of an IPv4
// address is trivially reversible (there are only 2^32 of them).
export function hashIp(ip: string, secret: string | undefined): string | null {
  if (!secret || !ip) return null;
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
