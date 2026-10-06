import { randomBytes } from "node:crypto";
import { sha256Hex } from "@/lib/hash";

// Signing-link tokens: 256 random bits, base64url-encoded (43 characters).
// Only their SHA-256 is stored, so the database never holds a usable link;
// the token is shown once, when the link is issued.

export const SIGNING_LINK_TTL_DAYS = 14;
// After execution the counterparty's link stays readable (status + executed
// PDF) for at least this long, so they can retrieve the final document.
export const RECEIPT_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function newSigningToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSigningToken(token) };
}

export function hashSigningToken(token: string): string {
  return sha256Hex(new TextEncoder().encode(token));
}

// Rejects anything that cannot be a token before it reaches the database.
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_FORMAT.test(token);
}

export function linkExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + SIGNING_LINK_TTL_DAYS * DAY_MS);
}

export function receiptWindowEnd(executedAt: Date): Date {
  return new Date(executedAt.getTime() + RECEIPT_WINDOW_DAYS * DAY_MS);
}

export function signingPath(token: string): string {
  return `/s/${token}`;
}
