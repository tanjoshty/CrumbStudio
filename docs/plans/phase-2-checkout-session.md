# Phase 2 — Checkout API & slot reservation

**Status:** **Done** — 2026-08-20
**Depends on:** Phase 1 (`assertCapacity`)
**Blocks:** Phases 3, 4

## Goal

Turn `POST /api/checkout` into the trusted path: validate the cart, recompute
prices from Sanity, reserve the capacity, create a Stripe Checkout Session, and
return its client secret. The browser supplies intent; the server decides
everything that matters.

## Current state

```ts
// app/api/checkout/route.ts — the whole thing today
const { lineItems } = await req.json()
console.log('lineItems: ', lineItems)
return NextResponse.json({ message: "hi" })
```

`CheckoutForm` posts `{ price, quantity: 1 }` per item from a `useEffect` that
re-runs on every cart change. Both sides get replaced here and in Phase 3.

## Scope

**In:** request validation, authoritative pricing, capacity reservation,
customer upsert, Stripe session creation.

**Out:** the embedded payment UI (Phase 3) and the webhook that confirms the
order (Phase 4).

## Design notes

### The pending order is the reservation

Per [C2](./README.md#c2--reservation-model-pending-order-rows-decided-2026-08-20):
this route writes the `order` + `order_item` rows immediately with
`status = 'pending'`, and that row *is* the held slot. Phase 4's webhook flips it
to `confirmed`.

Two columns must be added to `"order"` — in `db/schema.sql` **and** as a matching
`ALTER TABLE` (no migration tool; the file and the live DB drift silently
otherwise):

- `stripe_session_id text UNIQUE` — the webhook's idempotency key.
- `hold_expires_at timestamptz` — so an abandoned checkout stops consuming
  capacity even if Stripe's `expired` event is missed. **45 minutes**
  *(decided 2026-08-20)*, against Stripe's ~24h default: with Mon–Thu sharing
  one weekly slot, a day-long hold lets one abandoned checkout block half a
  week. Pass a matching `expires_at` when creating the Stripe session so the
  session and the hold expire together — otherwise the slot frees while the
  customer still has a live payment form open, and they can pay for a slot that
  is gone.

Because pending rows are real rows, **every** query that means "actual orders"
must exclude `pending` — admin lists, totals, the confirmation email.

### Never trust the posted cart

The client sends product ids, size keys, quantities, dates and notes — never
prices. The server fetches each product from Sanity and reads
`sizes[_key == $sizeKey].price`. If a posted price disagrees, ignore it; if the
product is inactive or the size key is gone, reject the line with a message the
UI can show. This is what makes [C4](./README.md#c4--one-cake-per-line-add-sizekey-decided-2026-08-20)
(adding `sizeKey` to `CartItem`) a prerequisite rather than a nicety. `quantity`
is written as `1` per line — C4 decided against cart quantity controls.

`lib/sanity/queries.ts` currently has no projection — both queries return whole
documents. Add a narrow pricing query rather than reusing `PRODUCT_QUERY`.

### Guests are first-class

`customer.user_id` is nullable with a CHECK that a `user_id` or `email` exists.
Upsert on `user_id` when signed in, otherwise create a guest row from the email.
Do not dedupe guests by email — the UNIQUE constraint is on `user_id` only, and
merging guest history by email is a decision, not a default.

### Keep it reusable

Per `CLAUDE.md`, order placement lives in a service function
(`lib/orders/service.ts`), not inline in the route, so an Instagram-DM order can
reuse the same path later. The route handles HTTP; the service handles the
transaction.

### Stripe

Inline `price_data` (no Stripe Products), `ui_mode: 'embedded'`, amounts in
cents from the Sanity price, and the order/session id in `metadata` so Phase 4
can tie the webhook back. Target the sandbox account
(`acct_1TrejQA19fZk2KsN`).

## Tasks

- [x] Add `stripe_session_id text UNIQUE` and `hold_expires_at timestamptz` to
      `"order"` in `db/schema.sql`; apply the matching `ALTER TABLE`.
- [x] Add `sizeKey` to `CartItem` and set it in the PDP add-to-cart path.
- [x] Add a pricing projection to `lib/sanity/queries.ts`.
- [x] Add `lib/orders/service.ts` — validate → price → capacity → customer
      upsert → reserve → Stripe session, in one transaction where possible.
- [x] Rewrite `app/api/checkout/route.ts` to parse/validate the body, call the
      service, and return `{ clientSecret }`.
- [x] Re-check capacity inside the reservation write, not just before it — two
      concurrent checkouts must not both take the last slot. A unique constraint
      or `SELECT … FOR UPDATE` on the pool-week, not an application-level check.
- [x] Return typed, user-showable errors for: past/closed date, no capacity,
      inactive product, price/variant mismatch, empty cart.

## Files

- `app/api/checkout/route.ts` (rewrite)
- `lib/orders/service.ts` (new)
- `lib/sanity/queries.ts` (edit)
- `types/cart.types.ts` (edit)
- `db/schema.sql` (edit + apply)

## Done when

- Posting a valid cart returns a client secret and leaves a `pending` order in
  Supabase with its `stripe_session_id` and `hold_expires_at` set.
- Posting a tampered price is ignored; the session total matches Sanity.
- Posting a full or closed date returns a 4xx with a usable message.
- Two concurrent requests for the last slot: exactly one succeeds.

## Outcome

Shipped 2026-08-20. 61 unit tests, `tsc` and `eslint` clean.

### The concurrency fix moved logic into SQL

The plan called for "a unique constraint or `SELECT … FOR UPDATE`". PostgREST can
express neither, so `db/functions.sql` now holds `place_order_hold`, which takes
a `pg_advisory_xact_lock` per pool-week (ordered, so two multi-week carts cannot
deadlock), re-counts capacity under that lock, and inserts — one transaction.

That put the counting in SQL, so rather than keep a second copy in TypeScript,
`lib/capacity/service.ts` was rewritten to read through the same
`capacity_availability` function. The calendar and the reservation can no longer
disagree about what "full" means, which was the risk flagged in Phase 1.

Verified: three simultaneous requests for a one-slot pool-week, exactly one
`clientSecret`, exactly one slot consumed.

### Structure: pure core, IO shell

Added for testability, and it improved the layering: `lib/capacity/rules.ts` and
`lib/orders/{types,pricing,parse,errors}.ts` are pure; the two `service.ts`
files are the only things that touch Postgres, Sanity or Stripe. The suite runs
offline in under a second with no mocks.

### Bug found while testing

The `variations` snapshot took the size **label from the client** while pricing
from the authoritative `_key`. A payload whose label disagreed with its key
recorded a 6 Inch cake on an order charged $150 for an 8 Inch — and the baker
reads that field to decide what to bake. `buildPricedLines` now snapshots the
catalogue's label. Two regression tests cover it.

### Deviations from the plan

- `ui_mode: 'embedded'` does not exist in the Stripe SDK v22 — it is
  `'embedded_page'` (`'hosted'` → `'hosted_page'`). Phase 3 needs the same care.
- `CheckoutForm`'s cart-keyed `useEffect` was removed here rather than in Phase
  3: against this code it would mint a pending order and burn a 45-minute hold
  on every cart change.
- Persisted carts are dropped (`version: 2`). A stored size label cannot be
  turned back into a `_key`, so v1 lines would fail server-side.
- **Currency is hardcoded `aud`** in `lib/orders/service.ts`. Assumed, never
  confirmed.
