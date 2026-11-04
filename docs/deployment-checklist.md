# Deployment checklist

What a Countersign deployment needs, and the security assumptions it relies
on. Items marked **Required** must be in place before a deployment takes
traffic. Last reviewed 2026-11-04.

## Scope

Countersign is a narrow product: the counterparty signs first, then the
designated company countersigner, enforced server-side. Scope lock of
2026-10-06, reaffirmed 2026-11-04: **no Google Drive archive, no outbound
webhooks, no email integration** (see "No third-party integrations" below).

## Current deployment

- **Host:** Vercel project `countersign-demo` (Hobby scope), function region
  `sin1`, Node 24. Database: Neon project `countersign-demo` (Singapore,
  Postgres 18).
- **Deploys:** uploaded with the Vercel CLI from a clean `git archive`
  export. The project has no Git link yet, so no branch deploys on push.
- **Access:** Vercel Authentication is on, so anonymous visitors are sent to
  Vercel sign-in. The app is not public until that is changed on purpose.
- **Domain:** none. `countersign-demo-seven.vercel.app` is the only alias.
- **Sample-workspace guards:** epochs, idle reset, limits, noindex and
  Chromium packaging are part of the main code and switch on with `DEMO_MODE=1`.

## Required

### 1. Public landing page

`/` is static marketing content and reads no agreement data. Every internal
page and the company PDF route verify the session themselves, so making `/`
public in the proxy exposes nothing. `test/public-surface.test.ts` checks
this for every internal page; keep it passing if `/` ever gains data.

### 2. Production audit key

Set `AUDIT_IP_HMAC_KEY` (at least 32 random characters) in the production
environment. Without it, counterparty actions fail closed in production
(`MissingAuditKeyError`) rather than recording unkeyed request context.
Treat it like any secret; rotating it only affects how new IP hashes are
computed (old hashes are never compared across keys).

### 3. Delivery configuration and outbox key

Set both in the production environment:

- `DELIVERY_MODE=demo-outbox`. It is the only mode: no email integration
  exists, and any other value (or none, in production) makes every delivery
  fail with a configuration error, recorded on the message, visible in the
  outbox, retryable once fixed. Agreements are never affected.
- `OUTBOX_ENCRYPTION_KEY` (at least 32 random characters). Without it, send
  and reissue fail closed in production (`MissingOutboxKeyError`) before
  anything changes. Treat it like any secret. Messages sealed under another
  key (e.g. seeded with the development key) are shown as unreadable and
  their delivery fails; rotating the key does the same to links already in
  the outbox (reissue to get a new one). Set it before seeding production.

### 4. No third-party integrations

By decision (scope lock), executed PDFs are `DocumentArtifact` rows in the
database and nothing is pushed to Google Drive, a webhook receiver or an
email provider. An earlier Drive upload was removed and must not be brought back.
`test/production-integrations.test.ts` fails if any source file imports
Google APIs or an email SDK, or reads their credentials.

### 5. Sample workspace: `DEMO_MODE` and the connection strings

- Set `DEMO_MODE=1` only on the hosted sample workspace. It turns on epochs,
  the idle reset and the per-epoch limits (see the README). Do not set it
  anywhere that holds real agreements.
- `DATABASE_URL` is the pooled connection (Neon's `-pooler` host, with
  `sslmode=verify-full`). `DIRECT_URL` is the direct connection and is used
  only by `npm run db:*` on a developer machine; never upload it to Vercel.
- Put the Neon function region next to the Vercel region (both Singapore).

## Production database migration

1. Read-only first: `prisma migrate status` against the production database.
2. Read-only pre-check that existing rows satisfy the Phase B/C constraints
   (they are validated when added; a violation aborts that migration
   cleanly, each is wrapped in a transaction, but Prisma then records it
   as failed and `prisma migrate resolve --rolled-back` is needed before a
   retry).
3. `prisma migrate deploy` (never `migrate reset` or `db push`).
4. Seed only deliberately: `SEED_ALLOW_REMOTE=1 npm run seed`.

Phase D read-only pre-check: every stored artifact hash must match its bytes,
or `delivery_storage` aborts (cleanly, but then needs `migrate resolve
--rolled-back`):

```sql
SELECT "id" FROM "DocumentArtifact"
 WHERE "pdfData" IS NOT NULL AND "sha256" IS DISTINCT FROM encode(sha256("pdfData"), 'hex');
SELECT "id" FROM "DocumentArtifact" WHERE "status" <> 'READY' AND "pdfData" IS NOT NULL;
```

Both must return no rows.

### Legacy PDF columns

`Document.pdfData`/`pdfUrl` are no longer written or read: draft previews are
`PREVIEW` artifacts (backfilled with their hash; a draft without stored bytes
gets a `PENDING` preview, rendered when first opened). The columns are kept
because migrations are additive; dropping them is a separate, deliberate
step once production has been verified.

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
only behind a proxy that sets them itself, Vercel's edge, per its
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
counterparty, there is no second factor (out of scope).

### Outbox and signing links

Delivery is at-least-once through a transactional outbox: a message is
written in the same transaction as the step that causes it and delivered
after commit; a failure is recorded on the message (`FAILED`, with the
error) and retried, automatically up to three attempts and by hand after
that. There is no background worker: queued and failed messages are
delivered after each step, from **Outbox → Deliver queued messages**, or by
**Retry delivery**. A deployment that needs unattended retries must call
`dispatchDueMessages` on a schedule (not implemented).

Signature requests carry the counterparty's link, so the outbox stores it
AES-256-GCM encrypted under `OUTBOX_ENCRYPTION_KEY` and bound to its
`SigningLink` row; a CHECK constraint rejects anything but ciphertext. The
database alone therefore still never yields a usable link, but the database
plus the key does. The outbox stands in for the counterparty's
inbox: the agreement's sender and designated countersigner can open the
link there while it works (the same people who can already reissue it).
A message whose link was replaced, voided or expired is cancelled, never
delivered.

### Audit log

`StatusEvent` is append-only (a trigger rejects UPDATE/DELETE) and every new
event names a verifiable actor. This protects against application bugs and
ordinary SQL mistakes, not against a database owner, who can disable
triggers; there is no hash chain.
