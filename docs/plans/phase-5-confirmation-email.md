# Phase 5 — Confirmation email

**Status:** Not started
**Depends on:** Phase 4 (fires on confirmation)

## Goal

The customer gets an order confirmation; the baker gets told a new order landed.
For a made-to-order business the notification *is* the workflow — an order
nobody sees is an order nobody bakes.

## Scope

**In:** transactional send on confirmation, customer receipt, baker notification.

**Out:** marketing email, status-change emails ("your cake is ready") — those
belong with the admin status transitions in Phase 6.

## Design notes

### Provider

No email dependency exists yet. Resend is the path of least resistance with
Next; SES is cheaper and already in the AWS account the app deploys to (Phase
7), at the cost of domain verification and a sandbox-removal request. Either
needs a verified sending domain — start that early, DNS propagation is the long
pole.

**Decision needed:** provider and sending domain.

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

- [ ] Pick a provider; verify the sending domain.
- [ ] Add `lib/email/` — client plus a render function per template.
- [ ] Customer confirmation template (brand: cream/ink/burgundy, Barlow
      Condensed headings — but inline styles and table layout, not Tailwind).
- [ ] Baker notification template.
- [ ] Call from `confirmOrder` after commit; failures log, never throw.
- [ ] Add `confirmation_sent_at` to `"order"` (schema + `ALTER TABLE`).
- [ ] Test rendering in a few clients; check the plain-text fallback.

## Files

- `lib/email/*` (new)
- `lib/orders/service.ts` (extend)
- `db/schema.sql` (edit + apply)

## Done when

- A sandbox payment produces both emails with correct per-item detail.
- A provider outage leaves the order confirmed and the webhook returning 2xx.
- A replayed webhook does not re-send.
