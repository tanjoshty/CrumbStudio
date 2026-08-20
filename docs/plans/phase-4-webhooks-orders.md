# Phase 4 — Webhooks & order lifecycle

**Status:** Not started
**Depends on:** Phase 2 (reservation + `stripe_session_id`)
**Blocks:** Phases 5, 6

## Goal

Make Stripe the trigger that turns a reservation into a real, confirmed order —
and the trigger that releases the slot when payment never happens. This is the
only writer of confirmed orders.

## Scope

**In:** `app/api/webhooks/stripe`, signature verification, idempotent order
confirmation, slot release, and expiry sweeping.

**Out:** the email that goes out on confirmation (Phase 5) — but this is where
it gets called from.

## Design notes

### Verification and runtime

Verify `stripe-signature` with `STRIPE_WEBHOOK_SECRET` against the **raw** body
(`await req.text()`, never `req.json()` — parsing breaks the signature). Next 16
route handlers get the raw body from `text()`; do not add body parsing config
from older Next guidance. Unverified requests get a 400 and no side effects.

### Events

- `checkout.session.completed` — look the order up by `stripe_session_id` and
  flip `pending → confirmed`. The row and its items already exist from Phase 2
  ([C2](./README.md#c2--reservation-model-pending-order-rows-decided-2026-08-20));
  `unit_price` and `delivery_address` were snapshotted there, so this handler
  should **not** rewrite them from the Stripe payload.
- `checkout.session.expired` — release the slot: `pending → cancelled`.
- `checkout.session.async_payment_failed` — same release path.

If `completed` arrives for a session with no matching order row, that is a real
error worth logging loudly — it means Phase 2 created a session without a hold.

Ignore everything else with a 200; an unhandled event is not an error.

### Idempotency is not optional

Stripe retries, and delivers out of order. Key on `stripe_session_id UNIQUE` and
make confirmation a no-op when the order is already `confirmed`. Because Phase 2
wrote the rows, this handler is a status update rather than an insert, which
makes it easy — but still guard it, and never let a late `expired` cancel an
order that `completed` already confirmed. Branch on the row's current status,
not on the order the events arrived in. Return 2xx for duplicates — a 500 just
buys another retry.

### Expiry is not guaranteed

`checkout.session.expired` fires ~24h after creation and can be missed entirely.
That is why `"order".hold_expires_at` exists: Phase 1's capacity query ignores
`pending` rows past their expiry, so an abandoned checkout stops blocking a slot
whether or not the event ever arrives. The webhook is the tidy path; the expiry
column is the guarantee. Optionally add a sweeper that flips long-expired
`pending` rows to `cancelled` so the admin list does not accumulate them.

### Local testing

`stripe listen --forward-to localhost:3000/api/webhooks/stripe` against the
sandbox account; its printed signing secret is the local
`STRIPE_WEBHOOK_SECRET`. The deployed endpoint gets its own separate secret.

## Tasks

- [ ] Add `STRIPE_WEBHOOK_SECRET` to `.env.local`.
- [ ] Add `app/api/webhooks/stripe/route.ts` — raw-body signature verification,
      event switch, 200 for unhandled types.
- [ ] Implement `confirmOrder(sessionId)` in `lib/orders/service.ts` —
      `pending → confirmed`, idempotent on `stripe_session_id`, a no-op if
      already confirmed, and never resurrecting a `cancelled` order.
- [ ] Implement `releaseReservation(sessionId)` — `pending → cancelled` — for
      expiry and async failure.
- [ ] Optional sweeper: flip long-expired `pending` rows to `cancelled` so they
      do not pile up (capacity already ignores them via `hold_expires_at`).
- [ ] Ensure `proxy.ts` does not intercept or redirect `/api/webhooks/*` —
      Stripe cannot follow an auth redirect.
- [ ] Test with `stripe listen`: success, expiry, decline, and a replayed
      duplicate event.

## Files

- `app/api/webhooks/stripe/route.ts` (new)
- `lib/orders/service.ts` (extend)
- `proxy.ts` (verify exclusion)

## Done when

- A completed sandbox payment leaves exactly one `confirmed` order with correct
  totals, per-item dates and variations — and no duplicated items.
- Replaying the same event changes nothing and returns 2xx.
- An expired session frees the slot, and so does an abandoned one whose
  `expired` event never arrives (via `hold_expires_at`).
- A late `expired` event cannot cancel an already-confirmed order.
- A forged signature is rejected with no DB write.
