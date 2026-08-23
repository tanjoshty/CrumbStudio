# Phase 5 — Confirmation email

**Status:** In review (2026-08-21) — code complete. Provider chosen (Resend);
awaiting the manual `ALTER TABLE`, a verified sending domain + env values, and a
live send test.
**Depends on:** Phase 4 (fires on confirmation)

## Goal

The customer gets an order confirmation; the baker gets told a new order landed.
For a made-to-order business the notification *is* the workflow — an order
nobody sees is an order nobody bakes.

## Scope

**In:** transactional send on confirmation, customer receipt, baker notification.

**Out:** marketing email, status-change emails ("your cake is ready") — those
belong with the admin status transitions in Phase 6a.

## Design notes

### Provider

**Decided (2026-08-21): Resend.** Its free tier (3,000/month, 100/day, 1 domain)
comfortably covers a made-to-order business, and the SDK is the path of least
resistance with Next. Sending domain is a CrazyDomains-registered domain, being
verified in Resend (DKIM/SPF DNS records) in parallel — DNS propagation is the
long pole, so the code was built against env vars to not block on it:
`RESEND_API_KEY`, `EMAIL_FROM`, `BAKER_EMAIL`.

### Sending must not break the webhook

Called from `confirmOrder` **after** the `pending → confirmed` flip commits,
never before — a `pending` order is an attempt, and emailing a receipt for one
that never pays is worse than a late email. A provider outage must not fail the
webhook —
Stripe would retry, and a retry that re-sends email is worse than a missed
email. Send after the DB commit, catch and log failures, and always return 2xx.
If reliable delivery matters more than simplicity, queue the send and let a
worker retry; skip the queue until it earns its place.

### Idempotency

Phase 4's dedupe covers replays only if the send sits inside the
"already confirmed → no-op" branch. A `confirmation_sent_at` column on `"order"`
makes it explicit and doubles as a resend affordance for the admin.

### Content

Customer: order id, per-item name/size/flavour/colour/date/notes, total,
pickup vs delivery (with address), and the 72-hour cancellation line already
shown at checkout. Baker: the same, sorted by fulfilment date, since that is
the bake queue.

Per-item fulfilment dates mean one order can span several days — say so
explicitly in the email rather than showing a single date.

## Tasks

- [x] Pick a provider (Resend). Verify the sending domain — **pending (DNS at CrazyDomains)**.
- [x] Add `lib/email/` — `client.ts` (Resend singleton), `templates.ts`
      (render per template), `send.ts` (both, independent + idempotent-friendly),
      `types.ts`.
- [x] Customer confirmation template — inline styles + table layout, brand
      palette, per-item detail, multi-date note, pickup/delivery + address,
      72-hour line, plain-text fallback.
- [x] Baker notification template — sorted by fulfilment date (the bake queue).
- [x] Call from `confirmOrder` after commit (`lib/orders/confirmation.ts`);
      failures log, never throw; stamps `confirmation_sent_at`.
- [x] Add `confirmation_sent_at` to `"order"` — in `db/schema.sql`. **The
      `ALTER TABLE` must be run manually** (see below); the MCP connection is
      read-only.
- [x] Test rendering — 9 unit tests over the templates (content, escaping,
      multi-date, sort order) + local HTML previews; plain-text fallback checked.
      Cross-client visual check pending a live send.

## Manual step — run before testing

```sql
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
```

Then set `RESEND_API_KEY`, `EMAIL_FROM`, `BAKER_EMAIL` in
`apps/frontend/.env.local` and restart dev.

## Files

- `lib/email/*` (new)
- `lib/orders/service.ts` (extend)
- `db/schema.sql` (edit + apply)

## Done when

- A sandbox payment produces both emails with correct per-item detail.
- A provider outage leaves the order confirmed and the webhook returning 2xx.
- A replayed webhook does not re-send.
