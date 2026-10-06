import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// Signing links in the outbox. Everywhere else only a SHA-256 of a link's
// token exists, so the database alone never yields a usable link. A message
// still has to carry its link until it is delivered (and the demo outbox
// shows it), so the outbox stores it encrypted:
//
//   v1.<key id>.<iv>.<ciphertext>.<tag>   (AES-256-GCM, base64url parts)
//
// The ciphertext is bound to the SigningLink row it belongs to (additional
// authenticated data), so it cannot be moved onto another link's message.
// The key id is a short fingerprint of the key, so a message encrypted under
// a different key is reported as unreadable instead of failing obscurely.
// A CHECK constraint (OutboundMessage_link_is_ciphertext) rejects any value
// not in this shape, which a raw token can never match.
//
// Key: OUTBOX_ENCRYPTION_KEY, at least 32 characters, required in production
// (fail closed, like AUDIT_IP_HMAC_KEY). Development and tests fall back to a
// fixed, public development key — never secret, never valid in production.

export class MissingOutboxKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingOutboxKeyError";
  }
}

const DEVELOPMENT_KEY = "countersign-development-only-outbox-key (public, not a secret)";
const VERSION = "v1";

type OutboxKey = { key: Buffer; id: string };

export function outboxKey(env: NodeJS.ProcessEnv = process.env): OutboxKey {
  const configured = env.OUTBOX_ENCRYPTION_KEY;
  if (configured && configured.length < 32) {
    throw new MissingOutboxKeyError("OUTBOX_ENCRYPTION_KEY must be at least 32 characters.");
  }
  if (!configured && env.NODE_ENV === "production") {
    throw new MissingOutboxKeyError(
      "OUTBOX_ENCRYPTION_KEY (at least 32 characters) is required in production.",
    );
  }
  const secret = configured || DEVELOPMENT_KEY;
  const key = Buffer.from(hkdfSync("sha256", secret, "", "countersign outbox signing link", 32));
  const id = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return { key, id };
}

const aad = (signingLinkId: string) => Buffer.from(`countersign-outbox-link:${signingLinkId}`);

export function encryptLinkToken(
  token: string,
  signingLinkId: string,
  { key, id }: OutboxKey = outboxKey(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(signingLinkId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    VERSION,
    id,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export type DecryptedLink =
  | { ok: true; token: string }
  | { ok: false; reason: "other_key" | "corrupt" };

export function decryptLinkToken(
  sealed: string,
  signingLinkId: string,
  { key, id }: OutboxKey = outboxKey(),
): DecryptedLink {
  const parts = sealed.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) return { ok: false, reason: "corrupt" };
  const [, keyId, iv, ciphertext, tag] = parts;
  if (keyId !== id) return { ok: false, reason: "other_key" };
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(aad(signingLinkId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const token = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return { ok: true, token };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}
