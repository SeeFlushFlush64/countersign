# Deployment checklist

Countersign is not deployed. This file records what must be true before it
is, and the security assumptions a deployment relies on. Items marked
**Blocker** must be resolved first; do not deploy while any is open.

## Blockers

### 1. Public landing-page activity feed must be removed — **Blocker**

An uncommitted marketing landing page (`src/app/page.tsx` on the `main`
working tree, not part of this branch) renders a live activity feed from
`StatusEvent` to anonymous visitors: agreement titles and party names. When
that work is integrated, the feed must be removed (or replaced with static
illustration content) before any deployment.

Integrating it is otherwise safe with this branch: every internal page and
the company PDF route verify the session themselves, so making `/` public in
the proxy does not expose agreement data. `test/public-surface.test.ts`
checks this for every internal page.

### 2. Production audit key

Set `AUDIT_IP_HMAC_KEY` (at least 32 random characters) in the production
environment. Without it, counterparty actions fail closed in production
(`MissingAuditKeyError`) rather than recording unkeyed request context.
Treat it like any secret; rotating it only affects how new IP hashes are
computed (old hashes are never compared across keys).

## Production database migration

1. Read-only first: `prisma migrate status` against the production database.
2. Read-only pre-check that existing rows satisfy the Phase B/C constraints
   (they are validated when added; a violation aborts that migration
   cleanly — each is wrapped in a transaction — but Prisma then records it
   as failed and `prisma migrate resolve --rolled-back` is needed before a
   retry).
3. `prisma migrate deploy` (never `migrate reset` or `db push`).
4. Seed only deliberately: `SEED_ALLOW_REMOTE=1 npm run seed`.

### Existing agreements need new signing links

Links issued before Phase C were the counterparty signer's raw row id. They
no longer work and are not migrated (no secure token can be derived for
them). After migrating, every agreement still awaiting the counterparty
needs **Reissue signing link** from its agreement page; the new link is
shown once and must be sent to the counterparty again.

### Rollback

Application code from before a migration cannot run against the migrated
schema (Phase B code writes statuses and audit events the new constraints
reject). Roll back by redeploying the matching application version *and*
restoring the database from backup, not by redeploying old code alone.

## Trust assumptions

### Client IP addresses (audit only)

Counterparty views and signatures record a keyed HMAC of the client IP,
never the raw address. The IP is read from `x-vercel-forwarded-for`, then
`x-real-ip`, then the first `x-forwarded-for` entry. These are trustworthy
only behind a proxy that sets them itself — Vercel's edge, per its
documented request headers (verify for the deployment target). Anywhere
else they are client-controlled, so the hash is supporting audit evidence of
the address the request presented, never an authorization input.

### Signing links

A signing link is a bearer credential: 256 random bits, stored only as a
SHA-256, valid for 14 days (30 days read-only after execution), revoked by
reissue or void. The token is in the URL path, so it can appear in hosting
request logs and browser history; responses under `/s/` send
`Referrer-Policy: no-referrer`, `Cache-Control: no-store` and
`X-Robots-Tag: noindex`. Anyone holding the link can act as the
counterparty — there is no second factor (out of scope).

### Audit log

`StatusEvent` is append-only (a trigger rejects UPDATE/DELETE) and every new
event names a verifiable actor. This protects against application bugs and
ordinary SQL mistakes, not against a database owner, who can disable
triggers; there is no hash chain.
